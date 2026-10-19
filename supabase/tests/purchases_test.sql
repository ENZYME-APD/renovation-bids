-- Purchasing, cost control, dashboard views. Same session as the other test files.
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
select set_config('request.headers', '{"x-change-id":"c-po"}', false);

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid := current_setting('test.project_a')::uuid;
  v_sup uuid := current_setting('test.supplier_a')::uuid;
  v_po uuid;
  v_line uuid;
  v_inv uuid;
  v_code text;
  r record;
begin
  update public.projects set status = 'won', area_m2 = 92 where id = v_project;

  insert into public.purchase_orders (organization_id, project_id, supplier_id, status, ordered_on, expected_on)
  values (v_org, v_project, v_sup, 'confirmed', current_date - 10, current_date - 1)
  returning id, code into v_po, v_code;
  perform pg_temp.check(v_code = 'PO-0001', 'purchase order numbered per studio (' || v_code || ')');

  insert into public.purchase_order_lines (organization_id, purchase_order_id, line_item_id, partida_id, description, unit, quantity, unit_cost)
  select v_org, v_po, li.id, li.partida_id, 'Alicatado', 'm2', 42, 34
  from public.line_items li join public.partidas p on p.id = li.partida_id
  where li.version_id = current_setting('test.version_a')::uuid and p.code = 'ES-REV-001'
  returning id into v_line;

  insert into public.supplier_invoices (organization_id, project_id, supplier_id, purchase_order_id, number, due_on, net_amount, vat_amount)
  values (v_org, v_project, v_sup, v_po, 'F-17', current_date + 3, 1428, 142.80) returning id into v_inv;
  insert into public.payments (organization_id, project_id, direction, category, amount, supplier_id, invoice_id, concept)
  values (v_org, v_project, 'out', 'materials', 1000, v_sup, v_inv, 'Pago parcial');
  insert into public.payments (organization_id, project_id, direction, category, amount, concept)
  values (v_org, v_project, 'in', 'client_works', 5000, 'Primer pago cliente');

  select * into r from public.project_money where project_id = v_project;
  perform pg_temp.check(r.committed = 1428 and r.invoiced = 1570.80 and r.paid_out = 1000 and r.paid_materials = 1000
                        and r.received_works = 5000, 'project money: committed, invoiced, paid, received');
  perform pg_temp.check((select outstanding = 570.80 from public.invoice_balances where id = v_inv), 'invoice outstanding = total − payments');
  perform pg_temp.check((select committed = 1428 from public.project_cost_by_trade
                         where project_id = v_project and committed > 0), 'committed cost lands on the right chapter');
  perform pg_temp.check((select count(*) = 1 from public.action_items where kind = 'delivery_late' and ref_id = v_po), 'late delivery is an action item');
  perform pg_temp.check((select count(*) = 1 from public.action_items where kind = 'invoice_due' and ref_id = v_inv), 'invoice due soon is an action item');
  perform pg_temp.check((select eur_per_m2 is not null and subtotal > 0 from public.project_stats where project_id = v_project), 'project stats with €/m²');

  perform public.record_actual_price(v_line);
  perform pg_temp.check((select unit_price = 34 and confidence = 'high' and source = 'history'
                         from public.prices where notes = 'From PO-0001'), 'delivered cost saved as a high-confidence price');

  begin
    insert into public.payments (organization_id, project_id, direction, category, amount)
    values (v_org, v_project, 'in', 'materials', 10);
    raise exception 'FAIL: client payment booked as materials';
  exception when check_violation then
    perform pg_temp.check(true, 'money in must be a client payment');
  end;
end $$;

select pg_temp.check((select count(*) >= 5 from public.activity_log where change_id = 'c-po' and table_name in ('purchase_orders', 'purchase_order_lines', 'supplier_invoices', 'payments')),
                     'purchasing changes are in the activity log');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.purchase_orders) and (select count(*) = 0 from public.payments)
                     and (select count(*) = 0 from public.project_money where organization_id = current_setting('test.org_a')::uuid)
                     and (select count(*) = 0 from public.action_items where organization_id = current_setting('test.org_a')::uuid),
                     'B sees none of A''s purchasing or dashboard data');
reset role;
\echo 'PURCHASES TESTS PASSED'
