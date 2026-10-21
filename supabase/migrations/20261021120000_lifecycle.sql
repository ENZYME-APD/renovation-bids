-- Project lifecycle: phases (bid → design → construction → closed), a signed contract that
-- freezes a copy of the budget as the baseline, and change orders that move the current budget.
--
--   current budget = contract budget + approved change orders
--
-- Everything that existed keeps working: statuses stay as they were (they describe the bid),
-- versions and the bid-stage rule are unchanged until a contract is signed.

-- ── Phases ───────────────────────────────────────────────────────────────────
create type public.project_phase as enum ('bid', 'design', 'construction', 'closed');

alter table public.projects
  add column phase public.project_phase not null default 'bid',
  add column contract_version_id uuid,
  add column contract_signed_on date,
  add foreign key (contract_version_id, organization_id) references public.versions (id, organization_id) on delete set null (contract_version_id);
create index projects_contract_version_idx on public.projects (contract_version_id, organization_id);

update public.projects
   set phase = case when status = 'won' then 'design'::public.project_phase
                    when status in ('lost', 'no_go') then 'closed'::public.project_phase
                    else 'bid'::public.project_phase end;

-- Winning moves a bid into design; losing or dropping it closes it. Other moves are manual.
create or replace function private.project_phase_from_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.phase = old.phase and old.phase = 'bid' then
    if new.status = 'won' then new.phase := 'design';
    elsif new.status in ('lost', 'no_go') then new.phase := 'closed';
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_phase_from_status before update on public.projects
  for each row execute function private.project_phase_from_status();

-- The bid-stage rule (one version until won) also lets through projects past the bid phase.
create or replace function private.check_version_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.versions where project_id = new.project_id)
     and exists (select 1 from public.projects p where p.id = new.project_id and p.status <> 'won' and p.phase = 'bid') then
    raise exception 'Bid stage: one standard version only. Options and client changes start once the project is won.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── Undo marks itself so lock triggers can admit it ─────────────────────────
create or replace function public.undo_change(p_change_id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r          record;
  v_key      text[];
  v_where    text;
  v_cols     text;
  v_current  jsonb;
  v_field    text;
  v_done     bigint[] := '{}';
  v_pending  bigint[] := '{}';
  v_progress boolean;
  v_pass     int := 0;
begin
  if not exists (select 1 from public.activity_log where change_id = p_change_id and undone_at is null) then
    raise exception 'Nothing to undo for change %.', p_change_id;
  end if;
  -- The undo is itself a change, logged under its own id
  perform set_config('request.headers',
    (coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
      || jsonb_build_object('x-change-id', left('undo:' || p_change_id, 64)))::text, true);
  -- Lets lock triggers (signed contract, decided change orders) admit the undo. Not settable from the API.
  perform set_config('app.undoing', 'on', true);

  for r in select * from public.activity_log
           where change_id = p_change_id and undone_at is null order by id desc loop
    if r.organization_id not in (select private.user_writer_org_ids()) then
      raise exception 'Viewers cannot undo changes.';
    end if;
    if r.actor_id is distinct from (select auth.uid())
       and r.organization_id not in (select private.user_admin_org_ids()) then
      raise exception 'You can undo your own changes; admins can undo anyone''s.';
    end if;
    if r.table_name in ('activity_log', 'organizations') and r.action <> 'update' then
      raise exception 'This change cannot be undone.';
    end if;

    v_key := private.undo_key(r.table_name);
    select string_agg(format('%I = (%L::jsonb ->> %L)::%s', k, coalesce(r.new_row, r.old_row), k,
                             (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                              where a.attrelid = ('public.' || quote_ident(r.table_name))::regclass and a.attname = k)), ' and ')
      into v_where from unnest(v_key) k;

    if r.action in ('insert', 'update') then
      execute format('select to_jsonb(t) from public.%I t where %s', r.table_name, v_where) into v_current;
      if v_current is null then
        if r.action = 'update' then raise exception 'A % changed in % no longer exists.', r.table_name, p_change_id; end if;
        v_done := v_done || r.id;  -- already gone
        continue;
      end if;
      foreach v_field in array coalesce(r.changed_fields, array(select jsonb_object_keys(r.new_row))) loop
        if v_field not in ('updated_at', 'total', 'next_project_number', 'next_po_number')
           and (v_current -> v_field) is distinct from (r.new_row -> v_field) then
          raise exception 'The % was edited after this change (%), so it was not undone.', r.table_name, v_field;
        end if;
      end loop;
    end if;

    if r.action = 'insert' then
      execute format('delete from public.%I where %s', r.table_name, v_where);
      v_done := v_done || r.id;
    elsif r.action = 'update' then
      select string_agg(quote_ident(c), ', ') into v_cols
      from unnest(r.changed_fields) c
      where c not in ('updated_at', 'total', 'next_project_number', 'next_po_number');
      if v_cols is not null then
        execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s',
                       r.table_name, v_cols, v_cols, r.table_name, v_where) using r.old_row;
      end if;
      v_done := v_done || r.id;
    else
      v_pending := v_pending || r.id;  -- re-inserted below, parents before children
    end if;
  end loop;

  -- Re-insert deleted rows; retry until parents are back (cascaded deletes)
  while array_length(v_pending, 1) > 0 and v_pass < 10 loop
    v_pass := v_pass + 1;
    v_progress := false;
    for r in select * from public.activity_log where id = any (v_pending) order by id loop
      select string_agg(quote_ident(a.attname), ', ') into v_cols
      from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(r.table_name))::regclass
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
        and r.old_row ? a.attname;
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                       r.table_name, v_cols, v_cols, r.table_name) using r.old_row;
        v_done := v_done || r.id;
        v_pending := array_remove(v_pending, r.id);
        v_progress := true;
      exception when foreign_key_violation then
        null;  -- parent not back yet; next pass
      end;
    end loop;
    exit when not v_progress;
  end loop;
  if array_length(v_pending, 1) > 0 then
    raise exception 'Some deleted rows could not be restored because what they belonged to is gone.';
  end if;

  perform private.mark_undone(v_done);
  return coalesce(array_length(v_done, 1), 0);
