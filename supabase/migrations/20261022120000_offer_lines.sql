-- Lines ready for the offer document: who supplies them, job-specific description, notes for the
-- client and for the team, a reference price the client brings from elsewhere, and measurement
-- lines (Nº × largo × ancho × alto) behind each quantity. Plus an Excel import in one transaction.

create type public.supplied_by as enum ('contractor', 'client');

alter table public.line_items
  add column supplied_by       public.supplied_by not null default 'contractor',
  add column description       text,           -- job-specific text; empty = the partida's long description
  add column client_note       text,           -- printed in the offer ("Medición a confirmar en obra")
  add column measurement_note  text,           -- how the quantity was measured, printed ("13,44 ml × 2,50 m")
  add column reference_price   numeric(12, 2) check (reference_price >= 0),
  add column reference_source  text;           -- where the reference came from (another contractor, a web price…)
comment on column public.line_items.supplied_by is 'contractor: in the works contract. client: the client buys it directly; shown apart, not in the contract total.';
comment on column public.line_items.notes is 'Internal note for the team; never printed.';

alter table public.versions add column general_notes text;  -- printed at the end of the budget

-- ── Measurement lines ────────────────────────────────────────────────────────
create table public.line_measurements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  line_id         uuid not null,
  label           text,
  count           numeric(12, 3),
  length          numeric(12, 3),
  width           numeric(12, 3),
  height          numeric(12, 3),
  partial         numeric(14, 3) generated always as
                    (round(coalesce(count, 1) * coalesce(length, 1) * coalesce(width, 1) * coalesce(height, 1), 3)) stored,
  source          public.line_source not null default 'manual',
  source_ref      text,
  sequence        integer not null default 0,
  created_at      timestamptz not null default now(),
  check (count is not null or length is not null or width is not null or height is not null),
  foreign key (line_id, organization_id) references public.line_items (id, organization_id) on delete cascade
);
create index line_measurements_line_idx on public.line_measurements (line_id, organization_id);
create index line_measurements_org_idx on public.line_measurements (organization_id);

do $$
declare
  t text := 'line_measurements';
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

-- With measurement lines, the line's quantity is their sum (rounded to 2 decimals, as a budget prints it).
-- The line's own lock trigger refuses this on a signed contract.
create or replace function private.sum_measurements()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_line uuid := coalesce(new.line_id, old.line_id);
  v_sum  numeric;
begin
  if current_setting('app.undoing', true) = 'on' then return null; end if;
  select round(sum(partial), 2) into v_sum from public.line_measurements where line_id = v_line;
  if v_sum is not null then
    update public.line_items set quantity = greatest(v_sum, 0)
    where id = v_line and quantity is distinct from greatest(v_sum, 0);
  end if;
  return null;
end;
$$;
create trigger line_measurements_sum after insert or update or delete on public.line_measurements
  for each row execute function private.sum_measurements();

