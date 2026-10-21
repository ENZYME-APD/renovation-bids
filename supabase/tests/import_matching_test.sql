-- Import with matching: chosen partidas, new partidas with standard codes, catalogue issues.
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

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid;
  v_version uuid;
  v_dem050 uuid := (select id from public.partidas where code = 'DEM-050' and organization_id is null);
  r jsonb;
  v_max text;
begin
  insert into public.projects (organization_id, name, status) values (v_org, 'Matching test', 'pricing') returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;
  select max(code) into v_max from public.partidas where code ~ '^CLI-\d+$' and (organization_id is null or organization_id = v_org);

  r := public.import_budget(v_version, jsonb_build_array(
    jsonb_build_object('code', 'DTL', 'partida_id', v_dem050, 'quantity', 33.6, 'unit_price', 18, 'description', 'Paredes en rojo del plano de demolición'),
    jsonb_build_object('code', 'C-CAL', 'new_partida', true, 'chapter', 'CLI', 'title', 'Caldera de condensación', 'unit', 'ud', 'quantity', 1, 'unit_price', 1600),
    jsonb_build_object('code', 'E-C+LED-1', 'new_partida', true, 'chapter', 'ELE', 'title', 'Conmutado + LED foseado', 'unit', 'ud', 'quantity', 1, 'unit_price', 80, 'room', 'Niños 1'),
    jsonb_build_object('code', 'E-C+LED-2', 'new_partida', true, 'chapter', 'ELE', 'title', 'Conmutado + LED foseado', 'unit', 'ud', 'quantity', 1, 'unit_price', 80, 'room', 'Niños 2')
  ));
  perform pg_temp.check((r ->> 'added')::int = 4 and (r ->> 'new_partidas')::int = 2, 'four lines, two new partidas (' || r::text || ')');
  perform pg_temp.check((select partida_id = v_dem050 and source_ref = 'DTL' and description like 'Paredes%' from public.line_items where version_id = v_version and source_ref = 'DTL'),
                        'chosen standard partida used; file code kept as reference; job description kept');
  perform pg_temp.check((select p.code = 'CLI-' || lpad((((substring(v_max from '-(\d+)$')::int / 10) + 1) * 10)::text, 3, '0')
                          from public.line_items l join public.partidas p on p.id = l.partida_id where l.source_ref = 'C-CAL'),
                        'new partida gets the next standard code in its chapter');
  perform pg_temp.check((select count(distinct partida_id) = 1 from public.line_items where version_id = v_version and source_ref like 'E-C+LED-%'),
                        'same new item in two rooms is one partida');
  perform pg_temp.check((select bool_and(p.organization_id = v_org and p.code ~ '^[A-Z]{3}-\d{3}$') from public.line_items l join public.partidas p on p.id = l.partida_id
                          where l.version_id = v_version and l.source_ref <> 'DTL'), 'new partidas follow the scheme');

  -- A partida from another studio cannot be chosen
  begin
    perform public.import_budget(v_version, jsonb_build_array(jsonb_build_object('partida_id', (select id from public.partidas where code = 'B-PRIV-001'), 'quantity', 1)));
    raise exception 'FAIL: other studio partida accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'Row 1:%', 'another studio''s partida refused');
  end;

  -- Catalogue issues: codes outside the scheme show up for cleaning
  perform pg_temp.check((select count(*) > 0 from public.catalogue_issues where code = 'DTL' or code = 'AT1'), 'file codes from the old import flagged');
  perform pg_temp.check((select count(*) = 0 from public.catalogue_issues where code ~ '^CLI-\d{3}$' and 'code outside the scheme' = any (issues)), 'new standard codes not flagged as outside the scheme');
end $$;
reset role;

\echo 'IMPORT MATCHING TESTS PASSED'
