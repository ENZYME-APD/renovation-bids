-- Deleting projects: owners and admins only; everything under it goes; undo brings it back.
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

-- A member (the colleague who joined by domain) cannot delete
select set_config('request.jwt.claim.sub', 'c0ffee00-0000-0000-0000-0000000000a3', false);
delete from public.projects where id = current_setting('test.lc_project')::uuid;
select pg_temp.check((select count(*) = 1 from public.projects where id = current_setting('test.lc_project')::uuid), 'member cannot delete a project');

-- The owner deletes a project with a signed contract, change orders and rooms
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.sign_contract(current_setting('test.lc_project')::uuid, (select id from public.versions where project_id = current_setting('test.lc_project')::uuid and label = 'A'), null, current_date)
  where not exists (select 1 from public.projects where id = current_setting('test.lc_project')::uuid and contract_version_id is not null);
select set_config('test.lc_lines', (select count(*)::text from public.line_items l join public.versions v on v.id = l.version_id where v.project_id = current_setting('test.lc_project')::uuid), false);
select set_config('request.headers', '{"x-change-id":"c-del-project"}', false);
delete from public.projects where id = current_setting('test.lc_project')::uuid;
select set_config('request.headers', '{}', false);
select pg_temp.check((select count(*) = 0 from public.projects where id = current_setting('test.lc_project')::uuid), 'owner deletes a project with a signed contract');
select pg_temp.check((select count(*) = 0 from public.versions where project_id = current_setting('test.lc_project')::uuid)
                 and (select count(*) = 0 from public.change_orders where project_id = current_setting('test.lc_project')::uuid), 'versions and change orders go with it');

-- Undo brings it back, locked contract included
select public.undo_change('c-del-project');
select pg_temp.check((select count(*) = 1 from public.projects where id = current_setting('test.lc_project')::uuid), 'undo restores the project');
select pg_temp.check((select count(*)::text = current_setting('test.lc_lines') from public.line_items l join public.versions v on v.id = l.version_id
                       where v.project_id = current_setting('test.lc_project')::uuid), 'undo restores every line');
select pg_temp.check((select bool_and(locked) from public.versions v join public.projects p on p.contract_version_id = v.id where p.id = current_setting('test.lc_project')::uuid),
                     'contract still locked after undo');

-- A project with purchases, invoices and payments
delete from public.projects where id = (select project_id from public.purchase_orders where organization_id = current_setting('test.org_a')::uuid limit 1);
select pg_temp.check((select count(*) = 0 from public.purchase_orders where organization_id = current_setting('test.org_a')::uuid), 'project with purchases deleted');
reset role;

\echo 'DELETE PROJECT TESTS PASSED'
