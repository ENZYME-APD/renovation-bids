-- Row-level security: every organization sees only its own rows,
-- plus the shared regional catalogue (read-only).

-- API roles: anonymous visitors get nothing; logged-in users go through RLS.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.regions from authenticated;
-- Supabase grants new public tables to anon by default; stop that for this schema.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- Platform tables
-- ---------------------------------------------------------------------------
alter table public.regions enable row level security;
create policy regions_read on public.regions
  for select to authenticated using (true);

alter table public.organizations enable row level security;
create policy organizations_read on public.organizations
  for select to authenticated
  using (id in (select private.user_org_ids()));
create policy organizations_update on public.organizations
  for update to authenticated
  using (id in (select private.user_admin_org_ids()))
  with check (id in (select private.user_admin_org_ids()));
-- Organizations are created through public.create_organization().
revoke insert, delete on public.organizations from authenticated;

alter table public.members enable row level security;
create policy members_read on public.members
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy members_admin_insert on public.members
  for insert to authenticated
  with check (organization_id in (select private.user_admin_org_ids()));
create policy members_admin_update on public.members
  for update to authenticated
  using (organization_id in (select private.user_admin_org_ids()))
  with check (organization_id in (select private.user_admin_org_ids()));
create policy members_admin_delete on public.members
  for delete to authenticated
  using (organization_id in (select private.user_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- Tenant tables: one policy each, same rule for read and write.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'projects', 'site_visits', 'versions', 'decisions',
    'suppliers', 'supplier_trades', 'rfqs', 'rfq_line_items', 'quotes',
    'line_items', 'offers'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (organization_id in (select private.user_org_ids()))
         with check (organization_id in (select private.user_org_ids()))',
      t || '_tenant', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue tables: read shared + own; write own only.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['trades', 'partidas', 'prices']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id is null or organization_id in (select private.user_org_ids()))',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (organization_id in (select private.user_org_ids()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (organization_id in (select private.user_org_ids()))
         with check (organization_id in (select private.user_org_ids()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (organization_id in (select private.user_org_ids()))',
      t || '_delete_own', t);
  end loop;
end;
$$;
