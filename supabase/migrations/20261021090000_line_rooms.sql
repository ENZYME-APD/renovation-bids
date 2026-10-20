-- Rooms on budget lines: each line can belong to a room (Cocina, Baño principal…) so a budget
-- can be read by chapter or by room. Room templates now fill this field instead of notes.

alter table public.line_items add column room text;
comment on column public.line_items.room is 'Room or area the line belongs to (optional).';

-- Until now the room template label was written into notes; move it.
update public.line_items set room = notes, notes = null where notes is not null and room is null;

create index line_items_version_room_idx on public.line_items (version_id, room);

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
  select v_org, p_version, tl.partida_id,
         round(tl.factor * coalesce(p_size, 0) + tl.fixed, 3),
         cp.unit_price, cp.price_id, cp.confidence,
         case when cp.unit_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         coalesce(nullif(trim(p_label), ''), t.name)
  from public.room_template_lines tl
  join public.room_templates t on t.id = tl.template_id
  left join public.current_prices(v_org) cp on cp.partida_id = tl.partida_id
  where tl.template_id = p_template
    and round(tl.factor * coalesce(p_size, 0) + tl.fixed, 3) > 0
  order by tl.sequence;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
