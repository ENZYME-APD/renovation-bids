-- Domain tables: project, costing, suppliers, offers.
--
-- Conventions
-- * Tenant tables: organization_id not null + unique (id, organization_id).
--   Children reference parents with composite foreign keys
--   (parent_id, organization_id), so a row can never point at another
--   tenant's row, even if someone knows its id.
-- * Reference tables (trades, partidas, prices): organization_id is null for
--   the shared regional catalogue, or set for an organization's own rows.
--   Triggers check that references stay inside "shared + own".

-- ===========================================================================
-- Enums (generic across markets; market-specific lists live in regions.settings)
-- ===========================================================================
create type public.client_type      as enum ('private', 'community', 'company');
create type public.project_status   as enum ('lead', 'qualifying', 'no_go', 'site_visit', 'design',
                                             'pricing', 'offer_sent', 'won', 'lost', 'on_hold');
create type public.version_status   as enum ('draft', 'presented', 'selected', 'rejected');
create type public.decision_source  as enum ('email', 'meeting', 'call', 'site', 'other');
create type public.decision_status  as enum ('open', 'applied', 'dropped');
create type public.unit             as enum ('m2', 'm', 'm3', 'ud', 'kg', 'h', 'pa');
create type public.price_source     as enum ('history', 'reference', 'quote', 'manual');
create type public.confidence       as enum ('high', 'medium', 'low');
create type public.line_state       as enum ('unpriced', 'priced', 'needs_rfq', 'quoted');
create type public.supplier_type    as enum ('subcontractor', 'manufacturer', 'distributor', 'professional');
create type public.contact_source   as enum ('own', 'web', 'referral');
create type public.rfq_status       as enum ('draft', 'approved', 'sent', 'reminded', 'replied', 'expired', 'cancelled');
create type public.offer_status     as enum ('draft', 'sent', 'accepted', 'rejected', 'superseded');

-- ===========================================================================
-- Project group
-- ===========================================================================
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null,
  client_type      public.client_type not null default 'private',
  email            text,
  phone            text,
  source           text,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (id, organization_id)
);
create index clients_organization_id_idx on public.clients (organization_id);

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  code             text not null,
  client_id        uuid,
  name             text not null,
  address          text,
  district         text,
  building_year    smallint check (building_year between 1000 and 2100),
  area_m2          numeric(10, 2) check (area_m2 > 0),
  status           public.project_status not null default 'lead',
  go_score         smallint check (go_score between 0 and 100),
  go_reason        text,
  client_budget    numeric(12, 2) check (client_budget >= 0),
  bid_hours        numeric(6, 1) not null default 0 check (bid_hours >= 0),
  outcome_reason   text,
  contract_value   numeric(12, 2) check (contract_value >= 0),
  actual_cost      numeric(12, 2) check (actual_cost >= 0),
  folder_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code),
  foreign key (client_id, organization_id) references public.clients (id, organization_id)
);
create index projects_organization_id_status_idx on public.projects (organization_id, status);
create index projects_client_id_idx on public.projects (client_id);
create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

