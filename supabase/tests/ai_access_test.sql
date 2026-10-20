-- AI access rules: tokens issued to an assistant (client_id claim) follow the studio's rules.
-- Runs after activity_test.sql (studio A has ai_connect = 'admins'; C is a viewer of A).
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

create or replace function pg_temp.rows_changed(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege or check_violation then
  return 0;
end $$;
grant execute on function pg_temp.rows_changed(text) to authenticated;

select set_config('test.rename_a', format('update public.projects set district = district where id = %L', current_setting('test.project_a')), false);
select set_config('test.org_update', format('update public.organizations set default_vat_pct = default_vat_pct where id = %L', current_setting('test.org_a')), false);

set role authenticated;
select set_config('request.headers', '{"x-change-id":"c-ai-rules","x-client-source":"mcp"}', false);

-- Owner through an assistant: reads and writes, but no admin powers
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claims', '{"client_id":"claude"}', false);
select pg_temp.check((select count(*) >= 1 from public.projects), 'owner''s assistant reads projects');
select pg_temp.check(pg_temp.rows_changed(current_setting('test.rename_a')) = 1, 'owner''s assistant edits a project');
select pg_temp.check(pg_temp.rows_changed(current_setting('test.org_update')) = 0, 'assistant cannot change studio settings');
select pg_temp.check((select count(*) = 0 from public.invitations), 'assistant cannot see invitations');
select set_config('request.jwt.claims', '', false);
select pg_temp.check(pg_temp.rows_changed(current_setting('test.org_update')) = 1, 'owner in the app still changes studio settings');

-- Viewer, rule = admins: the assistant sees nothing
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select set_config('request.jwt.claims', '{"client_id":"claude"}', false);
select pg_temp.check((select count(*) = 0 from public.projects), 'viewer''s assistant blocked when only admins may connect');
reset role;

update public.organizations set ai_connect = 'everyone', ai_changes = 'admins' where id = current_setting('test.org_a')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select set_config('request.jwt.claims', '{"client_id":"claude"}', false);
select pg_temp.check((select count(*) >= 1 from public.projects), 'viewer''s assistant reads when everyone may connect');
select pg_temp.check(pg_temp.rows_changed(current_setting('test.rename_a')) = 0, 'viewer''s assistant still cannot write');
reset role;

-- Member, changes = admins: the assistant reads only; the member in the app still writes
update public.members set role = 'member' where user_id = 'cccccccc-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select set_config('request.jwt.claims', '{"client_id":"claude"}', false);
select pg_temp.check(pg_temp.rows_changed(current_setting('test.rename_a')) = 0, 'member''s assistant read-only when only admins may allow changes');
select set_config('request.jwt.claims', '', false);
select pg_temp.check(pg_temp.rows_changed(current_setting('test.rename_a')) = 1, 'member writes in the app');
reset role;

update public.organizations set ai_changes = 'members' where id = current_setting('test.org_a')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select set_config('request.jwt.claims', '{"client_id":"claude"}', false);
select pg_temp.check(pg_temp.rows_changed(current_setting('test.rename_a')) = 1, 'member''s assistant writes when members may allow changes');
select set_config('request.jwt.claims', '', false);
reset role;

\echo 'AI ACCESS TESTS PASSED'
