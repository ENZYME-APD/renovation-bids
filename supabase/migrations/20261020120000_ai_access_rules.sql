-- AI access rules enforced in the database, not only in the MCP server.
--
-- An OAuth access token issued to an AI assistant (it carries a client_id claim) could be used
-- directly against the Data API, so the studio's rules live in the membership helpers that every
-- policy already uses:
--   organizations.ai_connect  who may use an assistant at all     none | admins | members | everyone
--   organizations.ai_changes  who may let it change data          admins | members
-- Assistants never get admin rights (studio settings, team, invitations) and viewers never write.
-- Ordinary app sessions (no client_id claim) are unaffected.

create or replace function private.is_ai_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.request_claim('client_id') is not null;
$$;

create or replace function private.ai_may_connect(p_role text, p_rule text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_rule
    when 'everyone' then true
    when 'members' then p_role in ('owner', 'admin', 'member')
    when 'admins' then p_role in ('owner', 'admin')
    else false
  end;
$$;

create or replace function private.ai_may_change(p_role text, p_rule text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role in ('owner', 'admin') or (p_rule = 'members' and p_role = 'member');
$$;

create or replace function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and (not private.is_ai_request() or private.ai_may_connect(m.role::text, o.ai_connect));
$$;

create or replace function private.user_writer_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.role::text in ('owner', 'admin', 'member')
    and (not private.is_ai_request()
         or (private.ai_may_connect(m.role::text, o.ai_connect)
             and private.ai_may_change(m.role::text, o.ai_changes)));
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
    and m.role in ('owner', 'admin')
    and not private.is_ai_request();
$$;

revoke all on function private.is_ai_request(), private.ai_may_connect(text, text), private.ai_may_change(text, text) from public;
grant execute on function private.is_ai_request(), private.ai_may_connect(text, text), private.ai_may_change(text, text) to authenticated;
