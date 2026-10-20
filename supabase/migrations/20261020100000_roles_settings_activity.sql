-- Roles (viewer), studio settings, profiles, invitations, and the activity log with undo.
--
-- Activity log: every change to a studio's data is recorded by database triggers, whoever
-- makes it (app, AI assistant through the MCP server, or a scheduled job). Each request
-- carries a change id (header x-change-id); undo_change(change_id) reverts a whole change.

alter type public.member_role add value if not exists 'viewer';

-- ── Writers: owners, admins and members (viewers read only) ──────────────────
create or replace function private.user_writer_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid())
    and m.role::text in ('owner', 'admin', 'member');
$$;
revoke all on function private.user_writer_org_ids() from public;
grant execute on function private.user_writer_org_ids() to authenticated;

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
    execute format('drop policy %I on public.%I', t || '_tenant', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id in (select private.user_org_ids()))', t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (organization_id in (select private.user_writer_org_ids()))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (organization_id in (select private.user_writer_org_ids()))
         with check (organization_id in (select private.user_writer_org_ids()))', t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (organization_id in (select private.user_writer_org_ids()))', t || '_delete', t);
  end loop;

  foreach t in array array['trades', 'partidas', 'prices', 'room_templates']
  loop
    execute format('drop policy %I on public.%I', t || '_insert_own', t);
    execute format('drop policy %I on public.%I', t || '_update_own', t);
    execute format('drop policy %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (organization_id in (select private.user_writer_org_ids()))', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (organization_id in (select private.user_writer_org_ids()))
         with check (organization_id in (select private.user_writer_org_ids()))', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (organization_id in (select private.user_writer_org_ids()))', t || '_delete_own', t);
  end loop;
end;
$$;

drop policy room_template_lines_write_own on public.room_template_lines;
create policy room_template_lines_write_own on public.room_template_lines for all to authenticated
  using (exists (select 1 from public.room_templates t
                 where t.id = template_id and t.organization_id in (select private.user_writer_org_ids())))
  with check (exists (select 1 from public.room_templates t
                      where t.id = template_id and t.organization_id in (select private.user_writer_org_ids())));

-- ── Studio settings ──────────────────────────────────────────────────────────
alter table public.organizations
  add column currency                char(3)      not null default 'EUR',
  add column language                text         not null default 'es' check (language in ('es', 'en')),
  add column default_contingency_pct numeric(5,2) not null default 7 check (default_contingency_pct between 0 and 100),
  add column default_vat_pct         numeric(5,2) not null default 10 check (default_vat_pct between 0 and 100),
  add column ai_connect              text         not null default 'members' check (ai_connect in ('none', 'admins', 'members', 'everyone')),
  add column ai_changes              text         not null default 'members' check (ai_changes in ('admins', 'members')),
  add column updated_at              timestamptz  not null default now();
comment on column public.organizations.ai_connect is 'Who may connect an AI assistant: none, admins, members (not viewers), everyone.';
comment on column public.organizations.ai_changes is 'Who may let an assistant make changes: admins, or members too. Viewers never.';
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

-- ── Profiles (name, email, language per person) ──────────────────────────────
create table public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text,
  language      text check (language in ('es', 'en')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid())
         or user_id in (select m.user_id from public.members m
                        where m.organization_id in (select private.user_org_ids())));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, update on public.profiles to authenticated;
revoke all on public.profiles from anon;
revoke update (email, user_id) on public.profiles from authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function private.handle_new_user();

insert into public.profiles (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

-- ── Team rules: there is always at least one owner ───────────────────────────
create or replace function private.keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(old.organization_id, new.organization_id);
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from public.members
                     where organization_id = v_org and role = 'owner' and user_id <> old.user_id)
     and exists (select 1 from public.organizations where id = v_org) then
    raise exception 'A studio needs at least one owner.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.keep_an_owner() from public;
create trigger members_keep_an_owner before update or delete on public.members
  for each row execute function private.keep_an_owner();

-- Only owners can make or unmake owners
create or replace function private.owner_changes_by_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role = 'owner' or (tg_op = 'UPDATE' and old.role = 'owner'))
     and auth.uid() is not null
     -- the first owner of a new studio (create_organization) is fine
     and exists (select 1 from public.members
                 where organization_id = new.organization_id and role = 'owner')
     and not exists (select 1 from public.members
                     where organization_id = new.organization_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only an owner can add or change owners.';
  end if;
  return new;
end;
$$;
revoke all on function private.owner_changes_by_owner() from public;
create trigger members_owner_changes before insert or update on public.members
  for each row execute function private.owner_changes_by_owner();

-- ── Invitations: a link the admin shares; the invitee signs in and accepts ───
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null check (email = lower(email) and email like '%@%'),
  role             public.member_role not null default 'member',
  token            text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '14 days',
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users (id) on delete set null
);
create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_accepted_by_idx on public.invitations (accepted_by);

alter table public.invitations enable row level security;
create policy invitations_admin_read on public.invitations for select to authenticated
  using (organization_id in (select private.user_admin_org_ids()));
