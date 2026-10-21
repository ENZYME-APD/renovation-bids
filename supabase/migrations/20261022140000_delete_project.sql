-- Deleting a project is for owners and admins only (members could before), and never by an AI assistant
-- (user_admin_org_ids excludes AI requests). Everything under it goes with it; the activity log keeps
-- every row, so Settings → Activity can undo it.
drop policy projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (organization_id in (select private.user_admin_org_ids()));

-- A project points at its contract version and the version at its project. Undoing a deletion
-- restores both in one transaction, so the project → contract reference is checked at commit.
alter table public.projects
  alter constraint projects_contract_version_id_organization_id_fkey deferrable initially deferred;