-- Project code PRJ-0001, numbered per organization.
create or replace function private.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.code is null or new.code = '' then
    update public.organizations
       set next_project_number = next_project_number + 1
     where id = new.organization_id
    returning next_project_number - 1 into v_n;
    new.code := 'PRJ-' || lpad(v_n::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger projects_assign_code before insert on public.projects
  for each row execute function private.assign_project_code();
alter table public.projects alter column code set default '';

create table public.site_visits (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  project_id        uuid not null,
  visited_on        date not null default current_date,
  attendees         text[] not null default '{}',
  scan_paths        text[] not null default '{}',   -- storage paths: RoomPlan JSON, E57
  photo_paths       text[] not null default '{}',
  voice_transcript  text,
  checklist         jsonb not null default '{}'::jsonb,  -- MEP, asbestos, structure, community rules
  laser_checks      jsonb not null default '[]'::jsonb,  -- [{label, measured_m, model_m}]
  created_at        timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index site_visits_project_id_idx on public.site_visits (project_id);
create index site_visits_organization_id_idx on public.site_visits (organization_id);

create table public.versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null,
  label            text not null,
  description      text,
  status           public.version_status not null default 'draft',
  archicad_file    text,
  archicad_option  text,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (project_id, label),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index versions_organization_id_idx on public.versions (organization_id);

create table public.decisions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null,
  version_id       uuid,
  decided_on       date not null default current_date,
  source           public.decision_source not null default 'other',
  requested_by     text,
  request          text not null,
  impact           text,
  status           public.decision_status not null default 'open',
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (version_id, organization_id) references public.versions (id, organization_id) on delete set null (version_id)
);
create index decisions_project_id_idx on public.decisions (project_id);
create index decisions_version_id_idx on public.decisions (version_id);
create index decisions_organization_id_idx on public.decisions (organization_id);

-- ===========================================================================
-- Costing group (shared regional catalogue + each organization's own rows)
-- ===========================================================================
create table public.trades (
  id               uuid primary key default gen_random_uuid(),
  region_id        text not null references public.regions (id),
  organization_id  uuid references public.organizations (id) on delete cascade,
  name             text not null,
  sequence         smallint not null default 0,
  unique nulls not distinct (region_id, organization_id, name)
);
create index trades_organization_id_idx on public.trades (organization_id);

create table public.partidas (
  id                       uuid primary key default gen_random_uuid(),
  region_id                text not null references public.regions (id),
  organization_id          uuid references public.organizations (id) on delete cascade,
  code                     text not null,
  short_description        text not null,
  long_description         text,
  unit                     public.unit not null,
  trade_id                 uuid not null references public.trades (id),
  reference_code           text,        -- e.g. CYPE Generador de Precios code
  archicad_classification  text,        -- classification that maps elements to this partida
  archicad_filter          jsonb not null default '{}'::jsonb,  -- extra property conditions
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  unique nulls not distinct (region_id, organization_id, code)
);
create index partidas_trade_id_idx on public.partidas (trade_id);
create index partidas_organization_id_idx on public.partidas (organization_id);
create index partidas_classification_idx on public.partidas (region_id, archicad_classification);

create table public.suppliers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null,
  supplier_type    public.supplier_type not null default 'subcontractor',
  contact_name     text,
  email            text,
  phone            text,
  area_served      text,
  source           public.contact_source not null default 'own',
  source_note      text,                 -- where the contact came from (GDPR/LSSI provenance)
  opt_out          boolean not null default false,
  opt_out_at       timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  check (source <> 'web' or source_note is not null),
  check (not opt_out or opt_out_at is not null)
);
create index suppliers_organization_id_idx on public.suppliers (organization_id);

create table public.supplier_trades (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  supplier_id      uuid not null,
  trade_id         uuid not null references public.trades (id),
  primary key (supplier_id, trade_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id) on delete cascade
);
create index supplier_trades_trade_id_idx on public.supplier_trades (trade_id);
create index supplier_trades_organization_id_idx on public.supplier_trades (organization_id);

create table public.rfqs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  project_id        uuid not null,
  supplier_id       uuid not null,
  trade_id          uuid references public.trades (id),
  status            public.rfq_status not null default 'draft',
  reply_by          date,
  approved_by       uuid references auth.users (id),
  approved_at       timestamptz,
  sent_at           timestamptz,
  reminder_count    smallint not null default 0,
  last_reminder_at  timestamptz,
  gmail_thread_id   text,
  documents         jsonb not null default '[]'::jsonb,   -- storage paths of plans/photos sent
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  -- Nothing leaves the office without a human approval.
  check (status in ('draft', 'cancelled') or (approved_at is not null and approved_by is not null)),
  check (status not in ('sent', 'reminded', 'replied', 'expired') or sent_at is not null)
);
create index rfqs_organization_id_status_idx on public.rfqs (organization_id, status);
create index rfqs_project_id_idx on public.rfqs (project_id);
create index rfqs_supplier_id_idx on public.rfqs (supplier_id);
create index rfqs_trade_id_idx on public.rfqs (trade_id);
create trigger rfqs_set_updated_at before update on public.rfqs
  for each row execute function private.set_updated_at();

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  rfq_id           uuid not null,
  received_at      timestamptz not null default now(),
  total            numeric(12, 2) check (total >= 0),
  exclusions       text,
  valid_until      date,
  attachment_path  text,
  parsed_by_ai     boolean not null default false,
  reviewed_by      uuid references auth.users (id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (rfq_id, organization_id) references public.rfqs (id, organization_id) on delete cascade,
  check ((reviewed_by is null) = (reviewed_at is null))
);
create index quotes_rfq_id_idx on public.quotes (rfq_id);
create index quotes_organization_id_idx on public.quotes (organization_id);

