-- Purchasing (orders, supplier invoices, payments), cost control and dashboard views.

create type public.supply_by       as enum ('enzyme', 'contractor', 'owner');
create type public.po_status       as enum ('draft', 'sent', 'confirmed', 'delivered', 'cancelled');
create type public.money_direction as enum ('out', 'in');
create type public.money_category  as enum ('labour', 'materials', 'extra', 'client_works', 'client_fees');

alter table public.organizations add column next_po_number integer not null default 1;

-- ── Purchase orders ──────────────────────────────────────────────────────────
create table public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null,
  supplier_id      uuid,
  code             text not null default '',
  supplied_by      public.supply_by not null default 'enzyme',
  status           public.po_status not null default 'draft',
  ordered_on       date,
  expected_on      date,
  delivered_on     date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  check (status in ('draft', 'cancelled') or ordered_on is not null),
  check (status <> 'delivered' or delivered_on is not null)
);
create index purchase_orders_org_status_idx on public.purchase_orders (organization_id, status);
create index purchase_orders_project_org_idx on public.purchase_orders (project_id, organization_id);
create index purchase_orders_supplier_org_idx on public.purchase_orders (supplier_id, organization_id);
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function private.set_updated_at();

create or replace function private.assign_po_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.code is null or new.code = '' then
    update public.organizations set next_po_number = next_po_number + 1
     where id = new.organization_id
    returning next_po_number - 1 into v_n;
    new.code := 'PO-' || lpad(v_n::text, 4, '0');
  end if;
  return new;
end;
$$;
revoke all on function private.assign_po_code() from public;
create trigger purchase_orders_assign_code before insert on public.purchase_orders
  for each row execute function private.assign_po_code();

create table public.purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id  uuid not null,
  line_item_id       uuid,
  partida_id         uuid references public.partidas (id),
  description        text not null,
  unit               public.unit not null default 'ud',
  quantity           numeric(14, 3) not null default 0 check (quantity >= 0),
  unit_cost          numeric(12, 2) not null default 0 check (unit_cost >= 0),
  received_quantity  numeric(14, 3) not null default 0 check (received_quantity >= 0),
  total              numeric(14, 2) generated always as (round(quantity * unit_cost, 2)) stored,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (purchase_order_id, organization_id) references public.purchase_orders (id, organization_id) on delete cascade,
  foreign key (line_item_id, organization_id) references public.line_items (id, organization_id) on delete set null (line_item_id)
);
create index po_lines_po_org_idx on public.purchase_order_lines (purchase_order_id, organization_id);
create index po_lines_line_item_org_idx on public.purchase_order_lines (line_item_id, organization_id);
create index po_lines_partida_idx on public.purchase_order_lines (partida_id);

-- ── Supplier invoices and payments ───────────────────────────────────────────
create table public.supplier_invoices (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  project_id         uuid not null,
  supplier_id        uuid,
  purchase_order_id  uuid,
  number             text,
  category           public.money_category not null default 'materials' check (category in ('labour', 'materials', 'extra')),
  issued_on          date not null default current_date,
  due_on             date,
  net_amount         numeric(12, 2) not null check (net_amount >= 0),
  vat_amount         numeric(12, 2) not null default 0 check (vat_amount >= 0),
  total              numeric(12, 2) generated always as (net_amount + vat_amount) stored,
  attachment_path    text,
  notes              text,
  created_at         timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (purchase_order_id, organization_id) references public.purchase_orders (id, organization_id) on delete set null (purchase_order_id)
);
create index supplier_invoices_project_org_idx on public.supplier_invoices (project_id, organization_id);
create index supplier_invoices_supplier_org_idx on public.supplier_invoices (supplier_id, organization_id);
create index supplier_invoices_po_org_idx on public.supplier_invoices (purchase_order_id, organization_id);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null,
  direction        public.money_direction not null,
  category         public.money_category not null,
  paid_on          date not null default current_date,
  amount           numeric(12, 2) not null check (amount > 0),
  supplier_id      uuid,
  invoice_id       uuid,
  method           text,
  concept          text,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (invoice_id, organization_id) references public.supplier_invoices (id, organization_id) on delete set null (invoice_id),
  -- money out pays suppliers and costs; money in comes from the client
  check ((direction = 'in') = (category in ('client_works', 'client_fees')))
);
create index payments_project_org_idx on public.payments (project_id, organization_id, paid_on);
create index payments_supplier_org_idx on public.payments (supplier_id, organization_id);
create index payments_invoice_org_idx on public.payments (invoice_id, organization_id);

-- Partida scope for purchase lines (shared or own catalogue only)
create or replace function private.check_po_line_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.ref_in_scope('partidas', new.partida_id, new.organization_id, private.org_region(new.organization_id)) then
    raise exception 'purchase line partida out of scope';
  end if;
  return new;
