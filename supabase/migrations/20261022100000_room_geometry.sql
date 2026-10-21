-- Rooms with geometry. A room has an area (or a count, for per-unit templates), a perimeter and
-- a height, from whatever source: Archicad zones, another model, a dimensioned sketch read by
-- Claude, or typed in. Template lines can now scale with the floor (size), the perimeter
-- (skirting) or the wall area = perimeter × height − openings (paint, tiling).
-- A missing perimeter is estimated from the area as a 1:1.5 rectangle and flagged.

-- ── Template coefficients ────────────────────────────────────────────────────
alter table public.room_template_lines
  add column per_perimeter numeric(10, 4) not null default 0,
  add column per_wall_area numeric(10, 4) not null default 0;
comment on column public.room_template_lines.factor is 'Quantity per unit of the room size (m² of floor, or per window…).';
comment on column public.room_template_lines.per_perimeter is 'Quantity per metre of room perimeter (skirting, cornice).';
comment on column public.room_template_lines.per_wall_area is 'Quantity per m² of wall: perimeter × height − openings (paint, tiling).';

-- quantity = factor × size + per_perimeter × perimeter + per_wall_area × wall area + fixed
create or replace function public.room_line_quantity(
  p_factor numeric, p_per_perimeter numeric, p_per_wall_area numeric, p_fixed numeric,
  p_size numeric, p_perimeter numeric, p_height numeric, p_openings numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce(p_factor, 0) * coalesce(p_size, 0)
    + coalesce(p_per_perimeter, 0) * coalesce(p_perimeter, 0)
    + coalesce(p_per_wall_area, 0) * greatest(coalesce(p_perimeter, 0) * coalesce(p_height, 0) - coalesce(p_openings, 0), 0)
    + coalesce(p_fixed, 0), 3);
