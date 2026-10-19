-- Tenant isolation + core flow test.
-- Two studios: A = Enzyme (customer #1), B = a dummy second studio.
-- Run with psql -v ON_ERROR_STOP=1. Any failed assertion stops the run.
\set QUIET on
\pset tuples_only on

-- helper: expect a statement to fail
create or replace function pg_temp.expect_error(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected an error: %', p_label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok  - blocked: % (%)', p_label, sqlerrm;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'ok  - %', p_label;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated, anon;

-- users (Supabase Auth would create these)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'jorge@enzyme.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'owner@studio-b.test');

-- ===========================================================================
-- Studio A (Enzyme) signs up and works a bid
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('test.org_a', public.create_organization('Enzyme', 'es')::text, false);

do $$
declare
  v_org     uuid := current_setting('test.org_a')::uuid;
  v_client  uuid;
  v_project uuid;
  v_version uuid;
  v_sup     uuid;
  v_tile    uuid;
  v_paint   uuid;
  v_floor   uuid;
  v_trade   uuid;
  v_rfq     uuid;
  v_quote   uuid;
  v_code    text;
begin
  insert into public.clients (organization_id, name) values (v_org, 'Cliente piloto') returning id into v_client;
  insert into public.projects (organization_id, client_id, name, district, building_year, area_m2, status)
  values (v_org, v_client, 'Piso Chamberí', 'Chamberí', 1965, 92, 'pricing')
  returning id, code into v_project, v_code;
  perform pg_temp.check(v_code = 'PRJ-0001', 'project code assigned per organization (' || v_code || ')');

  insert into public.versions (organization_id, project_id, label) values (v_org, v_project, 'A') returning id into v_version;

  select id into v_tile  from public.partidas where code = 'ES-REV-001';
  select id into v_paint from public.partidas where code = 'ES-PIN-001';
  select id into v_floor from public.partidas where code = 'ES-PAV-001';
  perform pg_temp.check(v_tile is not null and v_paint is not null, 'shared Spanish catalogue visible to studio A');

  -- test-only prices: one shared reference (inserted later by service role), one own history
  insert into public.prices (region_id, organization_id, partida_id, unit_price, source, confidence, priced_on)
  values ('es', v_org, v_paint, 9.50, 'history', 'high', current_date - 30);

  insert into public.line_items (organization_id, version_id, partida_id, quantity, unit_price, confidence, state)
  values (v_org, v_version, v_paint, 310, 9.50, 'high', 'priced'),
         (v_org, v_version, v_tile, 42, null, null, 'needs_rfq'),
         (v_org, v_version, v_floor, 78, null, null, 'unpriced');

  select trade_id into v_trade from public.partidas where id = v_tile;
  insert into public.suppliers (organization_id, name, email, source)
  values (v_org, 'Alicatados Test SL', 'quotes@alicatados.test', 'own') returning id into v_sup;
  insert into public.supplier_trades (organization_id, supplier_id, trade_id) values (v_org, v_sup, v_trade);

  insert into public.rfqs (organization_id, project_id, supplier_id, trade_id, reply_by)
  values (v_org, v_project, v_sup, v_trade, current_date + 5) returning id into v_rfq;
  insert into public.rfq_line_items (organization_id, rfq_id, line_item_id)
  select v_org, v_rfq, id from public.line_items where version_id = v_version and partida_id = v_tile;

  perform set_config('test.project_a', v_project::text, false);
  perform set_config('test.version_a', v_version::text, false);
  perform set_config('test.rfq_a', v_rfq::text, false);
  perform set_config('test.supplier_a', v_sup::text, false);
  perform set_config('test.tile', v_tile::text, false);
end $$;

-- Human approval is enforced by the database
select pg_temp.expect_error(
  format('update public.rfqs set status = ''sent'', sent_at = now() where id = %L', current_setting('test.rfq_a')),
  'sending an RFQ without approval');

update public.rfqs
   set status = 'sent', approved_by = (select auth.uid()), approved_at = now(), sent_at = now() - interval '4 days'
 where id = current_setting('test.rfq_a')::uuid;

select pg_temp.check((select count(*) = 1 from public.rfqs_due_reminder),
                     'RFQ sent 4 days ago with no reply is due a reminder');

-- Supplier replies; Claude parses the quote; the price only counts once reviewed
do $$
declare
  v_org   uuid := current_setting('test.org_a')::uuid;
  v_quote uuid;
  v_tile  uuid := current_setting('test.tile')::uuid;
  n       int;
begin
  insert into public.quotes (organization_id, rfq_id, total, parsed_by_ai)
  values (v_org, current_setting('test.rfq_a')::uuid, 1512.00, true) returning id into v_quote;
  update public.rfqs set status = 'replied' where id = current_setting('test.rfq_a')::uuid;
  insert into public.prices (region_id, organization_id, partida_id, unit_price, source, supplier_id, quote_id, confidence)
  values ('es', v_org, v_tile, 36.00, 'quote', current_setting('test.supplier_a')::uuid, v_quote, 'high');

  select count(*) into n from public.current_prices(v_org) where partida_id = v_tile;
  perform pg_temp.check(n = 0, 'unreviewed AI-parsed quote price is not used yet');

  update public.quotes set reviewed_by = (select auth.uid()), reviewed_at = now() where id = v_quote;
  select count(*) into n from public.current_prices(v_org) where partida_id = v_tile and unit_price = 36.00;
  perform pg_temp.check(n = 1, 'reviewed quote price becomes the current price');

  update public.line_items li set unit_price = 36.00, confidence = 'high', state = 'quoted'
   where li.version_id = current_setting('test.version_a')::uuid and li.partida_id = v_tile;
end $$;

select pg_temp.check(
  (select sum(subtotal) = round(310 * 9.50 + 42 * 36.00, 2) from public.version_budget(current_setting('test.version_a')::uuid)),
  'version budget subtotal = sum of priced lines');
select pg_temp.check(
  (select bool_and(budget_low < subtotal and budget_high > subtotal) from public.version_budget(current_setting('test.version_a')::uuid) where subtotal > 0),
  'budget range brackets the subtotal');
select pg_temp.check((select count(*) = 1 from public.lines_needing_price), 'one line still needs a price (flooring)');
select pg_temp.check((select response_rate = 1 from public.supplier_response where supplier_id = current_setting('test.supplier_a')::uuid),
                     'supplier response rate recorded');

-- ===========================================================================
-- Studio B signs up
-- ===========================================================================
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select set_config('test.org_b', public.create_organization('Studio B', 'es')::text, false);

do $$
declare
  v_org     uuid := current_setting('test.org_b')::uuid;
  v_project uuid;
  v_code    text;
  v_trade   uuid;
begin
  insert into public.projects (organization_id, name) values (v_org, 'Studio B project') returning id, code into v_project, v_code;
  perform pg_temp.check(v_code = 'PRJ-0001', 'studio B numbering starts at its own PRJ-0001');
  select id into v_trade from public.trades where name = 'Pintura' and organization_id is null;
  insert into public.partidas (region_id, organization_id, code, short_description, unit, trade_id)
  values ('es', v_org, 'B-PRIV-001', 'Studio B private partida', 'm2', v_trade);
  perform set_config('test.partida_b', (select id::text from public.partidas where code = 'B-PRIV-001'), false);
end $$;

-- ---------------------------------------------------------------------------
-- Isolation: B cannot see, change or link to A's data
-- ---------------------------------------------------------------------------
select pg_temp.check((select count(*) = 1 from public.organizations), 'B sees only its own organization');
select pg_temp.check((select count(*) = 1 from public.projects), 'B sees only its own project');
select pg_temp.check((select count(*) = 0 from public.projects where id = current_setting('test.project_a')::uuid), 'B cannot read A''s project by id');
select pg_temp.check((select count(*) = 0 from public.line_items), 'B sees none of A''s line items');
select pg_temp.check((select count(*) = 0 from public.suppliers), 'B sees none of A''s suppliers');
select pg_temp.check((select count(*) = 0 from public.quotes), 'B sees none of A''s quotes');
select pg_temp.check((select count(*) = 0 from public.prices where organization_id is not null and organization_id <> current_setting('test.org_b')::uuid), 'B sees none of A''s prices');
select pg_temp.check((select count(*) = 0 from public.rfqs_due_reminder), 'reminder view shows B nothing of A''s');
select pg_temp.check((select count(*) = 0 from public.supplier_response), 'supplier stats show B nothing of A''s');
select pg_temp.check((select count(*) = 0 from public.current_prices(current_setting('test.org_a')::uuid)), 'B cannot read A''s current prices');
select pg_temp.check((select count(*) = 0 from public.version_budget(current_setting('test.version_a')::uuid)), 'B cannot read A''s version budget');
select pg_temp.check((select count(*) > 0 from public.partidas where organization_id is null), 'B still sees the shared catalogue');

do $$
declare n int;
begin
  update public.projects set name = 'hacked' where id = current_setting('test.project_a')::uuid;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'B cannot update A''s project');
  delete from public.projects where id = current_setting('test.project_a')::uuid;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'B cannot delete A''s project');