create policy invitations_admin_insert on public.invitations for insert to authenticated
  with check (organization_id in (select private.user_admin_org_ids()) and invited_by = (select auth.uid()));
create policy invitations_admin_delete on public.invitations for delete to authenticated
  using (organization_id in (select private.user_admin_org_ids()));
grant select, insert, delete on public.invitations to authenticated;
revoke all on public.invitations from anon;

-- What the invite page shows before accepting
create or replace function public.get_invitation(p_token text)
returns table (studio text, email text, role public.member_role, expired boolean, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email, i.role, i.expires_at < now(), i.accepted_at is not null
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token and (select auth.uid()) is not null;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   public.invitations;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_inv from public.invitations where token = p_token for update;
  if v_inv.id is null then raise exception 'This invitation link is not valid.'; end if;
  if v_inv.accepted_at is not null then raise exception 'This invitation has already been used.'; end if;
  if v_inv.expires_at < now() then raise exception 'This invitation has expired. Ask for a new one.'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from v_inv.email then
    raise exception 'This invitation is for %. Sign in with that email to accept it.', v_inv.email;
  end if;

  insert into public.members (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;
revoke all on function public.get_invitation(text), public.accept_invitation(text) from public, anon;
grant execute on function public.get_invitation(text), public.accept_invitation(text) to authenticated;

-- ── Activity log ─────────────────────────────────────────────────────────────
create table public.activity_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  occurred_at      timestamptz not null default now(),
  actor_id         uuid references auth.users (id) on delete set null,
  actor_email      text,
  source           text not null check (source in ('app', 'ai', 'system')),
  client_id        text,                 -- OAuth client of the AI assistant, when source = 'ai'
  change_id        text not null,        -- one user action; undo works per change
  table_name       text not null,
  record_id        text not null,
  action           text not null check (action in ('insert', 'update', 'delete')),
  old_row          jsonb,
  new_row          jsonb,
  changed_fields   text[],
  undone_at        timestamptz,
  undone_by        uuid references auth.users (id) on delete set null
);
create index activity_log_org_time_idx on public.activity_log (organization_id, occurred_at desc);
create index activity_log_change_id_idx on public.activity_log (change_id);
create index activity_log_actor_id_idx on public.activity_log (actor_id);
create index activity_log_undone_by_idx on public.activity_log (undone_by);

alter table public.activity_log enable row level security;
create policy activity_log_read on public.activity_log for select to authenticated
  using (organization_id in (select private.user_org_ids()));
grant select on public.activity_log to authenticated;
revoke all on public.activity_log from anon;

create or replace function private.request_header(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('request.headers', true), '')::json ->> p_name;
exception when others then
  return null;
end;
$$;

create or replace function private.request_claim(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> p_name;
exception when others then
  return null;
end;
$$;

create or replace function private.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_org     uuid;
  v_changed text[];
  v_change  text;
  v_client  text;
  v_actor   uuid := auth.uid();
  v_record  text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new); end if;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
    -- an organization being deleted takes its log with it
    if tg_op = 'DELETE' then return null; end if;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;
  if v_org is null then return null; end if;  -- shared catalogue rows are not studio activity
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = v_org) then
    return null;                               -- cascade from deleting the studio
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at', 'next_project_number', 'next_po_number', 'total');
    if v_changed is null then return null; end if;
  end if;

  v_record := coalesce(
    v_new ->> 'id', v_old ->> 'id',
    case tg_table_name
      when 'members' then coalesce(v_new, v_old) ->> 'user_id'
      when 'supplier_trades' then (coalesce(v_new, v_old) ->> 'supplier_id') || '/' || (coalesce(v_new, v_old) ->> 'trade_id')
      when 'rfq_line_items' then (coalesce(v_new, v_old) ->> 'rfq_id') || '/' || (coalesce(v_new, v_old) ->> 'line_item_id')
    end);

  v_change := left(private.request_header('x-change-id'), 64);
  if v_change is null or v_change !~ '^[A-Za-z0-9_.:-]+$' then
    v_change := 'tx:' || txid_current()::text;
  end if;
  v_client := private.request_claim('client_id');

  insert into public.activity_log
    (organization_id, actor_id, actor_email, source, client_id, change_id,
     table_name, record_id, action, old_row, new_row, changed_fields)
  values
    (v_org, v_actor,
     (select p.email from public.profiles p where p.user_id = v_actor),
     case when v_client is not null or private.request_header('x-client-source') = 'mcp' then 'ai'
          when v_actor is null then 'system'
          else 'app' end,
     v_client, v_change, tg_table_name, v_record, lower(tg_op), v_old, v_new, v_changed);
  return null;
end;
$$;
revoke all on function private.log_change() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'members', 'invitations',
    'clients', 'projects', 'site_visits', 'versions', 'decisions',
    'suppliers', 'supplier_trades', 'rfqs', 'rfq_line_items', 'quotes',
    'prices', 'line_items', 'offers', 'trades', 'partidas', 'room_templates'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.log_change()', t || '_activity', t);
  end loop;
end;
$$;

