-- Studio catalogue: a studio can customise a standard partida by creating its own partida with
-- the same code. The studio's version then replaces the standard one everywhere (pickers, room
-- templates). An inactive studio version hides that standard partida for the studio.

-- The partida a studio uses for a given partida: its own same-code version if it has one
-- (null when that version is inactive = hidden), otherwise the partida itself.
create or replace function public.studio_partida(p_org uuid, p_partida uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
           when own.id is null then p.id
           when own.active then own.id
           else null
         end
  from public.partidas p
  left join public.partidas own
    on own.organization_id = p_org and own.region_id = p.region_id and own.code = p.code and own.id <> p.id
  where p.id = p_partida;
$$;
revoke all on function public.studio_partida(uuid, uuid) from public, anon;
grant execute on function public.studio_partida(uuid, uuid) to authenticated;

-- Room templates use the studio's version of each partida, and skip hidden ones.
create or replace function public.apply_room_template(
  p_version uuid, p_template uuid, p_size numeric, p_label text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_org   uuid;
  v_count integer;
begin
  select organization_id into v_org from public.versions where id = p_version;
  if v_org is null then
    raise exception 'version not found';
  end if;
  if not exists (select 1 from public.room_templates where id = p_template) then
    raise exception 'template not found';
  end if;

  insert into public.line_items
    (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state, room)
  select v_org, p_version, x.partida_id, x.quantity,
         cp.unit_price, cp.price_id, cp.confidence,
         case when cp.unit_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         x.room
  from (
    select public.studio_partida(v_org, tl.partida_id) as partida_id,
           round(tl.factor * coalesce(p_size, 0) + tl.fixed, 3) as quantity,
           coalesce(nullif(trim(p_label), ''), t.name) as room,
           tl.sequence
    from public.room_template_lines tl
    join public.room_templates t on t.id = tl.template_id
    where tl.template_id = p_template
  ) x
  left join public.current_prices(v_org) cp on cp.partida_id = x.partida_id
  where x.partida_id is not null and x.quantity > 0
  order by x.sequence;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
