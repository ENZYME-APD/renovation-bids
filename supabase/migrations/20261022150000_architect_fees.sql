-- Architect's fees per project. Each fee item is a lump sum, a % of construction, or a monthly
-- rate × months (e.g. site supervision). Items with no project are the studio's defaults, copied
-- into every new project; the project's own items can then be edited freely.

create type public.fee_basis as enum ('lump_sum', 'percent', 'monthly');

create table public.fee_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid,                          -- null = studio default
  label            text not null check (length(trim(label)) > 0),
  basis            public.fee_basis not null,
  amount           numeric(12, 2) check (amount >= 0),          -- lump sum, or the monthly rate
  percent          numeric(6, 3) check (percent between 0 and 100),
  months           numeric(6, 2) check (months >= 0),           -- monthly: months expected
  phase            public.project_phase,                        -- when it is earned (design, construction)
  notes            text,
  sequence         integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  check ((basis = 'percent') = (percent is not null)),
  check (basis = 'percent' or amount is not null)
);
create index fee_items_project_idx on public.fee_items (project_id, organization_id);
create index fee_items_org_idx on public.fee_items (organization_id) where project_id is null;
comment on table public.fee_items is
  'Architect''s fees. project_id null = studio defaults copied into new projects. Amounts before VAT.';

do $$
declare
  t text := 'fee_items';
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

-- New projects start with the studio's default fees.
create or replace function private.copy_default_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fee_items (organization_id, project_id, label, basis, amount, percent, months, phase, notes, sequence)
  select f.organization_id, new.id, f.label, f.basis, f.amount, f.percent, f.months, f.phase, f.notes, f.sequence
  from public.fee_items f
  where f.organization_id = new.organization_id and f.project_id is null;
  return new;
end;
$$;
revoke all on function private.copy_default_fees() from public;
create trigger projects_copy_default_fees after insert on public.projects
  for each row execute function private.copy_default_fees();

-- Apply the studio defaults to an existing project (adds the ones it doesn't have by label).
create or replace function public.apply_default_fees(p_project uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_n   integer;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null then raise exception 'project not found'; end if;
  insert into public.fee_items (organization_id, project_id, label, basis, amount, percent, months, phase, notes, sequence)
  select f.organization_id, p_project, f.label, f.basis, f.amount, f.percent, f.months, f.phase, f.notes, f.sequence
  from public.fee_items f
  where f.organization_id = v_org and f.project_id is null
    and not exists (select 1 from public.fee_items x where x.project_id = p_project and lower(x.label) = lower(f.label));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.apply_default_fees(uuid) from public, anon;
grant execute on function public.apply_default_fees(uuid) to authenticated;

-- Fee items with their amount. % fees apply to the construction budget: the contract (or main
-- version) plus approved change orders, before VAT.
create or replace view public.project_fee_items with (security_invoker = true) as
select f.id, f.organization_id, f.project_id, f.label, f.basis, f.amount, f.percent, f.months, f.phase, f.notes, f.sequence,
       m.current_budget as construction_base,
       case f.basis
         when 'lump_sum' then f.amount
         when 'monthly'  then round(f.amount * coalesce(f.months, 0), 2)
         when 'percent'  then round(f.percent / 100 * coalesce(m.current_budget, 0), 2)
       end as total
from public.fee_items f
join public.project_money m on m.project_id = f.project_id
where f.project_id is not null;

create or replace view public.project_fee_summary with (security_invoker = true) as
select m.project_id, m.organization_id, m.current_budget as construction_base,
       coalesce(sum(fi.total), 0) as fees_total,
       count(fi.id) as items,
       count(fi.id) filter (where fi.basis = 'monthly' and fi.months is null) as items_missing_months,
       m.received_fees,
       coalesce(sum(fi.total), 0) - m.received_fees as fees_outstanding,
       case when m.current_budget > 0 then round(coalesce(sum(fi.total), 0) / m.current_budget * 100, 2) end as fees_pct
from public.project_money m
left join public.project_fee_items fi on fi.project_id = m.project_id
group by m.project_id, m.organization_id, m.current_budget, m.received_fees;

grant select on public.project_fee_items, public.project_fee_summary to authenticated;
revoke all on public.project_fee_items, public.project_fee_summary from anon;
