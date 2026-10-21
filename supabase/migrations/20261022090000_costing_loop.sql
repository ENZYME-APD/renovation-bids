-- Costing loop, source-agnostic: lines remember where they came from (template, model zone,
-- model element, AI assumption, import or by hand), edits mark them overridden so later syncs
-- leave them alone, studios keep their own room templates, and options in the bid become a
-- studio setting (off by default).

-- ── Line traceability ────────────────────────────────────────────────────────
create type public.line_source as enum
  ('manual', 'template', 'model_zone', 'model_element', 'ai_assumption', 'import');

alter table public.line_items
  add column source      public.line_source not null default 'manual',
  add column source_ref  text,      -- zone id, element GUID, drawing/sheet ref: whatever the source keys on
  add column template_id uuid,      -- trace only, no FK: deleting a template must not touch locked contract lines
  add column overridden  boolean not null default false;
create index line_items_template_id_idx on public.line_items (template_id);
create index line_items_source_ref_idx on public.line_items (version_id, source_ref) where source_ref is not null;

comment on column public.line_items.source is 'Where the line came from. Syncs only touch lines of their own source that are not overridden.';
comment on column public.line_items.overridden is 'Set when someone changes the quantity or partida of a generated line by hand. Syncs skip it.';

-- A hand edit of a generated line's quantity or partida marks it overridden.
-- Syncs set app.syncing = on (transaction-local) so their own updates do not count.
-- An update that sets overridden itself (undo, "reset to source") is left as is.
create or replace function private.mark_line_overridden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source <> 'manual'
     and new.overridden = old.overridden
     and coalesce(current_setting('app.syncing', true), '') <> 'on'
     and (new.quantity is distinct from old.quantity or new.partida_id is distinct from old.partida_id) then
    new.overridden := true;
  end if;
  return new;
end;
$$;
create trigger line_items_mark_overridden before update on public.line_items
  for each row execute function private.mark_line_overridden();

-- Backfill: lines added from a template carry the template's name (or a custom label) as room.
-- We cannot tell which ones were, so existing lines stay 'manual': safe, syncs never touch them.

-- ── Room templates: matching and studio copies ───────────────────────────────
alter table public.room_templates
  add column match_terms text[] not null default '{}';
comment on column public.room_templates.match_terms is
  'Zone categories or room names that map to this template (case-insensitive), from any source: Archicad zone categories, room names on a drawing, an AI room list.';

update public.room_templates set match_terms = v.terms
from (values
  ('GEN', array[]::text[]),
  ('DOR', array['dormitorio', 'habitación', 'habitacion', 'bedroom']),
  ('SAL', array['salón', 'salon', 'comedor', 'salón-comedor', 'estar', 'living', 'living room', 'sala']),
  ('PAS', array['pasillo', 'hall', 'distribuidor', 'recibidor', 'entrada', 'corridor', 'circulación']),
  ('BAN', array['baño', 'bano', 'bathroom', 'baño principal', 'baño completo']),
  ('ASE', array['aseo', 'toilet', 'wc', 'cuarto de aseo']),
  ('COC', array['cocina', 'kitchen', 'office']),
  ('LAV', array['lavandería', 'lavanderia', 'tendedero', 'laundry', 'utility']),
  ('VEN', array[]::text[]),
  ('DBA', array[]::text[])
) v(code, terms)
where room_templates.organization_id is null and room_templates.code = v.code;

-- The templates a studio sees: its own, plus standard ones it has not replaced (same code).
-- Includes inactive studio copies, which hide the standard one.
create or replace function public.effective_room_templates(p_org uuid)
returns setof public.room_templates
language sql
stable
set search_path = ''
as $$
  select t.*
  from public.room_templates t
  join public.organizations o on o.id = p_org and o.region_id = t.region_id
  where t.organization_id = p_org
     or (t.organization_id is null
         and not exists (select 1 from public.room_templates s
                         where s.organization_id = p_org and s.region_id = t.region_id and s.code = t.code));
