-- Daily job: expire supplier requests that got every reminder and no reply.
-- (Sending the reminder emails is done by the reminder agent, which reads
--  public.rfqs_due_reminder and sends through Gmail.)
create extension if not exists pg_cron;

select cron.schedule(
  'expire-stale-rfqs',
  '0 6 * * *',
  $$select private.expire_stale_rfqs()$$
);
