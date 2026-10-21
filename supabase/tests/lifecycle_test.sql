-- Lifecycle: phases, signed contract (locked baseline), change orders and the current budget.
-- Runs after the other files (studio A owned by aaaa…, studio B by bbbb…).
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

set role authenticated;
select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{"x-change-id":"lc-setup"}', false);

do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid;
  v_version uuid;
begin
  insert into public.projects (organization_id, name, status) values (v_org, 'Lifecycle flat', 'pricing') returning id into v_project;
  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;
  perform public.apply_room_template(v_version, (select id from public.room_templates where code = 'BAN'), 5, 'Baño');
  perform set_config('test.lc_project', v_project::text, false);
  perform set_config('test.lc_version', v_version::text, false);
  perform pg_temp.check((select phase = 'bid' from public.projects where id = v_project), 'new project starts in the bid phase');
end $$;

-- Sign the contract (also marks the project won and moves it to design)
select set_config('request.headers', '{"x-change-id":"lc-sign"}', false);
select set_config('test.lc_contract',
  public.sign_contract(current_setting('test.lc_project')::uuid, current_setting('test.lc_version')::uuid, null, date '2026-10-01')::text, false);
select pg_temp.check((select status = 'won' and phase = 'design' and contract_signed_on = date '2026-10-01'
                             and contract_version_id = current_setting('test.lc_contract')::uuid
                        from public.projects where id = current_setting('test.lc_project')::uuid), 'signing marks won, design phase, contract recorded');
select pg_temp.check((select locked from public.versions where id = current_setting('test.lc_contract')::uuid), 'contract version is locked');
select pg_temp.check((select count(*) from public.line_items where version_id = current_setting('test.lc_contract')::uuid)
                     = (select count(*) from public.line_items where version_id = current_setting('test.lc_version')::uuid), 'contract copies every line');
select pg_temp.check((select contract_value = (select sum(total) from public.line_items where version_id = current_setting('test.lc_contract')::uuid)
                        from public.projects where id = current_setting('test.lc_project')::uuid), 'contract value defaults to the budget total');
select pg_temp.check((select version_id = current_setting('test.lc_contract')::uuid from public.project_main_version
                        where project_id = current_setting('test.lc_project')::uuid), 'the contract becomes the main version');
select pg_temp.expect_error(format('update public.line_items set quantity = 99 where version_id = %L', current_setting('test.lc_contract')), 'editing the contract budget');
select pg_temp.expect_error(format('delete from public.line_items where version_id = %L', current_setting('test.lc_contract')), 'deleting contract lines');
select pg_temp.expect_error(format('update public.versions set locked = false where id = %L', current_setting('test.lc_contract')), 'unlocking the contract');
select pg_temp.expect_error(format('select public.sign_contract(%L, %L)', current_setting('test.lc_project'), current_setting('test.lc_version')), 'signing a second contract');
select set_config('request.headers', '{"x-change-id":"lc-spoof","x-client-source":"app"}', false);
select set_config('request.headers', '{"x-change-id":"undo:lc-sign"}', false);
select pg_temp.expect_error(format('update public.line_items set quantity = 98 where version_id = %L', current_setting('test.lc_contract')), 'a spoofed undo header does not unlock the contract');
select pg_temp.check((select count(*) = 1 from public.versions where project_id = current_setting('test.lc_project')::uuid and label = 'A' and not locked), 'working version A stays editable');

-- A client request becomes a change order: one item added, one taken out
select set_config('request.headers', '{"x-change-id":"lc-co"}', false);
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_project uuid := current_setting('test.lc_project')::uuid;
  v_dec uuid;
  v_co uuid;
  v_rev uuid := (select id from public.partidas where code = 'REV-010' and organization_id is null);
begin
  insert into public.decisions (organization_id, project_id, request) values (v_org, v_project, 'Tile the hall too') returning id into v_dec;
  insert into public.change_orders (organization_id, project_id, title, decision_id) values (v_org, v_project, 'Hall tiling', v_dec) returning id into v_co;
  insert into public.change_order_lines (organization_id, change_order_id, partida_id, description, unit, quantity, unit_price)
  values (v_org, v_co, v_rev, 'Alicatado hall', 'm2', 10, 90),
         (v_org, v_co, null, 'Remove mirror', 'ud', -1, 150);
  perform pg_temp.check((select number = 1 from public.change_orders where id = v_co), 'change orders are numbered per project');
  perform pg_temp.check((select total = 750 from public.change_order_totals where change_order_id = v_co), 'change order total = 10 × 90 − 150 = 750');
  perform pg_temp.check((select approved_changes = 0 and pending_changes = 750 from public.project_budget_summary where project_id = v_project), 'draft change counts as pending, not approved');
  update public.change_orders set status = 'sent', sent_on = current_date - 8 where id = v_co;
  perform pg_temp.check((select count(*) = 1 from public.action_items where kind = 'change_pending' and ref_id = v_co), 'change order waiting over a week is an action item');
  update public.change_orders set status = 'approved', decided_on = current_date, approved_by = 'Ana' where id = v_co;
  perform pg_temp.check((select current_budget = contract_budget + 750 and approved_changes = 750 from public.project_budget_summary where project_id = v_project),
                        'current budget = contract + approved changes');
  perform pg_temp.check((select status = 'applied' from public.decisions where id = v_dec), 'approving applies the client request');
  perform pg_temp.check((select budget = (select sum(li.total) from public.line_items li join public.partidas pa on pa.id = li.partida_id
                                               where li.version_id = current_setting('test.lc_contract')::uuid and pa.code like 'REV%') + 900
                          from public.project_cost_by_trade where project_id = v_project and trade_code = 'REV'), 'approved change adds to its chapter budget');
  perform pg_temp.check((select current_budget = budget + 750 from public.project_money where project_id = v_project), 'project money shows the current budget');
  perform set_config('test.lc_co', v_co::text, false);
end $$;
select pg_temp.expect_error(format('update public.change_order_lines set quantity = 20 where change_order_id = %L', current_setting('test.lc_co')), 'editing an approved change order');

-- Studio B sees none of it; viewers cannot create change orders
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.change_orders), 'B cannot see A''s change orders');
select pg_temp.check((select count(*) = 0 from public.project_budget_summary where project_id = current_setting('test.lc_project')::uuid), 'B cannot see A''s budget summary');
select pg_temp.expect_error(format('insert into public.change_orders (organization_id, project_id, title) values (%L, %L, ''x'')',
                                   current_setting('test.org_a'), current_setting('test.lc_project')), 'B adding a change order to A''s project');

-- Undo the contract signing: everything comes back as before
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{"x-change-id":"lc-undo-co"}', false);
select pg_temp.check(public.undo_change('lc-co') > 0, 'undo the change order');
select pg_temp.check(public.undo_change('lc-sign') > 0, 'undo the contract signing');
select pg_temp.check((select contract_version_id is null and status = 'pricing' and phase = 'bid' from public.projects where id = current_setting('test.lc_project')::uuid),
                     'project back to bid, no contract');
select pg_temp.check((select count(*) = 0 from public.versions where id = current_setting('test.lc_contract')::uuid), 'contract version removed');
select pg_temp.check((select current_setting('app.undoing', true) is distinct from 'on'), 'undo flag does not leak past the undo');
reset role;

\echo 'LIFECYCLE TESTS PASSED'