end;
$$;

-- ── Locked versions (the signed contract) ────────────────────────────────────
alter table public.versions add column locked boolean not null default false;

create or replace function private.check_version_unlocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid := coalesce(new.version_id, old.version_id);
begin
  -- Undo (which checks for later edits itself) and a deleted parent version are let through.
  if current_setting('app.undoing', true) = 'on' then return coalesce(new, old); end if;
  if exists (select 1 from public.versions where id = v_version and locked) then
    raise exception 'This version is the signed contract and can''t be edited. Record the change as a change order.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.check_version_unlocked() from public;
create trigger line_items_unlocked before insert or update or delete on public.line_items
  for each row execute function private.check_version_unlocked();

-- A locked version stays locked while it is a project's contract.
create or replace function private.keep_contract_locked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.locked and not new.locked
     and coalesce(current_setting('app.undoing', true), '') <> 'on'
     and exists (select 1 from public.projects where contract_version_id = new.id) then
    raise exception 'The contract version stays locked. Undo the contract signing to unlock it.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_contract_locked() from public;
create trigger versions_keep_contract_locked before update on public.versions
  for each row execute function private.keep_contract_locked();

-- Sign the contract: copy a version as the locked "Contract" baseline, record value and date.
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
  insert into public.line_items (organization_id, version_id, partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes, room)
  select organization_id, v_new, partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes, room
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
revoke all on function public.sign_contract(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.sign_contract(uuid, uuid, numeric, date) to authenticated;

-- ── Change orders ────────────────────────────────────────────────────────────
create type public.change_order_status as enum ('draft', 'sent', 'approved', 'rejected', 'cancelled');
create type public.change_reason as enum ('client_request', 'design_change', 'site_condition', 'omission', 'other');

create table public.change_orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null,
  number           integer not null default 0,
  title            text not null,
  description      text,
  reason           public.change_reason not null default 'client_request',
  status           public.change_order_status not null default 'draft',
  decision_id      uuid,
  sent_on          date,
  decided_on       date,
  approved_by      text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (project_id, number),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (decision_id, organization_id) references public.decisions (id, organization_id) on delete set null (decision_id),
  check (status not in ('approved', 'rejected') or decided_on is not null),
  check (status = 'draft' or status = 'cancelled' or sent_on is not null)
);
create index change_orders_project_org_idx on public.change_orders (project_id, organization_id);
create index change_orders_decision_org_idx on public.change_orders (decision_id, organization_id);
create trigger change_orders_set_updated_at before update on public.change_orders
  for each row execute function private.set_updated_at();

create or replace function private.assign_change_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number from public.change_orders where project_id = new.project_id;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_change_order_number() from public;
create trigger change_orders_assign_number before insert on public.change_orders
  for each row execute function private.assign_change_order_number();

-- Approving a change order that came from a client request marks the request applied.
create or replace function private.apply_change_order_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision_id is not null and new.status is distinct from old.status then
    if new.status = 'approved' then
      update public.decisions set status = 'applied' where id = new.decision_id;
    elsif new.status in ('rejected', 'cancelled') then
      update public.decisions set status = 'dropped' where id = new.decision_id and status = 'open';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_change_order_decision() from public;