$$;
revoke all on function public.effective_room_templates(uuid) from public, anon;
grant execute on function public.effective_room_templates(uuid) to authenticated;

-- Copy a template (standard or another studio template) into the studio.
-- Same code as a standard one = replaces it for the studio. Returns the copy.
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
    return v_id;   -- already customised
  end if;

  insert into public.room_templates
    (region_id, organization_id, code, name, size_label, description, sequence, active, match_terms)
  values
    (src.region_id, p_org, v_code, coalesce(nullif(trim(p_name), ''), src.name), src.size_label,
     src.description, src.sequence, true, src.match_terms)
  returning id into v_id;

  insert into public.room_template_lines (template_id, partida_id, factor, fixed, note, sequence)
  select v_id, partida_id, factor, fixed, note, sequence
  from public.room_template_lines where template_id = p_template;

  return v_id;
end;
$$;
revoke all on function public.copy_room_template(uuid, uuid, text, text) from public, anon;
grant execute on function public.copy_room_template(uuid, uuid, text, text) to authenticated;

-- Which template fits a room name or zone category? Exact term first, then a term contained
-- in the name ("Baño 2" → BAN). Studio templates win over standard ones.
create or replace function public.match_room_template(p_org uuid, p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id
  from public.effective_room_templates(p_org) t
  cross join lateral unnest(t.match_terms) term
  where t.active
    and (lower(trim(p_name)) = lower(term) or lower(p_name) like '%' || lower(term) || '%')
  order by (lower(trim(p_name)) = lower(term)) desc, length(term) desc, t.organization_id nulls last, t.sequence
  limit 1;
$$;
revoke all on function public.match_room_template(uuid, text) from public, anon;
grant execute on function public.match_room_template(uuid, text) to authenticated;

-- apply_room_template now records where its lines came from. Callers that bring rooms from a
-- model or an AI room list pass the source and a ref (zone id), so re-syncs can find them.
drop function public.apply_room_template(uuid, uuid, numeric, text);
create function public.apply_room_template(
  p_version uuid, p_template uuid, p_size numeric, p_label text default null,
  p_source public.line_source default 'template', p_source_ref text default null)
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
    (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state, room,
     source, source_ref, template_id)
  select v_org, p_version, x.partida_id, x.quantity,
         cp.unit_price, cp.price_id, cp.confidence,
         case when cp.unit_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         x.room, p_source, p_source_ref, p_template
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
revoke all on function public.apply_room_template(uuid, uuid, numeric, text, public.line_source, text) from public, anon;
grant execute on function public.apply_room_template(uuid, uuid, numeric, text, public.line_source, text) to authenticated;

-- ── Versions: where the design lives, whatever the tool ──────────────────────
alter table public.versions
  add column model_tool      text,         -- archicad, revit, sketchup, drawings, ai, none…
  add column model_file      text,
  add column model_option    text,         -- design option / variant name in that tool
  add column model_synced_at timestamptz;
update public.versions
set model_tool = 'archicad', model_file = archicad_file, model_option = archicad_option
where archicad_file is not null or archicad_option is not null;

-- ── Options during the bid: a studio choice ──────────────────────────────────
alter table public.organizations
  add column allow_bid_options boolean not null default false;
comment on column public.organizations.allow_bid_options is
  'Off: a bid has one standard version until won. On: options are allowed before the contract too.';

create or replace function private.check_version_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.versions where project_id = new.project_id)
     and exists (select 1 from public.projects p where p.id = new.project_id and p.status <> 'won' and p.phase = 'bid')
     and not exists (select 1 from public.organizations o where o.id = new.organization_id and o.allow_bid_options) then
    raise exception 'Bid stage: one standard version only. Options and client changes start once the project is won (or allow options in the bid in Settings).'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── Contract copy keeps line sources ───────────────────────────────────────
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
  insert into public.line_items (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes, room, source, source_ref, template_id, overridden)
  select organization_id, v_new, partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes, room, source, source_ref, template_id, overridden
  from public.line_items where version_id = p_version;
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
