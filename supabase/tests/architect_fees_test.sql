-- Architect's fees: studio defaults copied into new projects; lump sum, % and monthly amounts; undo.
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- Studio defaults: 4000 project fee, 2000 / month site supervision
insert into public.fee_items (organization_id, label, basis, amount, phase, sequence)
values (current_setting('test.org_a')::uuid, 'Proyecto', 'lump_sum', 4000, 'design', 1);
insert into public.fee_items (organization_id, label, basis, amount, phase, sequence)
values (current_setting('test.org_a')::uuid, 'Dirección de obra', 'monthly', 2000, 'construction', 2);

-- A new project gets them
with x as (insert into public.projects (organization_id, name) values (current_setting('test.org_a')::uuid, 'Fees test') returning id)
select set_config('test.fee_project', id::text, false) from x;
select pg_temp.check((select count(*) = 2 from public.fee_items where project_id = current_setting('test.fee_project')::uuid), 'new project copies the 2 default fees');
select pg_temp.check((select fees_total = 4000 and items_missing_months = 1 from public.project_fee_summary where project_id = current_setting('test.fee_project')::uuid),
                     'monthly fee without months counts 0 and is flagged');

update public.fee_items set months = 5 where project_id = current_setting('test.fee_project')::uuid and basis = 'monthly';
select pg_temp.check((select fees_total = 14000 from public.project_fee_summary where project_id = current_setting('test.fee_project')::uuid), '4000 + 2000 × 5 months = 14000');

-- % of construction: 10 % of the budget
insert into public.versions (organization_id, project_id, label) values (current_setting('test.org_a')::uuid, current_setting('test.fee_project')::uuid, 'A');
insert into public.line_items (organization_id, version_id, partida_id, quantity, unit_price)
select current_setting('test.org_a')::uuid, v.id, (select id from public.partidas where organization_id is null limit 1), 1, 50000
from public.versions v where v.project_id = current_setting('test.fee_project')::uuid;
insert into public.fee_items (organization_id, project_id, label, basis, percent)
values (current_setting('test.org_a')::uuid, current_setting('test.fee_project')::uuid, 'Honorarios %', 'percent', 10);
select pg_temp.check((select total = 5000 from public.project_fee_items where project_id = current_setting('test.fee_project')::uuid and basis = 'percent'),
                     '10 % of a 50 000 budget = 5000');
select pg_temp.check((select fees_total = 19000 and fees_pct = 38 from public.project_fee_summary where project_id = current_setting('test.fee_project')::uuid),
                     'summary adds all items and gives the effective %');

-- A % fee needs a percent; others need an amount
do $$ begin
  insert into public.fee_items (organization_id, project_id, label, basis, amount)
  values (current_setting('test.org_a')::uuid, current_setting('test.fee_project')::uuid, 'bad', 'percent', 100);
  raise exception 'FAIL: percent fee without percent accepted';
exception when check_violation then raise notice 'ok  - percent fee needs a percent';
end $$;

-- Received fees reduce what is outstanding
insert into public.payments (organization_id, project_id, direction, category, amount)
values (current_setting('test.org_a')::uuid, current_setting('test.fee_project')::uuid, 'in', 'client_fees', 4000);
select pg_temp.check((select fees_outstanding = 15000 from public.project_fee_summary where project_id = current_setting('test.fee_project')::uuid), 'received fees reduce outstanding');

-- apply_default_fees adds only the missing ones
delete from public.fee_items where project_id = current_setting('test.fee_project')::uuid and label = 'Proyecto';
select pg_temp.check((select public.apply_default_fees(current_setting('test.fee_project')::uuid) = 1), 'apply defaults adds the missing one only');

-- Another studio can't see them
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.fee_items where organization_id = current_setting('test.org_a')::uuid), 'other studios cannot read fees');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- Undo a fee change
select set_config('request.headers', '{"x-change-id":"c-fee-edit"}', false);
update public.fee_items set amount = 2500 where project_id = current_setting('test.fee_project')::uuid and basis = 'monthly';
select set_config('request.headers', '{}', false);
select public.undo_change('c-fee-edit');
select pg_temp.check((select amount = 2000 from public.fee_items where project_id = current_setting('test.fee_project')::uuid and basis = 'monthly'), 'undo restores the fee');

reset role;
\echo ARCHITECT FEES TESTS PASSED