create table public.prices (
  id               uuid primary key default gen_random_uuid(),
  region_id        text not null references public.regions (id),
  organization_id  uuid references public.organizations (id) on delete cascade,
  partida_id       uuid not null references public.partidas (id),
  unit_price       numeric(12, 2) not null check (unit_price >= 0),
  source           public.price_source not null,
  supplier_id      uuid,
  quote_id         uuid,
  priced_on        date not null default current_date,
  valid_until      date,
  confidence       public.confidence not null default 'medium',
  notes            text,
  created_at       timestamptz not null default now(),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (quote_id, organization_id) references public.quotes (id, organization_id) on delete cascade,
  -- Shared reference prices cannot point at any tenant's supplier or quote.
  check (organization_id is not null or (supplier_id is null and quote_id is null)),
  check (source <> 'quote' or quote_id is not null),
  check (valid_until is null or valid_until >= priced_on)
);
create index prices_partida_id_idx on public.prices (partida_id, priced_on desc);
create index prices_organization_id_idx on public.prices (organization_id);
create index prices_supplier_id_idx on public.prices (supplier_id);
create index prices_quote_id_idx on public.prices (quote_id);

create table public.line_items (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  version_id            uuid not null,
  partida_id            uuid not null references public.partidas (id),
  quantity              numeric(14, 3) not null default 0 check (quantity >= 0),
  unit_price            numeric(12, 2) check (unit_price >= 0),
  price_id              uuid references public.prices (id) on delete set null,
  confidence            public.confidence,
  state                 public.line_state not null default 'unpriced',
  archicad_element_ids  text[] not null default '{}',
  notes                 text,
  total                 numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (version_id, organization_id) references public.versions (id, organization_id) on delete cascade,
  check (state = 'unpriced' or state = 'needs_rfq' or unit_price is not null)
);
create index line_items_version_id_idx on public.line_items (version_id);
create index line_items_partida_id_idx on public.line_items (partida_id);
create index line_items_price_id_idx on public.line_items (price_id);
create index line_items_organization_id_idx on public.line_items (organization_id);
create trigger line_items_set_updated_at before update on public.line_items
  for each row execute function private.set_updated_at();

create table public.rfq_line_items (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  rfq_id           uuid not null,
  line_item_id     uuid not null,
  primary key (rfq_id, line_item_id),
  foreign key (rfq_id, organization_id) references public.rfqs (id, organization_id) on delete cascade,
  foreign key (line_item_id, organization_id) references public.line_items (id, organization_id) on delete cascade
);
create index rfq_line_items_line_item_id_idx on public.rfq_line_items (line_item_id);
create index rfq_line_items_organization_id_idx on public.rfq_line_items (organization_id);