$$;
grant execute on function public.room_line_quantity(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Perimeter of a 1:1.5 rectangle with this area: 5 × √(A / 1.5) ≈ 4.08 √A
create or replace function public.estimate_perimeter(p_area numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select round(5 * sqrt(greatest(coalesce(p_area, 0), 0) / 1.5), 2); $$;
grant execute on function public.estimate_perimeter(numeric) to authenticated;

-- Standard templates: walls by wall area, skirting by perimeter. Studio copies that still carry
-- the old standard ratio are converted too; customised ratios are left alone.
with conv(tpl, partida, old_factor, factor, per_perimeter, per_wall_area, note) as (values
  ('DOR', 'PAV-060', 0.9, 0.0, 1.0, 0.0, 'Perímetro de la estancia'),
  ('SAL', 'PAV-060', 0.9, 0.0, 1.0, 0.0, 'Perímetro de la estancia'),
  ('PAS', 'PAV-060', 1.6, 0.0, 1.0, 0.0, 'Perímetro de la estancia'),
  ('DOR', 'PIN-010', 2.4, 0.0, 0.0, 1.0, 'Superficie de paredes: perímetro × altura − huecos'),
  ('SAL', 'PIN-010', 2.4, 0.0, 0.0, 1.0, 'Superficie de paredes: perímetro × altura − huecos'),
  ('PAS', 'PIN-010', 3.5, 0.0, 0.0, 1.0, 'Superficie de paredes: perímetro × altura − huecos'),
  ('LAV', 'PIN-010', 2.4, 0.0, 0.0, 1.0, 'Superficie de paredes: perímetro × altura − huecos'),
  ('COC', 'PIN-010', 1.6, 0.0, 0.0, 0.65, 'Paredes sin frente de muebles ni alicatado (≈65%)'),
  ('BAN', 'REV-010', 3.7, 0.0, 0.0, 1.0, 'Alicatado hasta techo: perímetro × altura − huecos'),
  ('ASE', 'REV-010', 3.7, 0.0, 0.0, 1.0, 'Alicatado hasta techo: perímetro × altura − huecos'),
  ('DBA', 'DEM-090', 4.7, 1.0, 0.0, 1.0, 'Suelo + paredes alicatadas')
)
update public.room_template_lines tl
set factor = c.factor, per_perimeter = c.per_perimeter, per_wall_area = c.per_wall_area, note = c.note
from conv c, public.room_templates t, public.partidas p
where t.id = tl.template_id and t.code = c.tpl
  and p.id = tl.partida_id and p.code = c.partida
  and tl.factor = c.old_factor and tl.per_perimeter = 0 and tl.per_wall_area = 0;

-- Studio copies carry the new coefficients
create or replace function public.copy_room_template(
  p_org uuid, p_template uuid, p_code text default null, p_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  src   public.room_templates;
  v_id  uuid;
  v_code text;
begin
  select * into src from public.room_templates where id = p_template;
  if src.id is null then
    raise exception 'template not found';
  end if;
  v_code := coalesce(nullif(trim(p_code), ''), src.code);

  select id into v_id from public.room_templates
  where organization_id = p_org and region_id = src.region_id and code = v_code;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.room_templates
    (region_id, organization_id, code, name, size_label, description, sequence, active, match_terms)
  values
    (src.region_id, p_org, v_code, coalesce(nullif(trim(p_name), ''), src.name), src.size_label,
     src.description, src.sequence, true, src.match_terms)
  returning id into v_id;

  insert into public.room_template_lines (template_id, partida_id, factor, per_perimeter, per_wall_area, fixed, note, sequence)
  select v_id, partida_id, factor, per_perimeter, per_wall_area, fixed, note, sequence
  from public.room_template_lines where template_id = p_template;

  return v_id;
end;
$$;

-- ── Room heights: studio default, project override ───────────────────────────
alter table public.organizations
  add column default_room_height numeric(4, 2) not null default 2.60 check (default_room_height between 1.8 and 8);
alter table public.projects
  add column room_height numeric(4, 2) check (room_height between 1.8 and 8);

-- ── Rooms ────────────────────────────────────────────────────────────────────
create table public.rooms (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  version_id          uuid not null,
  name                text not null,
  template_id         uuid,                         -- trace only
  size                numeric(10, 2) not null default 0 check (size >= 0),  -- m² of floor, or a count
  perimeter           numeric(10, 2) check (perimeter >= 0),
  height              numeric(4, 2) check (height > 0),
  openings            numeric(10, 2) not null default 0 check (openings >= 0),  -- m² of doors and windows in its walls
  perimeter_estimated boolean not null default false,
  height_assumed      boolean not null default false,
  source              public.line_source not null default 'manual',
  source_ref          text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (version_id, organization_id) references public.versions (id, organization_id) on delete cascade
);
create index rooms_version_id_idx on public.rooms (version_id);
create index rooms_org_idx on public.rooms (organization_id);
create index rooms_source_ref_idx on public.rooms (version_id, source_ref) where source_ref is not null;
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function private.set_updated_at();
create trigger rooms_unlocked before insert or update or delete on public.rooms
  for each row execute function private.check_version_unlocked();

alter table public.line_items add column room_id uuid;
alter table public.line_items
  add constraint line_items_room_fk foreign key (room_id, organization_id)
  references public.rooms (id, organization_id) on delete cascade;
create index line_items_room_id_idx on public.line_items (room_id, organization_id);

do $$
declare
  t text := 'rooms';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select to authenticated
                    using (organization_id in (select private.user_org_ids()))', t || '_read', t);
  execute format('create policy %I on public.%I for insert to authenticated
                    with check (organization_id in (select private.user_writer_org_ids()))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated
                    using (organization_id in (select private.user_writer_org_ids()))
                    with check (organization_id in (select private.user_writer_org_ids()))', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated
                    using (organization_id in (select private.user_writer_org_ids()))', t || '_delete', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  execute format('revoke all on public.%I from anon', t);
  execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.log_change()', t || '_activity', t);
end;
$$;

-- ── Add a room ───────────────────────────────────────────────────────────────
-- Height: given, else the project's, else the studio's default (flagged as assumed).
-- Perimeter: given, else estimated from the area when the template needs it (flagged).
create or replace function public.add_room(
  p_version uuid, p_template uuid, p_size numeric, p_name text default null,
  p_height numeric default null, p_perimeter numeric default null, p_openings numeric default 0,
  p_source public.line_source default 'template', p_source_ref text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_org     uuid;
  v_project uuid;
  t         public.room_templates;
  v_height  numeric := p_height;
  v_perim   numeric := p_perimeter;
  v_est     boolean := false;
  v_room    uuid;
begin
  select organization_id, project_id into v_org, v_project from public.versions where id = p_version;
  if v_org is null then raise exception 'version not found'; end if;
  select * into t from public.room_templates where id = p_template;
  if t.id is null then raise exception 'template not found'; end if;
  if coalesce(p_size, 0) < 0 then raise exception 'Size cannot be negative.'; end if;

  if v_height is null then
    select coalesce(p.room_height, o.default_room_height, 2.60) into v_height
    from public.projects p join public.organizations o on o.id = p.organization_id
    where p.id = v_project;
  end if;
  if v_perim is null and exists (select 1 from public.room_template_lines
                                 where template_id = p_template and (per_perimeter <> 0 or per_wall_area <> 0)) then
    v_perim := public.estimate_perimeter(p_size);
    v_est := true;
  end if;

  insert into public.rooms
    (organization_id, version_id, name, template_id, size, perimeter, height, openings,
     perimeter_estimated, height_assumed, source, source_ref)
  values
    (v_org, p_version, coalesce(nullif(trim(p_name), ''), t.name), p_template, coalesce(p_size, 0), v_perim, v_height,
     coalesce(p_openings, 0), v_est, p_height is null, p_source, p_source_ref)
  returning id into v_room;

  insert into public.line_items
    (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state, room, room_id,
     source, source_ref, template_id)
  select v_org, p_version, x.partida_id, x.quantity,
         cp.unit_price, cp.price_id, cp.confidence,
         case when cp.unit_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         r.name, r.id, p_source, p_source_ref, p_template
  from public.rooms r
  cross join lateral (
    select public.studio_partida(v_org, tl.partida_id) as partida_id,
           public.room_line_quantity(tl.factor, tl.per_perimeter, tl.per_wall_area, tl.fixed, r.size, r.perimeter, r.height, r.openings) as quantity,
           tl.sequence
    from public.room_template_lines tl
    where tl.template_id = p_template
  ) x
  left join public.current_prices(v_org) cp on cp.partida_id = x.partida_id
  where r.id = v_room and x.partida_id is not null and x.quantity > 0
  order by x.sequence;

  return v_room;
end;
$$;
revoke all on function public.add_room(uuid, uuid, numeric, text, numeric, numeric, numeric, public.line_source, text) from public, anon;
grant execute on function public.add_room(uuid, uuid, numeric, text, numeric, numeric, numeric, public.line_source, text) to authenticated;

-- Kept for callers that only know the old signature: adds the room, returns the number of lines.
drop function public.apply_room_template(uuid, uuid, numeric, text, public.line_source, text);
create function public.apply_room_template(
  p_version uuid, p_template uuid, p_size numeric, p_label text default null,
  p_source public.line_source default 'template', p_source_ref text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  v_room := public.add_room(p_version, p_template, p_size, p_label, null, null, 0, p_source, p_source_ref);
  return (select count(*) from public.line_items where room_id = v_room);
end;
$$;
revoke all on function public.apply_room_template(uuid, uuid, numeric, text, public.line_source, text) from public, anon;
grant execute on function public.apply_room_template(uuid, uuid, numeric, text, public.line_source, text) to authenticated;

-- ── Change a room's geometry ─────────────────────────────────────────────────
-- Null keeps a value. A new size re-estimates an estimated perimeter. Lines from the room's
-- template are recalculated unless edited by hand (overridden); every line takes a new name.
create or replace function public.update_room(
  p_room uuid, p_name text default null, p_size numeric default null, p_height numeric default null,
  p_perimeter numeric default null, p_openings numeric default null, p_estimate_perimeter boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r public.rooms;
  v_count integer;
begin
  select * into r from public.rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;

  r.name := coalesce(nullif(trim(p_name), ''), r.name);
  r.size := coalesce(p_size, r.size);
  if p_height is not null then r.height := p_height; r.height_assumed := false; end if;
  r.openings := coalesce(p_openings, r.openings);
  if p_perimeter is not null then
    r.perimeter := p_perimeter; r.perimeter_estimated := false;
  elsif p_estimate_perimeter or (r.perimeter_estimated and p_size is not null) then
    r.perimeter := public.estimate_perimeter(r.size); r.perimeter_estimated := true;
  end if;

  update public.rooms
  set name = r.name, size = r.size, height = r.height, height_assumed = r.height_assumed, openings = r.openings,
      perimeter = r.perimeter, perimeter_estimated = r.perimeter_estimated
  where id = p_room;

  perform set_config('app.syncing', 'on', true);
  update public.line_items l
  set quantity = public.room_line_quantity(tl.factor, tl.per_perimeter, tl.per_wall_area, tl.fixed, r.size, r.perimeter, r.height, r.openings)
  from public.room_template_lines tl
  where l.room_id = p_room and not l.overridden and l.source <> 'manual'
    and tl.template_id = r.template_id
    and l.partida_id = public.studio_partida(r.organization_id, tl.partida_id);
  get diagnostics v_count = row_count;
  perform set_config('app.syncing', '', true);

  update public.line_items set room = r.name where room_id = p_room and room is distinct from r.name;
  return v_count;
end;
$$;
revoke all on function public.update_room(uuid, text, numeric, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.update_room(uuid, text, numeric, numeric, numeric, numeric, boolean) to authenticated;

-- ── Copy a version's rooms and lines (new options, signed contract) ───────────
create or replace function public.copy_version_contents(p_from uuid, p_to uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r      public.rooms;
  v_new  uuid;
  v_map  jsonb := '{}';
  v_count integer;
begin
  for r in select * from public.rooms where version_id = p_from order by created_at loop
    insert into public.rooms
      (organization_id, version_id, name, template_id, size, perimeter, height, openings,
       perimeter_estimated, height_assumed, source, source_ref, notes)
    values
      (r.organization_id, p_to, r.name, r.template_id, r.size, r.perimeter, r.height, r.openings,
       r.perimeter_estimated, r.height_assumed, r.source, r.source_ref, r.notes)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
  end loop;

  insert into public.line_items
    (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state,
     archicad_element_ids, notes, room, room_id, source, source_ref, template_id, overridden)
  select organization_id, p_to, partida_id, quantity, unit_price, price_id, confidence, state,
         archicad_element_ids, notes, room, (v_map ->> room_id::text)::uuid, source, source_ref, template_id, overridden
  from public.line_items where version_id = p_from
  order by created_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.copy_version_contents(uuid, uuid) from public, anon;
grant execute on function public.copy_version_contents(uuid, uuid) to authenticated;

-- Signing copies rooms too
create or replace function public.sign_contract(
  p_project uuid, p_version uuid, p_value numeric default null, p_signed_on date default current_date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_project public.projects;
  v_src public.versions;
  v_new uuid;
  v_label text := 'Contract';
  v_total numeric;
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then raise exception 'Project not found.'; end if;
  if v_project.contract_version_id is not null then
    raise exception 'This project already has a signed contract.' using errcode = 'P0001';
  end if;
  select * into v_src from public.versions where id = p_version and project_id = p_project;
  if v_src.id is null then raise exception 'Version not found in this project.'; end if;

  update public.projects set status = 'won' where id = p_project and status <> 'won';
  if exists (select 1 from public.versions where project_id = p_project and label = v_label) then
    v_label := 'Contract ' || to_char(coalesce(p_signed_on, current_date), 'YYYY-MM-DD');
  end if;

  insert into public.versions (organization_id, project_id, label, description, status)
  values (v_project.organization_id, p_project, v_label, 'Signed contract (copy of ' || v_src.label || ')', 'selected')
  returning id into v_new;
  perform public.copy_version_contents(p_version, v_new);
  update public.versions set locked = true where id = v_new;

  select coalesce(sum(total), 0) into v_total from public.line_items where version_id = v_new;
  update public.projects
     set contract_version_id = v_new,
         contract_value = coalesce(p_value, v_total),
         contract_signed_on = coalesce(p_signed_on, current_date),
         phase = case when phase = 'bid' then 'design'::public.project_phase else phase end
   where id = p_project;
  return v_new;
end;
$$;

