-- Costing loop: line sources and overrides, studio room templates, matching, bid options setting.
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

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid;
  v_version uuid;
  v_ban uuid := (select id from public.room_templates where code = 'BAN' and organization_id is null);
  v_copy uuid;
  v_line uuid;
  n int;
begin
  insert into public.projects (organization_id, name, status) values (v_org, 'Costing loop', 'pricing') returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;

  -- Template lines record their source
  n := public.apply_room_template(v_version, v_ban, 5, 'Baño');
  perform pg_temp.check((select bool_and(source = 'template' and template_id = v_ban and not overridden) from public.line_items where version_id = v_version),
                        'template lines record source and template');
  -- A model zone brings its zone id
  n := public.apply_room_template(v_version, (select id from public.room_templates where code = 'DOR' and organization_id is null), 12, 'Dormitorio 1', 'model_zone', 'zone-guid-1');
  perform pg_temp.check((select count(*) = n and bool_and(source_ref = 'zone-guid-1') from public.line_items where version_id = v_version and source = 'model_zone'),
                        'zone lines keyed by zone id');

  -- Editing a generated line's quantity marks it overridden; a price change does not
  select id into v_line from public.line_items where version_id = v_version and source = 'template' limit 1;
  update public.line_items set unit_price = 10, state = 'priced' where id = v_line;
  perform pg_temp.check((select not overridden from public.line_items where id = v_line), 'price edit does not mark overridden');
  update public.line_items set quantity = quantity + 1 where id = v_line;
  perform pg_temp.check((select overridden from public.line_items where id = v_line), 'quantity edit marks overridden');
  update public.line_items set overridden = false, quantity = quantity - 1 where id = v_line;
  perform pg_temp.check((select not overridden from public.line_items where id = v_line), 'explicit reset is kept');

  -- A sync's own update does not count
  perform set_config('app.syncing', 'on', true);
  update public.line_items set quantity = quantity + 2 where id = v_line;
  perform set_config('app.syncing', '', true);
  perform pg_temp.check((select not overridden from public.line_items where id = v_line), 'sync update does not mark overridden');

  -- Manual lines are never flagged
  insert into public.line_items (organization_id, version_id, partida_id, quantity)
  values (v_org, v_version, (select id from public.partidas where code = 'PAV-020' and organization_id is null), 3) returning id into v_line;
  update public.line_items set quantity = 4 where id = v_line;
  perform pg_temp.check((select source = 'manual' and not overridden from public.line_items where id = v_line), 'manual lines stay manual');

  -- Studio copy of a template replaces the standard one
  v_copy := public.copy_room_template(v_org, v_ban);
  perform pg_temp.check(v_copy <> v_ban and (select organization_id = v_org and code = 'BAN' from public.room_templates where id = v_copy), 'copy made in the studio');
  perform pg_temp.check((select count(*) from public.room_template_lines where template_id = v_copy) = (select count(*) from public.room_template_lines where template_id = v_ban),
                        'copy has all lines');
  perform pg_temp.check(public.copy_room_template(v_org, v_ban) = v_copy, 'copying again returns the same copy');
  perform pg_temp.check((select count(*) = 1 from public.effective_room_templates(v_org) where code = 'BAN'), 'studio sees one BAN');
  perform pg_temp.check((select id = v_copy from public.effective_room_templates(v_org) where code = 'BAN'), 'studio BAN is its copy');
  update public.room_template_lines set factor = 4.0
   where template_id = v_copy and partida_id = (select id from public.partidas where code = 'REV-010' and organization_id is null);
  perform pg_temp.check((select factor = 3.7 from public.room_template_lines
                          where template_id = v_ban and partida_id = (select id from public.partidas where code = 'REV-010' and organization_id is null)),
                        'editing the copy leaves the standard alone');

  -- Matching names and categories to templates
  perform pg_temp.check(public.match_room_template(v_org, 'Baño 2') = v_copy, '"Baño 2" matches the studio bathroom');
  perform pg_temp.check((select code from public.room_templates where id = public.match_room_template(v_org, 'ASEO')) = 'ASE', 'case-insensitive category match');
  perform pg_temp.check((select code from public.room_templates where id = public.match_room_template(v_org, 'Salón-comedor')) = 'SAL', 'longest term wins');
  perform pg_temp.check(public.match_room_template(v_org, 'Trastero') is null, 'no match → none');
  update public.room_templates set active = false where id = v_copy;
  perform pg_temp.check(public.match_room_template(v_org, 'Baño 2') is null, 'hidden template is not matched');
  update public.room_templates set active = true where id = v_copy;

  -- Options in the bid: off by default, on when the studio allows them
  begin
    insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B');
    raise exception 'FAIL: option allowed in bid';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'Bid stage%', 'bid options blocked by default');
  end;
  update public.organizations set allow_bid_options = true where id = v_org;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B');
  perform pg_temp.check(true, 'bid option allowed when the studio allows it');
  update public.organizations set allow_bid_options = false where id = v_org;

  perform set_config('test.cl_copy', v_copy::text, false);
end $$;

-- Another studio sees the standard BAN, not studio A's copy, and cannot copy into A
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.room_templates where id = current_setting('test.cl_copy')::uuid), 'other studio cannot see the copy');
select pg_temp.check((select organization_id is null from public.effective_room_templates(current_setting('test.org_b')::uuid) where code = 'BAN'), 'other studio keeps the standard BAN');
do $$
begin
  perform public.copy_room_template(current_setting('test.org_a')::uuid, (select id from public.room_templates where code = 'DOR' and organization_id is null));
  raise exception 'FAIL: copied into another studio';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  perform pg_temp.check(true, 'cannot copy into another studio');
end $$;
reset role;

\echo 'COSTING LOOP TESTS PASSED'
