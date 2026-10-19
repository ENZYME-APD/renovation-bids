-- Platform layer: regions, organizations (tenants), members, tenancy helpers.
-- Every business table in later migrations carries organization_id and is
-- isolated with row-level security using the helpers defined here.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Regions: market-specific settings (tax, permits, defaults). Spain first.
-- ---------------------------------------------------------------------------
create table public.regions (
  id          text primary key check (id ~ '^[a-z]{2}(-[a-z0-9]+)?$'),
  name        text not null,
  currency    char(3) not null default 'EUR',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.regions is
  'A market (e.g. es = Spain). settings holds VAT rates, permit routes, confidence spreads and RFQ reminder rules.';

-- ---------------------------------------------------------------------------
-- Organizations: one per customer studio. Enzyme is the first.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  region_id            text not null references public.regions (id),
  next_project_number  integer not null default 1,
  created_at           timestamptz not null default now()
);
create index organizations_region_id_idx on public.organizations (region_id);

create type public.member_role as enum ('owner', 'admin', 'member');

create table public.members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.member_role not null default 'member',
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index members_user_id_idx on public.members (user_id);

-- ---------------------------------------------------------------------------
-- Tenancy helpers (private schema: not exposed through the API).
-- Used in RLS policies as: organization_id in (select private.user_org_ids())
-- ---------------------------------------------------------------------------
create or replace function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid());
$$;

create or replace function private.user_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin');
$$;

revoke all on function private.user_org_ids() from public;
revoke all on function private.user_admin_org_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.user_admin_org_ids() to authenticated;

-- updated_at maintenance
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-up path: a logged-in user creates a studio and becomes its owner.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_region_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org  uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name, region_id)
  values (p_name, p_region_id)
  returning id into v_org;

  insert into public.members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
