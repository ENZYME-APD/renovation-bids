-- Join a studio by email domain. A studio can claim its company domain (e.g. weareenzyme.com);
-- anyone signing in with a verified email on that domain is offered to join it as a member,
-- instead of being asked to create a new studio. Invitations keep working for everyone else.

alter table public.organizations add column email_domain text;
create unique index organizations_email_domain_key on public.organizations (lower(email_domain)) where email_domain is not null;
comment on column public.organizations.email_domain is
  'Company email domain. Verified users on it can join the studio as members. Must be the domain of the admin who sets it; public mail domains are refused.';

-- The signed-in user's email, only if verified.
create or replace function private.verified_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;
revoke all on function private.verified_email() from public;
grant execute on function private.verified_email() to authenticated;

create or replace function private.email_domain_of(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(lower(split_part(coalesce(p_email, ''), '@', 2)), ''); $$;

-- Setting the domain: only your own company domain, never a public mail provider.
create or replace function private.check_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_domain is not distinct from old.email_domain then return new; end if;
  if new.email_domain is null then return new; end if;
  new.email_domain := lower(trim(new.email_domain));
  if new.email_domain in ('gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
                          'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
                          'gmx.com', 'aol.com', 'msn.com', 'telefonica.net') then
    raise exception 'Public email providers can''t be a studio domain.' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null
     and private.email_domain_of(private.verified_email()) is distinct from new.email_domain then
    raise exception 'You can only set your own email domain (%).', private.email_domain_of(private.verified_email()) using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.check_email_domain() from public;
create trigger organizations_check_email_domain before update on public.organizations
  for each row execute function private.check_email_domain();

-- Studios the signed-in user may join by domain (and isn't in yet).
create or replace function public.joinable_studios()
returns table (id uuid, name text, email_domain text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.email_domain
  from public.organizations o
  where o.email_domain is not null
    and lower(o.email_domain) = private.email_domain_of(private.verified_email())
    and not exists (select 1 from public.members m where m.organization_id = o.id and m.user_id = (select auth.uid()));
$$;
revoke all on function public.joinable_studios() from public, anon;
grant execute on function public.joinable_studios() to authenticated;

create or replace function public.join_studio_by_domain(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.joinable_studios() j where j.id = p_org) then
    raise exception 'Your email can''t join this studio. Ask an admin for an invitation.' using errcode = 'P0001';
  end if;
  insert into public.members (organization_id, user_id, role)
  values (p_org, (select auth.uid()), 'member');
  return p_org;
end;
$$;
revoke all on function public.join_studio_by_domain(uuid) from public, anon;
grant execute on function public.join_studio_by_domain(uuid) to authenticated;
