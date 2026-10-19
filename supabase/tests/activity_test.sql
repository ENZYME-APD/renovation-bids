-- Activity log, undo, roles (viewer), invitations and studio settings.
-- Runs in the same session after the other test files (reuses studios A and B).
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected an error: %', p_label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok  - blocked: % (%)', p_label, sqlerrm;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'viewer@enzyme.test');
select pg_temp.check((select count(*) = 3 from public.profiles), 'profiles created for every user');

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- An app change, logged with who, what and the change id
select set_config('request.headers', '{"x-change-id":"c-rename","x-client-source":"app"}', false);
update public.projects set name = 'Renamed' where id = current_setting('test.project_a')::uuid;
select pg_temp.check((select count(*) = 1 and bool_and(source = 'app' and actor_email = 'jorge@enzyme.test'
                              and changed_fields = array['name'] and old_row ->> 'name' = 'Piso Chamberí')
                      from public.activity_log where change_id = 'c-rename'), 'update logged with actor, source and changed field');
select pg_temp.check(public.undo_change('c-rename') = 1, 'undo reverts the change');
select pg_temp.check((select name = 'Piso Chamberí' from public.projects where id = current_setting('test.project_a')::uuid), 'name restored');
select pg_temp.check((select undone_at is not null from public.activity_log where change_id = 'c-rename'), 'change marked as undone');

-- An AI change, then a delete that cascades, undone in one go
select set_config('request.headers', '{"x-change-id":"c-ai","x-client-source":"mcp"}', false);
update public.line_items set quantity = quantity + 1
 where version_id = current_setting('test.version_a')::uuid
   and partida_id = (select id from public.partidas where code = 'ES-PIN-001');
select pg_temp.check((select bool_and(source = 'ai') from public.activity_log where change_id = 'c-ai'), 'assistant change logged as ai');

select set_config('request.headers', '{"x-change-id":"c-delete"}', false);
do $$
declare v_lines int;
begin
  select count(*) into v_lines from public.line_items where version_id = current_setting('test.version_a')::uuid;
  perform set_config('test.lines_before', v_lines::text, false);
end $$;
delete from public.versions where id = current_setting('test.version_a')::uuid;
select pg_temp.check((select count(*) = 0 from public.line_items where version_id = current_setting('test.version_a')::uuid), 'version and its lines deleted');
select pg_temp.check(public.undo_change('c-delete') >= 1, 'undo of a cascaded delete runs');
select pg_temp.check((select count(*) = current_setting('test.lines_before')::int from public.line_items
                      where version_id = current_setting('test.version_a')::uuid), 'version and all its lines restored');

-- Edited after the change: undo refuses
select set_config('request.headers', '{"x-change-id":"c-district"}', false);
update public.projects set district = 'Salamanca' where id = current_setting('test.project_a')::uuid;
select set_config('request.headers', '{"x-change-id":"c-district-2"}', false);
update public.projects set district = 'Retiro' where id = current_setting('test.project_a')::uuid;
select pg_temp.expect_error('select public.undo_change(''c-district'')', 'undo of a change edited since');

-- Studio settings (owner)
select set_config('request.headers', '{"x-change-id":"c-settings"}', false);
update public.organizations set currency = 'EUR', default_contingency_pct = 8, ai_connect = 'admins'
 where id = current_setting('test.org_a')::uuid;
select pg_temp.check((select default_contingency_pct = 8 from public.organizations where id = current_setting('test.org_a')::uuid), 'owner updates studio settings');

-- Invitation for a viewer
with t as (
  insert into public.invitations (organization_id, email, role, invited_by)
  values (current_setting('test.org_a')::uuid, 'viewer@enzyme.test', 'viewer', 'aaaaaaaa-0000-0000-0000-000000000001')
  returning token)
select set_config('test.invite', token, false) from t;
select pg_temp.expect_error(
  format('update public.members set role = ''member'' where user_id = %L', 'aaaaaaaa-0000-0000-0000-000000000001'),
  'last owner demoting themselves');

-- B cannot see A's log or invitations
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.activity_log where organization_id = current_setting('test.org_a')::uuid), 'B cannot read A''s activity');
select pg_temp.check((select count(*) = 0 from public.invitations), 'B cannot see A''s invitations');
select pg_temp.expect_error('select public.accept_invitation(current_setting(''test.invite''))', 'B accepting an invite meant for someone else');
select pg_temp.expect_error('select public.undo_change(''c-settings'')', 'B undoing A''s change');

-- The viewer accepts, can read, cannot write or undo
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select pg_temp.check((select studio = 'Enzyme' and role = 'viewer' from public.get_invitation(current_setting('test.invite'))), 'invite page shows studio and role');
select pg_temp.check(public.accept_invitation(current_setting('test.invite')) = current_setting('test.org_a')::uuid, 'viewer accepts the invitation');
select pg_temp.expect_error('select public.accept_invitation(current_setting(''test.invite''))', 'reusing an invitation');
select pg_temp.check((select count(*) >= 1 from public.projects), 'viewer reads projects');
select pg_temp.check((select count(*) > 0 from public.activity_log), 'viewer reads the activity log');
select pg_temp.expect_error(
  format('insert into public.projects (organization_id, name) values (%L, ''x'')', current_setting('test.org_a')),
  'viewer creating a project');
do $$
declare n int;
begin
  update public.projects set name = 'viewer edit' where organization_id = current_setting('test.org_a')::uuid;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'viewer cannot edit projects');
  update public.organizations set currency = 'USD' where id = current_setting('test.org_a')::uuid;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'viewer cannot change studio settings');
end $$;
select pg_temp.expect_error('select public.undo_change(''c-settings'')', 'viewer undoing a change');
reset role;

\echo 'ACTIVITY TESTS PASSED'