create trigger change_orders_apply_decision after update on public.change_orders
  for each row execute function private.apply_change_order_decision();

create table public.change_order_lines (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  change_order_id  uuid not null,
  partida_id       uuid references public.partidas (id),
  description      text not null,
  unit             public.unit not null default 'ud',
  quantity         numeric(14, 3) not null,          -- negative = work taken out
  unit_price       numeric(12, 2) not null default 0 check (unit_price >= 0),
  total            numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  room             text,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (change_order_id, organization_id) references public.change_orders (id, organization_id) on delete cascade
);
create index change_order_lines_co_org_idx on public.change_order_lines (change_order_id, organization_id);
create index change_order_lines_partida_idx on public.change_order_lines (partida_id);

-- Lines are frozen once the client has decided; partidas must be in the studio's catalogue.
create or replace function private.check_change_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_co uuid := coalesce(new.change_order_id, old.change_order_id);
begin
  if coalesce(current_setting('app.undoing', true), '') <> 'on'
     and exists (select 1 from public.change_orders where id = v_co and status in ('approved', 'rejected')) then
    raise exception 'This change order has been decided; its lines can''t change. Create a new change order.' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' and not private.ref_in_scope('partidas', new.partida_id, new.organization_id, private.org_region(new.organization_id)) then
    raise exception 'change order line partida out of scope';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.check_change_order_line() from public;
create trigger change_order_lines_check before insert or update or delete on public.change_order_lines
  for each row execute function private.check_change_order_line();

do $$
declare
  t text;
begin
  foreach t in array array['change_orders', 'change_order_lines']
  loop
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
  end loop;
end;
$$;

-- ── Views ────────────────────────────────────────────────────────────────────

-- The version that counts: the signed contract, else the selected one, else the newest.
create or replace view public.project_main_version with (security_invoker = true) as
select distinct on (v.project_id) v.project_id, v.organization_id, v.id as version_id, v.label, v.status
from public.versions v
left join public.projects p on p.id = v.project_id
order by v.project_id, (v.id = p.contract_version_id) desc, (v.status = 'selected') desc, v.created_at desc;

create view public.change_order_totals with (security_invoker = true) as
select co.id as change_order_id, co.organization_id, co.project_id, co.number, co.status,
       count(l.id) as lines, coalesce(sum(l.total), 0) as total
from public.change_orders co
left join public.change_order_lines l on l.change_order_id = co.id
group by co.id, co.organization_id, co.project_id, co.number, co.status;

-- Contract, approved changes and current budget per project.
create view public.project_budget_summary with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.phase, p.status, p.contract_value, p.contract_signed_on, p.contract_version_id,
       coalesce((select sum(li.total) from public.line_items li where li.version_id = p.contract_version_id), 0) as contract_budget,
       coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as approved_changes,
       coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status in ('draft', 'sent')), 0) as pending_changes,
       coalesce((select count(*) from public.change_orders c where c.project_id = p.id and c.status = 'approved'), 0) as approved_count,
       coalesce((select count(*) from public.change_orders c where c.project_id = p.id and c.status in ('draft', 'sent')), 0) as pending_count,
       coalesce((select sum(li.total) from public.line_items li where li.version_id = p.contract_version_id), 0)
         + coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as current_budget
from public.projects p;

