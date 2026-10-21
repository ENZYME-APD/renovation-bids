-- Joining a studio by company email domain.
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('c0ffee00-0000-0000-0000-0000000000a3', 'colleague@enzyme.test', now()),
  ('c0ffee00-0000-0000-0000-0000000000a4', 'unverified@enzyme.test', null),
  ('c0ffee00-0000-0000-0000-0000000000a5', 'someone@other.test', now());

set role authenticated;

-- Owner of studio A claims its domain; public or foreign domains are refused
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
begin
  begin
    update public.organizations set email_domain = 'gmail.com' where id = current_setting('test.org_a')::uuid;
    raise exception 'FAIL: public domain accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'Public email%', 'public mail domain refused');
  end;
  begin
    update public.organizations set email_domain = 'other.test' where id = current_setting('test.org_a')::uuid;
    raise exception 'FAIL: foreign domain accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'You can only set your own%', 'someone else''s domain refused');
  end;
  update public.organizations set email_domain = 'Enzyme.test' where id = current_setting('test.org_a')::uuid;
  perform pg_temp.check((select email_domain = 'enzyme.test' from public.organizations where id = current_setting('test.org_a')::uuid), 'own domain set (lower-cased)');
  perform pg_temp.check((select count(*) = 0 from public.joinable_studios()), 'members are not offered their own studio');
end $$;

-- A verified colleague on the domain sees it and joins as member
select set_config('request.jwt.claim.sub', 'c0ffee00-0000-0000-0000-0000000000a3', false);
select pg_temp.check((select count(*) = 1 and bool_and(id = current_setting('test.org_a')::uuid) from public.joinable_studios()), 'colleague is offered the studio');
select public.join_studio_by_domain(current_setting('test.org_a')::uuid);
select pg_temp.check((select role = 'member' from public.members where user_id = 'c0ffee00-0000-0000-0000-0000000000a3'), 'colleague joined as member');
select pg_temp.check((select count(*) > 0 from public.projects), 'colleague sees the studio''s projects');
select pg_temp.check((select count(*) = 0 from public.joinable_studios()), 'not offered again');

-- Unverified email and other domains cannot join
select set_config('request.jwt.claim.sub', 'c0ffee00-0000-0000-0000-0000000000a4', false);
select pg_temp.check((select count(*) = 0 from public.joinable_studios()), 'unverified email not offered');
do $$
begin
  perform public.join_studio_by_domain(current_setting('test.org_a')::uuid);
  raise exception 'FAIL: unverified joined';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  perform pg_temp.check(true, 'unverified email cannot join');
end $$;
select set_config('request.jwt.claim.sub', 'c0ffee00-0000-0000-0000-0000000000a5', false);
do $$
begin
  perform public.join_studio_by_domain(current_setting('test.org_a')::uuid);
  raise exception 'FAIL: other domain joined';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  perform pg_temp.check(true, 'other domain cannot join');
end $$;

-- Members cannot change the domain (admins only)
select set_config('request.jwt.claim.sub', 'c0ffee00-0000-0000-0000-0000000000a3', false);
update public.organizations set email_domain = null where id = current_setting('test.org_a')::uuid;
select pg_temp.check((select email_domain = 'enzyme.test' from public.organizations where id = current_setting('test.org_a')::uuid), 'member cannot change the domain');
reset role;

\echo 'DOMAIN JOIN TESTS PASSED'
