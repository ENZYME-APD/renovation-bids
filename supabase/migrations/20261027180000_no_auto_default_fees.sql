-- New projects no longer get the studio's default fees automatically: each proposal sets its own.
-- The defaults stay in Settings and are added on demand with apply_default_fees().
drop trigger if exists projects_copy_default_fees on public.projects;
drop function if exists private.copy_default_fees();