-- Budget per chapter = main version (the contract once signed) + approved change orders.
create or replace view public.project_cost_by_trade with (security_invoker = true) as
with budget as (
  select project_id, organization_id, trade_id, sum(budget) as budget from (
    select mv.project_id, li.organization_id, pa.trade_id, li.total as budget
    from public.project_main_version mv
    join public.line_items li on li.version_id = mv.version_id
    join public.partidas pa on pa.id = li.partida_id
    union all
    select co.project_id, l.organization_id, pa.trade_id, l.total
    from public.change_order_lines l
    join public.change_orders co on co.id = l.change_order_id and co.status = 'approved'
    left join public.partidas pa on pa.id = l.partida_id
  ) x group by project_id, organization_id, trade_id
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
       coalesce(b.budget, 0) as budget, coalesce(c.committed, 0) as committed,
       coalesce(b.budget, 0) - coalesce(c.committed, 0) as remaining
from budget b
full join committed c on c.project_id = b.project_id and c.trade_id is not distinct from b.trade_id
left join public.trades t on t.id = coalesce(b.trade_id, c.trade_id);

-- Project stats and money gain the phase and the lifecycle budget (new columns at the end).
create or replace view public.project_stats with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name, p.status, p.district, p.area_m2,
       p.created_at, p.updated_at, p.bid_hours, p.client_budget, p.contract_value, p.actual_cost,
       mv.version_id, mv.label as version_label,
       coalesce(vt.lines, 0) as lines, coalesce(vt.priced_lines, 0) as priced_lines,
       coalesce(vt.subtotal, 0) as subtotal, coalesce(vt.budget_low, 0) as budget_low, coalesce(vt.budget_high, 0) as budget_high,
       case when p.area_m2 > 0 and vt.subtotal > 0 then round(vt.subtotal / p.area_m2, 0) end as eur_per_m2,
       p.phase
from public.projects p
left join public.project_main_version mv on mv.project_id = p.id
left join public.version_totals vt on vt.version_id = mv.version_id;

create or replace view public.project_money with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name, p.status, p.contract_value,
       coalesce(vt.subtotal, 0) as budget,
       coalesce((select sum(pl.total) from public.purchase_order_lines pl
                 join public.purchase_orders po on po.id = pl.purchase_order_id
                 where po.project_id = p.id and po.status not in ('draft', 'cancelled')), 0) as committed,
       coalesce((select sum(i.total) from public.supplier_invoices i where i.project_id = p.id), 0) as invoiced,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out'), 0) as paid_out,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'labour'), 0) as paid_labour,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'materials'), 0) as paid_materials,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'extra'), 0) as paid_extra,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'in' and m.category = 'client_works'), 0) as received_works,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'in' and m.category = 'client_fees'), 0) as received_fees,
       p.phase,
       coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as approved_changes,
       coalesce(vt.subtotal, 0)
         + coalesce((select sum(t.total) from public.change_order_totals t where t.project_id = p.id and t.status = 'approved'), 0) as current_budget
from public.projects p
left join public.project_main_version mv on mv.project_id = p.id
left join public.version_totals vt on vt.version_id = mv.version_id;

-- Action items gain change orders waiting for the client (sent more than 7 days ago).
create or replace view public.action_items with (security_invoker = true) as
select r.organization_id, 'rfq_reminder'::text as kind, r.project_id, p.code as project_code, p.name as project_name,
       'Chase ' || r.supplier || ' for a quote' as title, r.reply_by as due_on, r.id as ref_id, 2 as priority
from public.rfqs_due_reminder r join public.projects p on p.id = r.project_id
union all
select q.organization_id, 'quote_review', r.project_id, p.code, p.name,
       'Review quote from ' || s.name, q.received_at::date, q.id, 1
from public.quotes q join public.rfqs r on r.id = q.rfq_id join public.suppliers s on s.id = r.supplier_id
join public.projects p on p.id = r.project_id
where q.reviewed_at is null
union all
select ps.organization_id, 'unpriced_lines', ps.project_id, ps.code, ps.name,
       (ps.lines - ps.priced_lines) || ' lines without a price', null::date, ps.version_id, 3
from public.project_stats ps
where ps.lines > ps.priced_lines and ps.status not in ('lost', 'no_go', 'won')
union all
select o.organization_id, 'offer_expiring', o.project_id, p.code, p.name,
       'Offer R' || o.revision || ' expires', o.valid_until, o.id, 2
from public.offers o join public.projects p on p.id = o.project_id
where o.status = 'sent' and o.valid_until between current_date and current_date + 14
union all
select d.organization_id, 'open_decision', d.project_id, p.code, p.name,
       'Client request: ' || left(d.request, 80), d.decided_on, d.id, 3
from public.decisions d join public.projects p on p.id = d.project_id
where d.status = 'open'
union all
select b.organization_id, 'invoice_due', b.project_id, p.code, p.name,
       'Pay ' || coalesce(b.supplier, 'supplier') || coalesce(' invoice ' || b.number, ''), b.due_on, b.id, 1
from public.invoice_balances b join public.projects p on p.id = b.project_id
where b.outstanding > 0 and b.due_on <= current_date + 7
union all
select po.organization_id, 'delivery_late', po.project_id, p.code, p.name,
       po.code || ' delivery is late', po.expected_on, po.id, 1
from public.purchase_orders po join public.projects p on p.id = po.project_id
where po.status in ('sent', 'confirmed') and po.expected_on < current_date
union all
select co.organization_id, 'change_pending', co.project_id, p.code, p.name,
       'CO-' || lpad(co.number::text, 2, '0') || ' waiting for the client: ' || left(co.title, 60), co.sent_on + 7, co.id, 2
from public.change_orders co join public.projects p on p.id = co.project_id
where co.status = 'sent' and co.sent_on <= current_date - 7;

grant select on public.change_order_totals, public.project_budget_summary to authenticated;
revoke all on public.change_order_totals, public.project_budget_summary from anon;
