-- Rooms with geometry: area, perimeter, height, openings; estimates; recalculation; copies; locks.
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

select pg_temp.check(public.estimate_perimeter(6) = 10.00, '6 m² as 1:1.5 rectangle (2 × 3 m) → 10 m perimeter');
select pg_temp.check(public.room_line_quantity(0, 0, 1, 0, 10, 13, 2.5, 3.5) = 29, 'wall area = 13 × 2.5 − 3.5 = 29 m²');
select pg_temp.check(public.room_line_quantity(1, 0, 1, 0, 4, 8, 3, 0) = 28, 'floor + walls = 4 + 24');
select pg_temp.check((select per_wall_area = 1 and factor = 0 from public.room_template_lines tl join public.room_templates t on t.id = tl.template_id
                       join public.partidas p on p.id = tl.partida_id where t.code = 'BAN' and t.organization_id is null and p.code = 'REV-010'),
                     'standard bathroom tiles by wall area');
select pg_temp.check((select per_perimeter = 1 from public.room_template_lines tl join public.room_templates t on t.id = tl.template_id
                       join public.partidas p on p.id = tl.partida_id where t.code = 'DOR' and t.organization_id is null and p.code = 'PAV-060'),
                     'standard skirting by perimeter');

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid;
  v_version uuid;
  v_b uuid;
  v_room uuid;
  v_room2 uuid;
  v_dor uuid := (select id from public.room_templates where code = 'DOR' and organization_id is null);
  v_ban uuid := (select id from public.room_templates where code = 'BAN' and organization_id is null);
  v_ven uuid := (select id from public.room_templates where code = 'VEN' and organization_id is null);
  q numeric;
  n int;
  rm public.rooms;
begin
  insert into public.projects (organization_id, name, status, room_height) values (v_org, 'Geometry', 'pricing', 2.8) returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;

  -- Measured bedroom: 12 m², 14 m perimeter, 2.5 m high, 3.5 m² of openings
  v_room := public.add_room(v_version, v_dor, 12, 'Dormitorio 1', 2.5, 14, 3.5, 'model_zone', 'zone-1');
  select * into rm from public.rooms where id = v_room;
  perform pg_temp.check(not rm.perimeter_estimated and not rm.height_assumed and rm.source = 'model_zone', 'measured room stored as given');
  select quantity into q from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room and p.code = 'PIN-010';
  perform pg_temp.check(q = 31.5, 'wall paint = 14 × 2.5 − 3.5 = 31.5 m² (' || q || ')');
  select quantity into q from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room and p.code = 'PAV-060';
  perform pg_temp.check(q = 14, 'skirting = perimeter');
  select quantity into q from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room and p.code = 'PAV-030';
  perform pg_temp.check(q = 12, 'floor = area');
  perform pg_temp.check((select bool_and(room = 'Dormitorio 1' and source = 'model_zone' and source_ref = 'zone-1') from public.line_items where room_id = v_room),
                        'lines carry room name and source');

  -- Only an area: perimeter estimated, height from the project
  v_room2 := public.add_room(v_version, v_ban, 6, 'Baño');
  select * into rm from public.rooms where id = v_room2;
  perform pg_temp.check(rm.perimeter = 10 and rm.perimeter_estimated and rm.height = 2.8 and rm.height_assumed, 'perimeter estimated, project height used');
  select quantity into q from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room2 and p.code = 'REV-010';
  perform pg_temp.check(q = 28, 'tiling = 10 × 2.8 = 28 m²');

  -- Per-unit template needs no perimeter
  v_room := public.add_room(v_version, v_ven, 3, 'Ventanas');
  perform pg_temp.check((select perimeter is null and not perimeter_estimated from public.rooms where id = v_room), 'windows: no perimeter estimate');

  -- Measuring the bathroom later recalculates its lines, except one edited by hand
  update public.line_items set quantity = 1.5
   where room_id = v_room2 and partida_id = (select id from public.partidas where code = 'SAN-090' and organization_id is null);
  n := public.update_room(v_room2, p_perimeter => 11, p_height => 2.5, p_openings => 1.6);
  select quantity into q from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room2 and p.code = 'REV-010';
  perform pg_temp.check(q = 25.9, 'tiling recalculated: 11 × 2.5 − 1.6 = 25.9 (' || q || ')');
  perform pg_temp.check((select not overridden from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room2 and p.code = 'REV-010'),
                        'recalculated line is not marked edited');
  perform pg_temp.check((select quantity = 1.5 and overridden from public.line_items li join public.partidas p on p.id = li.partida_id where li.room_id = v_room2 and p.code = 'SAN-090'),
                        'hand-edited line kept');
  perform pg_temp.check((select not perimeter_estimated and not height_assumed from public.rooms where id = v_room2), 'room now measured');

  -- Rename carries to lines; a new area re-estimates only an estimated perimeter
  perform public.update_room(v_room2, p_name => 'Baño principal', p_size => 7);
  perform pg_temp.check((select perimeter = 11 from public.rooms where id = v_room2), 'measured perimeter kept on new area');
  perform pg_temp.check((select bool_and(room = 'Baño principal') from public.line_items where room_id = v_room2), 'rename carried to lines');

  -- Copy to a new option keeps rooms and links
  update public.projects set status = 'won' where id = v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B') returning id into v_b;
  n := public.copy_version_contents(v_version, v_b);
  perform pg_temp.check((select count(*) from public.rooms where version_id = v_b) = 3, 'rooms copied');
  perform pg_temp.check((select count(*) = 0 from public.line_items l join public.rooms r on r.id = l.room_id where l.version_id = v_b and r.version_id <> v_b),
                        'copied lines point at copied rooms');
  perform pg_temp.check(n = (select count(*) from public.line_items where version_id = v_version), 'all lines copied');

  -- Removing a room removes its lines
  delete from public.rooms where id = (select id from public.rooms where version_id = v_b and name = 'Ventanas');
  perform pg_temp.check((select count(*) = 0 from public.line_items where version_id = v_b and room = 'Ventanas'), 'room delete removes its lines');

  -- Contract copies rooms and locks them
  perform set_config('test.geo_contract', public.sign_contract(v_project, v_b, null, current_date)::text, false);
  perform pg_temp.check((select count(*) = 2 from public.rooms where version_id = current_setting('test.geo_contract')::uuid), 'contract has the rooms');
  begin
    perform public.update_room((select id from public.rooms where version_id = current_setting('test.geo_contract')::uuid limit 1), p_height => 3);
    raise exception 'FAIL: contract room edited';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like '%signed contract%', 'contract rooms are locked');
  end;
end $$;

-- Adding a room is one change, and undo removes the room and its lines
select set_config('request.headers', '{"x-change-id":"c-room","x-client-source":"app"}', false);
do $$
declare v_room uuid;
begin
  v_room := public.add_room((select id from public.versions where label = 'A' and project_id = (select id from public.projects where name = 'Geometry')),
                            (select id from public.room_templates where code = 'SAL' and organization_id is null), 20, 'Salón');
  perform set_config('test.geo_room', v_room::text, false);
end $$;
select set_config('request.headers', '{}', false);
select public.undo_change('c-room');
select pg_temp.check((select count(*) = 0 from public.rooms where id = current_setting('test.geo_room')::uuid), 'undo removes the room');
select pg_temp.check((select count(*) = 0 from public.line_items where room_id = current_setting('test.geo_room')::uuid), 'undo removes its lines');

-- Other studio cannot see the rooms
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.rooms where organization_id = current_setting('test.org_a')::uuid), 'rooms are private to the studio');
reset role;

\echo 'ROOM GEOMETRY TESTS PASSED'