-- ── Budget totals count the contractor's lines only ──────────────────────────
create or replace function public.version_budget(p_version uuid)
returns table (
  trade_id uuid, trade text, sequence smallint, lines bigint, priced_lines bigint,
  subtotal numeric, budget_low numeric, budget_high numeric)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, t.sequence,
         count(*),
         count(li.unit_price),
         coalesce(sum(li.total), 0),
         round(coalesce(sum(li.total * (1 - s.spread)), 0), 2),
         round(coalesce(sum(li.total * (1 + s.spread)), 0), 2)
  from public.line_items li
  join public.partidas pa      on pa.id = li.partida_id
  join public.trades t         on t.id = pa.trade_id
  join public.organizations o  on o.id = li.organization_id
  join public.regions r        on r.id = o.region_id
  cross join lateral (
    select coalesce((r.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25) as spread
  ) s
  where li.version_id = p_version and li.supplied_by = 'contractor'
  group by t.id, t.name, t.sequence
  order by t.sequence, t.name;
$$;

create or replace view public.version_totals with (security_invoker = true) as
select li.version_id, li.organization_id,
       count(*) filter (where li.supplied_by = 'contractor') as lines,
       count(li.unit_price) filter (where li.supplied_by = 'contractor') as priced_lines,
       coalesce(sum(li.total) filter (where li.supplied_by = 'contractor'), 0) as subtotal,
       round(coalesce(sum(li.total * (1 - coalesce((g.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25)))
                      filter (where li.supplied_by = 'contractor'), 0), 2) as budget_low,
       round(coalesce(sum(li.total * (1 + coalesce((g.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25)))
                      filter (where li.supplied_by = 'contractor'), 0), 2) as budget_high,
       coalesce(sum(li.total) filter (where li.supplied_by = 'client'), 0) as client_total
from public.line_items li
join public.organizations o on o.id = li.organization_id
join public.regions g on g.id = o.region_id
group by li.version_id, li.organization_id;

create or replace view public.project_cost_by_trade with (security_invoker = true) as
with budget as (
  select x.project_id, x.organization_id, x.trade_id, sum(x.budget) as budget
  from (
    select mv.project_id, li.organization_id, pa.trade_id, li.total as budget
    from public.project_main_version mv
    join public.line_items li on li.version_id = mv.version_id and li.supplied_by = 'contractor'
    join public.partidas pa on pa.id = li.partida_id
    union all
    select co.project_id, l.organization_id, pa.trade_id, l.total
    from public.change_order_lines l
    join public.change_orders co on co.id = l.change_order_id and co.status = 'approved'
    left join public.partidas pa on pa.id = l.partida_id
  ) x
  group by x.project_id, x.organization_id, x.trade_id
), committed as (
  select po.project_id, pl.organization_id, coalesce(pa.trade_id, pa2.trade_id) as trade_id, sum(pl.total) as committed
  from public.purchase_order_lines pl
  join public.purchase_orders po on po.id = pl.purchase_order_id and po.status not in ('draft', 'cancelled')
  left join public.partidas pa on pa.id = pl.partida_id
  left join public.line_items li on li.id = pl.line_item_id
  left join public.partidas pa2 on pa2.id = li.partida_id
  group by po.project_id, pl.organization_id, coalesce(pa.trade_id, pa2.trade_id)
)
select coalesce(b.project_id, c.project_id) as project_id,
       coalesce(b.organization_id, c.organization_id) as organization_id,
       coalesce(b.trade_id, c.trade_id) as trade_id,
       t.code as trade_code, t.name as trade, t.sequence,
       coalesce(b.budget, 0) as budget,
       coalesce(c.committed, 0) as committed,
       coalesce(b.budget, 0) - coalesce(c.committed, 0) as remaining
from budget b
full join committed c on c.project_id = b.project_id and c.trade_id is not distinct from b.trade_id
left join public.trades t on t.id = coalesce(b.trade_id, c.trade_id);

create or replace view public.project_budget_summary with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.phase, p.status, p.contract_value, p.contract_signed_on, p.contract_version_id,
       coalesce((select sum(li.total) from public.line_items li where li.version_id = p.contract_version_id and li.supplied_by = 'contractor'), 0) as contract_budget,
       coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as approved_changes,
       coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status in ('draft', 'sent')), 0) as pending_changes,
       coalesce((select count(*) from public.change_orders c where c.project_id = p.id and c.status = 'approved'), 0) as approved_count,
       coalesce((select count(*) from public.change_orders c where c.project_id = p.id and c.status in ('draft', 'sent')), 0) as pending_count,
       coalesce((select sum(li.total) from public.line_items li where li.version_id = p.contract_version_id and li.supplied_by = 'contractor'), 0)
         + coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as current_budget
from public.projects p;

-- ── Copies keep the new fields and the measurements ──────────────────────────
create or replace function public.copy_version_contents(p_from uuid, p_to uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r      public.rooms;
  l      public.line_items;
  v_new  uuid;
  v_line uuid;
  v_map  jsonb := '{}';
  v_count integer := 0;
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

  for l in select * from public.line_items where version_id = p_from order by created_at, id loop
    insert into public.line_items
      (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state,
       archicad_element_ids, notes, room, room_id, source, source_ref, template_id, overridden,
       supplied_by, description, client_note, measurement_note, reference_price, reference_source)
    values
      (l.organization_id, p_to, l.partida_id, l.quantity, l.unit_price, l.price_id, l.confidence, l.state,
       l.archicad_element_ids, l.notes, l.room, (v_map ->> l.room_id::text)::uuid, l.source, l.source_ref, l.template_id, l.overridden,
       l.supplied_by, l.description, l.client_note, l.measurement_note, l.reference_price, l.reference_source)
    returning id into v_line;
    insert into public.line_measurements (organization_id, line_id, label, count, length, width, height, source, source_ref, sequence)
    select organization_id, v_line, label, count, length, width, height, source, source_ref, sequence
    from public.line_measurements where line_id = l.id;
    v_count := v_count + 1;
  end loop;

  update public.versions v set general_notes = s.general_notes
  from public.versions s where s.id = p_from and v.id = p_to and v.general_notes is null;
  return v_count;
end;
$$;

-- Contract value counts the contractor's lines only
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

  select coalesce(sum(total), 0) into v_total from public.line_items where version_id = v_new and supplied_by = 'contractor';
  update public.projects
     set contract_version_id = v_new,
         contract_value = coalesce(p_value, v_total),
         contract_signed_on = coalesce(p_signed_on, current_date),
         phase = case when phase = 'bid' then 'design'::public.project_phase else phase end
   where id = p_project;
  return v_new;
end;
$$;

-- ── Import a budget (round trip of the export, or another studio format) ─────
-- p_lines: [{ id?, code, title?, long_description?, unit?, chapter?, room?, quantity?, unit_price?, confidence?,
--             state?, supplied_by?, description?, client_note?, measurement_note?, notes?, reference_price?,
--             reference_source?, measurements?: [{label, count, length, width, height}] }]
-- A row with an id of this version updates that line (only the keys present); without id it adds a line.
-- Codes not in the catalogue become studio partidas (title, long description, unit, chapter required).
-- p_delete_missing removes lines of the version whose id is not in the file.
-- All in one transaction: any error leaves the version untouched.
create or replace function public.import_budget(
  p_version uuid, p_lines jsonb, p_delete_missing boolean default false, p_general_notes text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_org     uuid;
  v_region  text;
  e         jsonb;
  v_partida uuid;
  v_trade   uuid;
  v_line    uuid;
  v_price   numeric;
  v_ids     uuid[] := '{}';
  v_ins int := 0; v_upd int := 0; v_del int := 0; v_new_partidas int := 0; v_meas int := 0;
  v_row int := 0;
  m jsonb;
  v_seq int;
begin
  select v.organization_id, o.region_id into v_org, v_region
  from public.versions v join public.organizations o on o.id = v.organization_id where v.id = p_version;
  if v_org is null then raise exception 'version not found'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a list'; end if;

  for e in select * from jsonb_array_elements(p_lines) loop
    v_row := v_row + 1;
    v_line := nullif(e ->> 'id', '')::uuid;
    if v_line is not null and not exists (select 1 from public.line_items where id = v_line and version_id = p_version) then
      v_line := null;  -- an id from another version: treat the row as new
    end if;

    -- Partida: studio version of the code, else standard, else create a studio partida
    v_partida := null;
    if coalesce(e ->> 'code', '') <> '' then
      select id into v_partida from public.partidas
      where region_id = v_region and organization_id = v_org and upper(code) = upper(e ->> 'code') and active limit 1;
      if v_partida is null then
        select coalesce(public.studio_partida(v_org, id), id) into v_partida from public.partidas
        where region_id = v_region and organization_id is null and upper(code) = upper(e ->> 'code') limit 1;
      end if;
      if v_partida is null then
        select id into v_trade from public.trades
        where (organization_id is null or organization_id = v_org) and upper(code) = upper(coalesce(e ->> 'chapter', ''))
        order by organization_id nulls last limit 1;
        if v_trade is null then
          raise exception 'Row %: % is not in the catalogue and has no known chapter (%).', v_row, e ->> 'code', coalesce(e ->> 'chapter', 'empty');
        end if;
        if coalesce(e ->> 'title', '') = '' then
          raise exception 'Row %: % is new and needs a title.', v_row, e ->> 'code';
        end if;
        insert into public.partidas (region_id, organization_id, code, short_description, long_description, unit, trade_id)
        values (v_region, v_org, upper(e ->> 'code'), e ->> 'title', nullif(e ->> 'long_description', ''),
                coalesce(nullif(e ->> 'unit', ''), 'ud')::public.unit, v_trade)
        returning id into v_partida;
        v_new_partidas := v_new_partidas + 1;
      end if;
    elsif v_line is null then
      raise exception 'Row %: a new line needs a partida code.', v_row;
    end if;

    v_price := case when e ? 'unit_price' then nullif(e ->> 'unit_price', '')::numeric end;

    if v_line is null then
      insert into public.line_items
        (organization_id, version_id, partida_id, quantity, unit_price, confidence, state, room,
         source, source_ref, supplied_by, description, client_note, measurement_note, notes, reference_price, reference_source)
      values
        (v_org, p_version, v_partida, greatest(coalesce(nullif(e ->> 'quantity', '')::numeric, 0), 0), v_price,
         case when v_price is null then null else coalesce(nullif(e ->> 'confidence', ''), 'medium')::public.confidence end,
         case when e ->> 'state' in ('needs_rfq', 'quoted') then (e ->> 'state')::public.line_state
              when v_price is null then 'unpriced'::public.line_state else 'priced'::public.line_state end,
         nullif(e ->> 'room', ''), 'import', e ->> 'code',
         coalesce(nullif(e ->> 'supplied_by', ''), 'contractor')::public.supplied_by,
         nullif(e ->> 'description', ''), nullif(e ->> 'client_note', ''), nullif(e ->> 'measurement_note', ''),
         nullif(e ->> 'notes', ''), nullif(e ->> 'reference_price', '')::numeric, nullif(e ->> 'reference_source', ''))
      returning id into v_line;
      v_ins := v_ins + 1;
    else
      update public.line_items l set
        partida_id       = coalesce(v_partida, l.partida_id),
        quantity         = case when e ? 'quantity' and not (e ? 'measurements') then greatest(coalesce(nullif(e ->> 'quantity', '')::numeric, 0), 0) else l.quantity end,
        unit_price       = case when e ? 'unit_price' then v_price else l.unit_price end,
        price_id         = case when e ? 'unit_price' and v_price is distinct from l.unit_price then null else l.price_id end,
        confidence       = case when e ? 'confidence' then nullif(e ->> 'confidence', '')::public.confidence
                                when e ? 'unit_price' and v_price is not null and l.confidence is null then 'medium' else l.confidence end,
        state            = case when e ->> 'state' in ('needs_rfq', 'quoted') then (e ->> 'state')::public.line_state
                                when (case when e ? 'unit_price' then v_price else l.unit_price end) is null then 'unpriced'::public.line_state
                                when l.state = 'unpriced' or e ? 'state' then 'priced'::public.line_state
                                else l.state end,
        room             = case when e ? 'room' then nullif(e ->> 'room', '') else l.room end,
        supplied_by      = case when e ? 'supplied_by' then coalesce(nullif(e ->> 'supplied_by', ''), 'contractor')::public.supplied_by else l.supplied_by end,
        description      = case when e ? 'description' then nullif(e ->> 'description', '') else l.description end,
        client_note      = case when e ? 'client_note' then nullif(e ->> 'client_note', '') else l.client_note end,
        measurement_note = case when e ? 'measurement_note' then nullif(e ->> 'measurement_note', '') else l.measurement_note end,
        notes            = case when e ? 'notes' then nullif(e ->> 'notes', '') else l.notes end,
        reference_price  = case when e ? 'reference_price' then nullif(e ->> 'reference_price', '')::numeric else l.reference_price end,
        reference_source = case when e ? 'reference_source' then nullif(e ->> 'reference_source', '') else l.reference_source end
      where l.id = v_line;
      v_upd := v_upd + 1;
    end if;
    v_ids := v_ids || v_line;
    -- A description equal to the partida's own adds nothing: keep the line pointing at the catalogue text
    update public.line_items l set description = null
    from public.partidas p where l.id = v_line and p.id = l.partida_id and l.description = p.long_description;

    -- Measurements given: they replace the line's and set its quantity
    if jsonb_typeof(e -> 'measurements') = 'array' then
      delete from public.line_measurements where line_id = v_line;
      v_seq := 0;
      for m in select * from jsonb_array_elements(e -> 'measurements') loop
        continue when coalesce(m ->> 'count', m ->> 'length', m ->> 'width', m ->> 'height') is null;
        v_seq := v_seq + 1;
        insert into public.line_measurements (organization_id, line_id, label, count, length, width, height, source, sequence)
        values (v_org, v_line, nullif(m ->> 'label', ''), nullif(m ->> 'count', '')::numeric, nullif(m ->> 'length', '')::numeric,
                nullif(m ->> 'width', '')::numeric, nullif(m ->> 'height', '')::numeric, 'import', v_seq);
        v_meas := v_meas + 1;
      end loop;
    end if;
  end loop;

  if p_delete_missing then
    delete from public.line_items where version_id = p_version and not (id = any (v_ids));
    get diagnostics v_del = row_count;
  end if;
  if p_general_notes is not null then
    update public.versions set general_notes = nullif(p_general_notes, '') where id = p_version;
  end if;

  return jsonb_build_object('added', v_ins, 'updated', v_upd, 'deleted', v_del, 'new_partidas', v_new_partidas, 'measurements', v_meas);
end;
$$;
revoke all on function public.import_budget(uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.import_budget(uuid, jsonb, boolean, text) to authenticated;

-- ── Import catalogue rows: [{ code, chapter?, title?, long_description?, unit?, reference_code?,
--                             price?, confidence?, price_note?, hidden? }] ───────────────────────────
-- A studio code is updated; a standard code is copied into a studio version only if a text field
-- changes; a new code becomes a studio partida. A price different from the current one is recorded
-- as a new price (history kept).
create or replace function public.import_catalogue(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_region text;
  e jsonb;
  s public.partidas;
  o public.partidas;
  v_trade uuid;
  v_id uuid;
  v_cur numeric;
  v_row int := 0;
  v_created int := 0; v_updated int := 0; v_prices int := 0; v_unchanged int := 0;
  v_changed boolean;
begin
  select region_id into v_region from public.organizations where id = p_org;
  if v_region is null then raise exception 'studio not found'; end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    v_row := v_row + 1;
    continue when coalesce(e ->> 'code', '') = '';
    select * into o from public.partidas where region_id = v_region and organization_id = p_org and upper(code) = upper(e ->> 'code');
    select * into s from public.partidas where region_id = v_region and organization_id is null and upper(code) = upper(e ->> 'code');
    v_trade := null;
    if coalesce(e ->> 'chapter', '') <> '' then
      select id into v_trade from public.trades
      where (organization_id is null or organization_id = p_org) and upper(code) = upper(e ->> 'chapter')
      order by organization_id nulls last limit 1;
      if v_trade is null then raise exception 'Row %: unknown chapter %.', v_row, e ->> 'chapter'; end if;
    end if;

    if o.id is not null then
      update public.partidas set
        short_description = coalesce(nullif(e ->> 'title', ''), short_description),
        long_description  = case when e ? 'long_description' then nullif(e ->> 'long_description', '') else long_description end,
        unit              = coalesce(nullif(e ->> 'unit', '')::public.unit, unit),
        trade_id          = coalesce(v_trade, trade_id),
        reference_code    = case when e ? 'reference_code' then nullif(e ->> 'reference_code', '') else reference_code end,
        active            = case when e ? 'hidden' then not coalesce((e ->> 'hidden')::boolean, false) else active end
      where id = o.id;
      v_id := o.id;
      v_updated := v_updated + 1;
    elsif s.id is not null then
      v_changed := (nullif(e ->> 'title', '') is not null and e ->> 'title' <> s.short_description)
                or (e ? 'long_description' and nullif(e ->> 'long_description', '') is distinct from s.long_description)
                or (nullif(e ->> 'unit', '') is not null and (e ->> 'unit')::public.unit <> s.unit)
                or (v_trade is not null and v_trade <> s.trade_id)
                or coalesce((e ->> 'hidden')::boolean, false);
      if v_changed then
        insert into public.partidas (region_id, organization_id, code, short_description, long_description, unit, trade_id, reference_code, active)
        values (v_region, p_org, s.code, coalesce(nullif(e ->> 'title', ''), s.short_description),
                case when e ? 'long_description' then nullif(e ->> 'long_description', '') else s.long_description end,
                coalesce(nullif(e ->> 'unit', '')::public.unit, s.unit), coalesce(v_trade, s.trade_id),
                coalesce(nullif(e ->> 'reference_code', ''), s.reference_code), not coalesce((e ->> 'hidden')::boolean, false))
        returning id into v_id;
        v_created := v_created + 1;
      else
        v_id := s.id;
        v_unchanged := v_unchanged + 1;
      end if;
    else
      if v_trade is null or coalesce(e ->> 'title', '') = '' then
        raise exception 'Row %: new code % needs a chapter and a title.', v_row, e ->> 'code';
      end if;
      insert into public.partidas (region_id, organization_id, code, short_description, long_description, unit, trade_id, reference_code)
      values (v_region, p_org, upper(e ->> 'code'), e ->> 'title', nullif(e ->> 'long_description', ''),
              coalesce(nullif(e ->> 'unit', ''), 'ud')::public.unit, v_trade, nullif(e ->> 'reference_code', ''))
      returning id into v_id;
      v_created := v_created + 1;
    end if;

    if nullif(e ->> 'price', '') is not null then
      select cp.unit_price into v_cur from public.current_prices(p_org) cp where cp.partida_id = public.studio_partida(p_org, v_id);
      if v_cur is distinct from (e ->> 'price')::numeric then
        insert into public.prices (region_id, organization_id, partida_id, unit_price, source, confidence, notes)
        values (v_region, p_org, coalesce(public.studio_partida(p_org, v_id), v_id), (e ->> 'price')::numeric, 'manual',
                coalesce(nullif(e ->> 'confidence', ''), 'medium')::public.confidence, coalesce(nullif(e ->> 'price_note', ''), 'Imported'));
        v_prices := v_prices + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_unchanged, 'prices', v_prices);
end;
$$;
revoke all on function public.import_catalogue(uuid, jsonb) from public, anon;
grant execute on function public.import_catalogue(uuid, jsonb) to authenticated;