end $$;

select pg_temp.expect_error(
  format('insert into public.projects (organization_id, name) values (%L, ''x'')', current_setting('test.org_a')),
  'B inserting a project into A''s organization');
select pg_temp.expect_error(
  format('insert into public.members (organization_id, user_id, role) values (%L, %L, ''owner'')',
         current_setting('test.org_a'), 'bbbbbbbb-0000-0000-0000-000000000002'),
  'B adding itself to A''s organization');
select pg_temp.expect_error(
  format('insert into public.line_items (organization_id, version_id, partida_id, quantity) values (%L, %L, (select id from public.partidas where code = ''ES-PIN-001''), 1)',
         current_setting('test.org_b'), current_setting('test.version_a')),
  'B attaching a line item to A''s version');
select pg_temp.expect_error(
  format('insert into public.prices (region_id, partida_id, unit_price, source) values (''es'', (select id from public.partidas where code = ''ES-PIN-001''), 1, ''reference'')'),
  'B writing to the shared reference catalogue');
select pg_temp.expect_error(
  'update public.regions set name = ''x''', 'B editing region settings');

-- A cannot use B's private partida
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select pg_temp.check((select count(*) = 0 from public.partidas where code = 'B-PRIV-001'), 'A cannot see B''s private partida');
select pg_temp.expect_error(
  format('insert into public.line_items (organization_id, version_id, partida_id, quantity) values (%L, %L, %L, 1)',
         current_setting('test.org_a'), current_setting('test.version_a'), current_setting('test.partida_b')),
  'A using B''s private partida');

-- ===========================================================================
-- Anonymous visitors get nothing
-- ===========================================================================
reset role;
set role anon;
select pg_temp.expect_error('select count(*) from public.projects', 'anonymous read of projects');
select pg_temp.expect_error('select count(*) from public.partidas', 'anonymous read of catalogue');
select pg_temp.expect_error('select public.create_organization(''x'', ''es'')', 'anonymous creating an organization');
reset role;

-- ===========================================================================
-- Housekeeping job: an RFQ with all reminders and no reply expires
-- ===========================================================================
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_rfq uuid;
  n int;
begin
  insert into public.rfqs (organization_id, project_id, supplier_id, status, approved_by, approved_at, sent_at,
                           reminder_count, last_reminder_at)
  values (v_org, current_setting('test.project_a')::uuid, current_setting('test.supplier_a')::uuid, 'reminded',
          'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '10 days', now() - interval '10 days',
          2, now() - interval '4 days')
  returning id into v_rfq;
  n := private.expire_stale_rfqs();
  perform pg_temp.check(n = 1 and (select status from public.rfqs where id = v_rfq) = 'expired',
                        'stale RFQ expired by the daily job (the replied one untouched)');
end $$;

\echo
\echo 'ALL TESTS PASSED'
