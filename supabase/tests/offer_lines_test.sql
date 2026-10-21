-- Offer-ready lines: supplied by, measurements, imports (budget and catalogue), totals.
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
  v_b uuid;
  r jsonb;
  v_line uuid;
  v_sub numeric;
begin
  insert into public.projects (organization_id, name, status) values (v_org, 'Import test', 'won') returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;

  -- His format: new codes become studio partidas, measurements set quantities, client lines apart
  r := public.import_budget(v_version, $j$[
    {"code": "DTL", "title": "Demolición de tabiques de ladrillo", "long_description": "Demolición de tabique de ladrillo hueco…",
     "unit": "m2", "chapter": "DEM", "unit_price": 18, "client_note": null, "measurement_note": "13,44 ml × 2,50 m",
     "reference_price": 12, "reference_source": "Precio est. Madrid 2026",
     "measurements": [{"label": "Cocina – hall", "count": 1, "length": 2.09, "height": 2.5},
                      {"label": "Hall – pasillo", "count": 1, "length": 0.91, "height": 2.5},
                      {"label": "Hueco puerta (a deducir)", "count": -1, "length": 0.8, "height": 2.1}]},
    {"code": "AT1", "title": "Ayudas a oficios", "unit": "pa", "chapter": "AYU", "quantity": 1, "unit_price": 2000},
    {"code": "OTRO3", "title": "Mobiliario de cocina", "unit": "pa", "chapter": "COC", "quantity": 1, "unit_price": 6000,
     "supplied_by": "client", "client_note": "Lo compra la propiedad"},
    {"code": "PAV-030", "quantity": 20, "unit_price": 30, "room": "Salón"}
  ]$j$::jsonb, false, 'Mecanismos Jung LS990 blanco.');
  perform pg_temp.check((r ->> 'added')::int = 4 and (r ->> 'new_partidas')::int = 3 and (r ->> 'measurements')::int = 3, 'import adds lines, new partidas, measurements (' || r::text || ')');
  select id into v_line from public.line_items li where version_id = v_version and source_ref = 'DTL';
  perform pg_temp.check((select quantity = 5.82 from public.line_items where id = v_line), 'quantity = sum of measurements (2.09×2.5 + 0.91×2.5 − 0.8×2.1 = 5.82)');
  perform pg_temp.check((select p.organization_id = v_org and p.long_description like 'Demolición%' from public.partidas p join public.line_items li on li.partida_id = p.id where li.id = v_line),
                        'new code is a studio partida with its description');
  perform pg_temp.check((select partida_id = (select id from public.partidas where code = 'PAV-030' and organization_id is null)
                          from public.line_items where version_id = v_version and source_ref = 'PAV-030'), 'known code uses the catalogue partida');
  select sum(subtotal) into v_sub from public.version_budget(v_version);
  perform pg_temp.check(v_sub = round(5.82 * 18, 2) + 2000 + 600, 'budget counts contractor lines only (' || v_sub || ')');
  perform pg_temp.check((select client_total = 6000 and subtotal = v_sub from public.version_totals where version_id = v_version), 'client purchases totalled apart');
  perform pg_temp.check((select general_notes like 'Mecanismos%' from public.versions where id = v_version), 'general notes stored');

  -- Round trip: update by id, only the keys given
  r := public.import_budget(v_version, jsonb_build_array(jsonb_build_object('id', v_line, 'unit_price', 20, 'client_note', 'A confirmar en obra')));
  perform pg_temp.check((r ->> 'updated')::int = 1 and (select unit_price = 20 and client_note = 'A confirmar en obra' and quantity = 5.82 and measurement_note is not null
                          from public.line_items where id = v_line), 'update by id changes only the given fields');

  -- Editing a measurement updates the quantity
  update public.line_measurements set length = 3.09 where line_id = v_line and label = 'Cocina – hall';
  perform pg_temp.check((select quantity = 8.32 from public.line_items where id = v_line), 'measurement edit updates the quantity');

  -- Delete missing
  r := public.import_budget(v_version, jsonb_build_array(jsonb_build_object('id', v_line)), true);
  perform pg_temp.check((r ->> 'deleted')::int = 3 and (select count(*) = 1 from public.line_items where version_id = v_version), 'delete missing removes the rest');

  -- Errors roll back everything
  begin
    perform public.import_budget(v_version, '[{"code": "PAV-030", "quantity": 1}, {"code": "ZZZ-1", "title": "x"}]'::jsonb);
    raise exception 'FAIL: unknown chapter accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'Row 2:%', 'bad row reported by number');
  end;
  perform pg_temp.check((select count(*) = 1 from public.line_items where version_id = v_version), 'failed import changed nothing');

  -- Copies keep measurements and new fields
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'B') returning id into v_b;
  perform public.copy_version_contents(v_version, v_b);
  perform pg_temp.check((select count(*) = 3 from public.line_measurements m join public.line_items l on l.id = m.line_id where l.version_id = v_b), 'measurements copied');
  perform pg_temp.check((select quantity = 8.32 and reference_price = 12 and client_note is not null from public.line_items where version_id = v_b), 'line fields copied');

  -- Catalogue import
  r := public.import_catalogue(v_org, $j$[
    {"code": "PAV-020", "price": 77, "confidence": "high"},
    {"code": "PAV-060", "title": "Rodapié DM lacado 10 cm"},
    {"code": "TER-001", "title": "Tarima exterior", "chapter": "PAV", "unit": "m2", "price": 95},
    {"code": "DTL", "long_description": "Texto revisado"}
  ]$j$::jsonb);
  perform pg_temp.check((r ->> 'created')::int = 2 and (r ->> 'updated')::int = 1 and (r ->> 'prices')::int = 2 and (r ->> 'unchanged')::int = 1,
                        'catalogue import: studio versions, new code, prices (' || r::text || ')');
  perform pg_temp.check((select unit_price = 77 from public.current_prices(v_org) cp join public.partidas p on p.id = cp.partida_id where p.code = 'PAV-020' and p.organization_id is null),
                        'new price is current');
  perform pg_temp.check((select short_description = 'Rodapié DM lacado 10 cm' from public.partidas where code = 'PAV-060' and organization_id = v_org), 'standard edited becomes studio version');
  perform pg_temp.check((select short_description like 'Rodapié lacado%' from public.partidas where code = 'PAV-060' and organization_id is null), 'standard untouched');
  r := public.import_catalogue(v_org, '[{"code": "PAV-020", "price": 77}]'::jsonb);
  perform pg_temp.check((r ->> 'prices')::int = 0, 'same price is not recorded twice');
end $$;
reset role;

\echo 'OFFER LINES TESTS PASSED'
