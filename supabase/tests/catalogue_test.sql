-- Catalogue, room templates and the bid-stage version rule.
-- Runs after rls_and_flow_test.sql (reuses its users and studios).
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

select pg_temp.check((select count(*) = 20 from public.trades where code is not null and active), '20 active chapters');
select pg_temp.check((select count(*) >= 90 from public.partidas where active and organization_id is null and code !~ '^ES-'), 'catalogue partidas loaded');
select pg_temp.check((select count(*) = 0 from public.partidas where active and code like 'ES-%'), 'placeholder partidas retired');
select pg_temp.check((select count(*) = 10 from public.room_templates), '10 room templates');
select pg_temp.check((select count(*) = 0 from public.room_template_lines tl left join public.partidas p on p.id = tl.partida_id where p.id is null), 'every template line points at a partida');

-- Studio A: a priced item, then a bathroom from its template
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid;
  v_version uuid;
  n int;
  v_tile numeric;
begin
  insert into public.prices (region_id, organization_id, partida_id, unit_price, source, confidence)
  select 'es', v_org, id, 90, 'history', 'medium' from public.partidas where code = 'REV-010';

  insert into public.projects (organization_id, name, status) values (v_org, 'Template test', 'pricing') returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;

  n := public.apply_room_template(v_version, (select id from public.room_templates where code = 'BAN'), 5, 'Baño principal');
  perform pg_temp.check(n = (select count(*) from public.room_template_lines tl join public.room_templates t on t.id = tl.template_id where t.code = 'BAN'),
                        'bathroom template adds one line per item (' || n || ')');
  select li.quantity into v_tile from public.line_items li join public.partidas p on p.id = li.partida_id
   where li.version_id = v_version and p.code = 'REV-010';
  perform pg_temp.check(v_tile = 18.5, 'wall tiling = 3.7 × 5 m² = 18.5 m²');
  perform pg_temp.check((select unit_price = 90 and state = 'priced' from public.line_items li join public.partidas p on p.id = li.partida_id
                          where li.version_id = v_version and p.code = 'REV-010'), 'line picks up the studio''s own price');
  perform pg_temp.check((select bool_and(notes = 'Baño principal') from public.line_items where version_id = v_version), 'lines labelled with the room');
  perform pg_temp.check((select count(*) = 0 from public.line_items li join public.partidas p on p.id = li.partida_id
                          where li.version_id = v_version and p.code = 'SAN-010' and li.quantity <> 1), 'fixed items count once per room');

  -- Bid stage: no second version until won
  begin
    insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B');
    raise exception 'FAIL: second version allowed during bid stage';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'Bid stage%', 'second version blocked during bid stage');
  end;
  update public.projects set status = 'won' where id = v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B');
  perform pg_temp.check(true, 'second version allowed once won');
  perform set_config('test.version_t', v_version::text, false);
end $$;

-- Studio B cannot apply a template into A's version
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
begin
  perform public.apply_room_template(current_setting('test.version_t')::uuid, (select id from public.room_templates where code = 'DOR'), 10, null);
  raise exception 'FAIL: B wrote into A''s version';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  perform pg_temp.check(true, 'B cannot add rooms to A''s version (' || sqlerrm || ')');
end $$;
select pg_temp.check((select count(*) = 10 from public.room_templates), 'B sees the shared templates');
reset role;

\echo 'CATALOGUE TESTS PASSED'