-- ── Undo ─────────────────────────────────────────────────────────────────────
create or replace function private.undo_key(p_table text)
returns text[]
language sql
immutable
as $$
  select case p_table
    when 'members' then array['organization_id', 'user_id']
    when 'supplier_trades' then array['supplier_id', 'trade_id']
    when 'rfq_line_items' then array['rfq_id', 'line_item_id']
    else array['id'] end;
$$;

create or replace function private.mark_undone(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.activity_log set undone_at = now(), undone_by = auth.uid()
  where id = any (p_ids) and undone_at is null
    and organization_id in (select private.user_writer_org_ids());
$$;
revoke all on function private.mark_undone(bigint[]) from public;
grant execute on function private.mark_undone(bigint[]) to authenticated;

-- Reverts every row of one change, newest first. Runs as the caller, so row-level security
-- and roles apply. Refuses if a row was edited after the change.
create or replace function public.undo_change(p_change_id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r          record;
  v_key      text[];
  v_where    text;
  v_cols     text;
  v_current  jsonb;
  v_field    text;
  v_done     bigint[] := '{}';
  v_pending  bigint[] := '{}';
  v_progress boolean;
  v_pass     int := 0;
begin
  if not exists (select 1 from public.activity_log where change_id = p_change_id and undone_at is null) then
    raise exception 'Nothing to undo for change %.', p_change_id;
  end if;
  -- The undo is itself a change, logged under its own id
  perform set_config('request.headers',
    (coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
      || jsonb_build_object('x-change-id', left('undo:' || p_change_id, 64)))::text, true);

  for r in select * from public.activity_log
           where change_id = p_change_id and undone_at is null order by id desc loop
    if r.organization_id not in (select private.user_writer_org_ids()) then
      raise exception 'Viewers cannot undo changes.';
    end if;
    if r.actor_id is distinct from (select auth.uid())
       and r.organization_id not in (select private.user_admin_org_ids()) then
      raise exception 'You can undo your own changes; admins can undo anyone''s.';
    end if;
    if r.table_name in ('activity_log', 'organizations') and r.action <> 'update' then
      raise exception 'This change cannot be undone.';
    end if;

    v_key := private.undo_key(r.table_name);
    select string_agg(format('%I = (%L::jsonb ->> %L)::%s', k, coalesce(r.new_row, r.old_row), k,
                             (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                              where a.attrelid = ('public.' || quote_ident(r.table_name))::regclass and a.attname = k)), ' and ')
      into v_where from unnest(v_key) k;

    if r.action in ('insert', 'update') then
      execute format('select to_jsonb(t) from public.%I t where %s', r.table_name, v_where) into v_current;
      if v_current is null then
        if r.action = 'update' then raise exception 'A % changed in % no longer exists.', r.table_name, p_change_id; end if;
        v_done := v_done || r.id;  -- already gone
        continue;
      end if;
      foreach v_field in array coalesce(r.changed_fields, array(select jsonb_object_keys(r.new_row))) loop
        if v_field not in ('updated_at', 'total', 'next_project_number', 'next_po_number')
           and (v_current -> v_field) is distinct from (r.new_row -> v_field) then
          raise exception 'The % was edited after this change (%), so it was not undone.', r.table_name, v_field;
        end if;
      end loop;
    end if;

    if r.action = 'insert' then
      execute format('delete from public.%I where %s', r.table_name, v_where);
      v_done := v_done || r.id;
    elsif r.action = 'update' then
      select string_agg(quote_ident(c), ', ') into v_cols
      from unnest(r.changed_fields) c
      where c not in ('updated_at', 'total', 'next_project_number', 'next_po_number');
      if v_cols is not null then
        execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s',
                       r.table_name, v_cols, v_cols, r.table_name, v_where) using r.old_row;
      end if;
      v_done := v_done || r.id;
    else
      v_pending := v_pending || r.id;  -- re-inserted below, parents before children
    end if;
  end loop;

  -- Re-insert deleted rows; retry until parents are back (cascaded deletes)
  while array_length(v_pending, 1) > 0 and v_pass < 10 loop
    v_pass := v_pass + 1;
    v_progress := false;
    for r in select * from public.activity_log where id = any (v_pending) order by id loop
      select string_agg(quote_ident(a.attname), ', ') into v_cols
      from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(r.table_name))::regclass
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
        and r.old_row ? a.attname;
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                       r.table_name, v_cols, v_cols, r.table_name) using r.old_row;
        v_done := v_done || r.id;
        v_pending := array_remove(v_pending, r.id);
        v_progress := true;
      exception when foreign_key_violation then
        null;  -- parent not back yet; next pass
      end;
    end loop;
    exit when not v_progress;
  end loop;
  if array_length(v_pending, 1) > 0 then
    raise exception 'Some deleted rows could not be restored because what they belonged to is gone.';
  end if;

  perform private.mark_undone(v_done);
  return coalesce(array_length(v_done, 1), 0);
end;
$$;
revoke all on function public.undo_change(text) from public, anon;
grant execute on function public.undo_change(text) to authenticated;