-- ===========================================================================
-- Output
-- ===========================================================================
create table public.offers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null,
  version_id          uuid not null,
  revision            smallint not null default 1 check (revision > 0),
  status              public.offer_status not null default 'draft',
  budget_low          numeric(12, 2) check (budget_low >= 0),
  budget_high         numeric(12, 2) check (budget_high >= 0),
  contingency_pct     numeric(5, 2) check (contingency_pct between 0 and 100),
  vat_rate            numeric(5, 2) check (vat_rate between 0 and 100),
  icio_amount         numeric(12, 2) check (icio_amount >= 0),
  permit_route        text,           -- allowed values listed in regions.settings.permit_routes
  fee_amount          numeric(12, 2) check (fee_amount >= 0),
  fee_calculator_ref  text,           -- project id in the Fee Calculator (separate product)
  exclusions          text,
  valid_until         date,
  payment_schedule    jsonb not null default '[]'::jsonb,
  pdf_path            text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  unique (project_id, revision),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (version_id, organization_id) references public.versions (id, organization_id),
  check (budget_low is null or budget_high is null or budget_low <= budget_high),
  check (status = 'draft' or sent_at is not null)
);
create index offers_version_id_idx on public.offers (version_id);
create index offers_organization_id_idx on public.offers (organization_id);
create trigger offers_set_updated_at before update on public.offers
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Scope checks for references into the shared catalogue
-- (a row may use the region's shared rows or its own organization's rows,
--  never another organization's private rows or another region's rows)
-- ===========================================================================
create or replace function private.ref_in_scope(p_table text, p_ref uuid, p_org uuid, p_region text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_region text;
  v_found  boolean;
begin
  if p_ref is null then
    return true;
  end if;
  if p_table not in ('trades', 'partidas', 'prices') then
    raise exception 'ref_in_scope: unsupported table %', p_table;
  end if;
  execute format('select true, organization_id, region_id from public.%I where id = $1', p_table)
    into v_found, v_org, v_region
    using p_ref;
  return coalesce(v_found, false)
     and (v_org is null or v_org = p_org)
     and v_region = p_region;
end;
$$;

create or replace function private.org_region(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select region_id from public.organizations where id = p_org;
$$;

-- partidas.trade_id, prices.partida_id: catalogue rows referencing catalogue rows
create or replace function private.check_catalogue_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is not null and new.region_id <> private.org_region(new.organization_id) then
    raise exception '% row region % does not match organization region', tg_table_name, new.region_id;
  end if;
  if tg_table_name = 'partidas' then
    if not private.ref_in_scope('trades', new.trade_id, new.organization_id, new.region_id) then
      raise exception 'partida trade out of scope';
    end if;
  elsif tg_table_name = 'prices' then
    if not private.ref_in_scope('partidas', new.partida_id, new.organization_id, new.region_id) then
      raise exception 'price partida out of scope';
    end if;
  end if;
  return new;
end;
$$;
create trigger trades_scope before insert or update on public.trades
  for each row execute function private.check_catalogue_scope();
create trigger partidas_scope before insert or update on public.partidas
  for each row execute function private.check_catalogue_scope();
create trigger prices_scope before insert or update on public.prices
  for each row execute function private.check_catalogue_scope();

-- tenant rows referencing catalogue rows
create or replace function private.check_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_region text := private.org_region(new.organization_id);
begin
  if tg_table_name = 'line_items' then
    if not private.ref_in_scope('partidas', new.partida_id, new.organization_id, v_region) then
      raise exception 'line item partida out of scope';
    end if;
    if not private.ref_in_scope('prices', new.price_id, new.organization_id, v_region) then
      raise exception 'line item price out of scope';
    end if;
  elsif tg_table_name in ('supplier_trades', 'rfqs') then
    if not private.ref_in_scope('trades', new.trade_id, new.organization_id, v_region) then
      raise exception '% trade out of scope', tg_table_name;
    end if;
  end if;
  return new;
end;
$$;
create trigger line_items_refs before insert or update on public.line_items
  for each row execute function private.check_tenant_refs();
create trigger supplier_trades_refs before insert or update on public.supplier_trades
  for each row execute function private.check_tenant_refs();
create trigger rfqs_refs before insert or update on public.rfqs
  for each row execute function private.check_tenant_refs();

-- Helpers are only called from the triggers above (which run as owner).
revoke all on function private.ref_in_scope(text, uuid, uuid, text) from public;
revoke all on function private.org_region(uuid) from public;
revoke all on function private.assign_project_code() from public;
revoke all on function private.check_catalogue_scope() from public;
revoke all on function private.check_tenant_refs() from public;