end;
$$;
revoke all on function private.check_po_line_refs() from public;
create trigger purchase_order_lines_refs before insert or update on public.purchase_order_lines
  for each row execute function private.check_po_line_refs();

-- RLS, grants and activity logging
do $$
declare
  t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'supplier_invoices', 'payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                      using (organization_id in (select private.user_org_ids()))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check (organization_id in (select private.user_writer_org_ids()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (organization_id in (select private.user_writer_org_ids()))
                      with check (organization_id in (select private.user_writer_org_ids()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated
                      using (organization_id in (select private.user_writer_org_ids()))', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                      for each row execute function private.log_change()', t || '_activity', t);
  end loop;
end;
$$;

-- Turn a delivered purchase line into the studio's own price history
create or replace function public.record_actual_price(p_po_line uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_line  public.purchase_order_lines;
  v_po    public.purchase_orders;
  v_price uuid;
begin
  select * into v_line from public.purchase_order_lines where id = p_po_line;
  if v_line.id is null then raise exception 'purchase line not found'; end if;
  if v_line.partida_id is null then raise exception 'Link the line to a catalogue partida first.'; end if;
  select * into v_po from public.purchase_orders where id = v_line.purchase_order_id;

  insert into public.prices (region_id, organization_id, partida_id, unit_price, source, supplier_id, priced_on, confidence, notes)
  values ((select o.region_id from public.organizations o where o.id = v_line.organization_id), v_line.organization_id, v_line.partida_id, v_line.unit_cost,
          'history', v_po.supplier_id, coalesce(v_po.ordered_on, current_date), 'high', 'From ' || v_po.code)
  returning id into v_price;
  return v_price;
end;
$$;
revoke all on function public.record_actual_price(uuid) from public, anon;
grant execute on function public.record_actual_price(uuid) to authenticated;

-- ── Views (run as the caller, so RLS applies) ────────────────────────────────

-- The version that counts for a project: the selected one, else the newest
create view public.project_main_version with (security_invoker = true) as
select distinct on (v.project_id) v.project_id, v.organization_id, v.id as version_id, v.label, v.status
from public.versions v
order by v.project_id, (v.status = 'selected') desc, v.created_at desc;

-- Budget totals per version with the low/high range
create view public.version_totals with (security_invoker = true) as
select li.version_id, li.organization_id,
       count(*) as lines,
       count(li.unit_price) as priced_lines,
       coalesce(sum(li.total), 0) as subtotal,
       round(coalesce(sum(li.total * (1 - coalesce((g.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25))), 0), 2) as budget_low,
       round(coalesce(sum(li.total * (1 + coalesce((g.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25))), 0), 2) as budget_high
from public.line_items li
join public.organizations o on o.id = li.organization_id
join public.regions g on g.id = o.region_id
group by li.version_id, li.organization_id;

create view public.project_stats with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name, p.status, p.district, p.area_m2,
       p.created_at, p.updated_at, p.bid_hours, p.client_budget, p.contract_value, p.actual_cost,
       mv.version_id, mv.label as version_label,
       coalesce(vt.lines, 0) as lines, coalesce(vt.priced_lines, 0) as priced_lines,
       coalesce(vt.subtotal, 0) as subtotal, coalesce(vt.budget_low, 0) as budget_low, coalesce(vt.budget_high, 0) as budget_high,
       case when p.area_m2 > 0 and vt.subtotal > 0 then round(vt.subtotal / p.area_m2, 0) end as eur_per_m2
from public.projects p
left join public.project_main_version mv on mv.project_id = p.id
left join public.version_totals vt on vt.version_id = mv.version_id;

-- Budget against committed purchases, per project and chapter
create view public.project_cost_by_trade with (security_invoker = true) as
with budget as (
  select mv.project_id, li.organization_id, pa.trade_id, sum(li.total) as budget
  from public.project_main_version mv
  join public.line_items li on li.version_id = mv.version_id
  join public.partidas pa on pa.id = li.partida_id
  group by mv.project_id, li.organization_id, pa.trade_id
), committed as (
  select po.project_id, pl.organization_id, coalesce(pa.trade_id, pa2.trade_id) as trade_id, sum(pl.total) as committed
  from public.purchase_order_lines pl
  join public.purchase_orders po on po.id = pl.purchase_order_id and po.status not in ('draft', 'cancelled')
  left join public.partidas pa on pa.id = pl.partida_id
  left join public.line_items li on li.id = pl.line_item_id
  left join public.partidas pa2 on pa2.id = li.partida_id
  group by po.project_id, pl.organization_id, coalesce(pa.trade_id, pa2.trade_id)
)
select coalesce(b.project_id, c.project_id) as project_id,
       coalesce(b.organization_id, c.organization_id) as organization_id,
       coalesce(b.trade_id, c.trade_id) as trade_id,
       t.code as trade_code, t.name as trade, t.sequence,
       coalesce(b.budget, 0) as budget, coalesce(c.committed, 0) as committed,
       coalesce(b.budget, 0) - coalesce(c.committed, 0) as remaining
from budget b
full join committed c on c.project_id = b.project_id and c.trade_id is not distinct from b.trade_id
left join public.trades t on t.id = coalesce(b.trade_id, c.trade_id);

-- Money per project: budget, committed, invoiced, paid out, received
create view public.project_money with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name, p.status, p.contract_value,
       coalesce(vt.subtotal, 0) as budget,
       coalesce((select sum(pl.total) from public.purchase_order_lines pl
                 join public.purchase_orders po on po.id = pl.purchase_order_id
                 where po.project_id = p.id and po.status not in ('draft', 'cancelled')), 0) as committed,
       coalesce((select sum(i.total) from public.supplier_invoices i where i.project_id = p.id), 0) as invoiced,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out'), 0) as paid_out,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'labour'), 0) as paid_labour,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'materials'), 0) as paid_materials,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'out' and m.category = 'extra'), 0) as paid_extra,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'in' and m.category = 'client_works'), 0) as received_works,
       coalesce((select sum(m.amount) from public.payments m where m.project_id = p.id and m.direction = 'in' and m.category = 'client_fees'), 0) as received_fees
from public.projects p
left join public.project_main_version mv on mv.project_id = p.id
left join public.version_totals vt on vt.version_id = mv.version_id;

-- Supplier invoices with what has been paid against them
create view public.invoice_balances with (security_invoker = true) as
select i.*, s.name as supplier,
       coalesce((select sum(m.amount) from public.payments m where m.invoice_id = i.id), 0) as paid,
       i.total - coalesce((select sum(m.amount) from public.payments m where m.invoice_id = i.id), 0) as outstanding
from public.supplier_invoices i
left join public.suppliers s on s.id = i.supplier_id;

-- Things that need someone, across the studio
create view public.action_items with (security_invoker = true) as
select r.organization_id, 'rfq_reminder'::text as kind, r.project_id, p.code as project_code, p.name as project_name,
       'Chase ' || r.supplier || ' for a quote' as title, r.reply_by as due_on, r.id as ref_id, 2 as priority
from public.rfqs_due_reminder r join public.projects p on p.id = r.project_id
union all
select q.organization_id, 'quote_review', r.project_id, p.code, p.name,
       'Review quote from ' || s.name, q.received_at::date, q.id, 1
from public.quotes q join public.rfqs r on r.id = q.rfq_id join public.suppliers s on s.id = r.supplier_id
join public.projects p on p.id = r.project_id
where q.reviewed_at is null
union all
select ps.organization_id, 'unpriced_lines', ps.project_id, ps.code, ps.name,
       (ps.lines - ps.priced_lines) || ' lines without a price', null::date, ps.version_id, 3
from public.project_stats ps
where ps.lines > ps.priced_lines and ps.status not in ('lost', 'no_go', 'won')
union all
select o.organization_id, 'offer_expiring', o.project_id, p.code, p.name,
       'Offer R' || o.revision || ' expires', o.valid_until, o.id, 2
from public.offers o join public.projects p on p.id = o.project_id
where o.status = 'sent' and o.valid_until between current_date and current_date + 14
union all
select d.organization_id, 'open_decision', d.project_id, p.code, p.name,
       'Client request: ' || left(d.request, 80), d.decided_on, d.id, 3
from public.decisions d join public.projects p on p.id = d.project_id
where d.status = 'open'
union all
select b.organization_id, 'invoice_due', b.project_id, p.code, p.name,
       'Pay ' || coalesce(b.supplier, 'supplier') || coalesce(' invoice ' || b.number, ''), b.due_on, b.id, 1
from public.invoice_balances b join public.projects p on p.id = b.project_id
where b.outstanding > 0 and b.due_on <= current_date + 7
union all
select po.organization_id, 'delivery_late', po.project_id, p.code, p.name,
       po.code || ' delivery is late', po.expected_on, po.id, 1
from public.purchase_orders po join public.projects p on p.id = po.project_id
where po.status in ('sent', 'confirmed') and po.expected_on < current_date;

grant select on public.project_main_version, public.version_totals, public.project_stats,
                public.project_cost_by_trade, public.project_money, public.invoice_balances,
                public.action_items to authenticated;
revoke all on public.project_main_version, public.version_totals, public.project_stats,
              public.project_cost_by_trade, public.project_money, public.invoice_balances,
              public.action_items from anon;
