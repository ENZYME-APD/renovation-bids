-- Core read paths the app and agents use. All run with the caller's
-- permissions (security invoker), so RLS still applies.

-- 1. Best current price per partida for an organization:
--    own prices first (history, reviewed quotes, manual), then the shared
--    regional reference; most confident and most recent wins.
create or replace function public.current_prices(p_org uuid)
returns table (
  partida_id   uuid,
  price_id     uuid,
  unit_price   numeric,
  source       public.price_source,
  confidence   public.confidence,
  priced_on    date,
  valid_until  date,
  supplier_id  uuid,
  is_own       boolean
)
language sql
stable
set search_path = ''
as $$
  select distinct on (p.partida_id)
         p.partida_id, p.id, p.unit_price, p.source, p.confidence,
         p.priced_on, p.valid_until, p.supplier_id,
         p.organization_id is not null
  from public.prices p
  left join public.quotes q on q.id = p.quote_id
  where (p.organization_id = p_org
         or (p.organization_id is null
             and p.region_id = (select o.region_id from public.organizations o where o.id = p_org)))
    and (p.valid_until is null or p.valid_until >= current_date)
    and (p.source <> 'quote' or q.reviewed_at is not null)   -- AI-parsed quotes count only once reviewed
  order by p.partida_id,
           (p.organization_id is not null) desc,
           case p.confidence when 'high' then 0 when 'medium' then 1 else 2 end,
           p.priced_on desc;
$$;

-- 2. Budget of one version by trade, with a low/high range.
--    Range spread per confidence level comes from regions.settings.confidence_spread.
create or replace function public.version_budget(p_version uuid)
returns table (
  trade_id      uuid,
  trade         text,
  sequence      smallint,
  lines         bigint,
  priced_lines  bigint,
  subtotal      numeric,
  budget_low    numeric,
  budget_high   numeric
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, t.sequence,
         count(*),
         count(li.unit_price),
         coalesce(sum(li.total), 0),
         round(coalesce(sum(li.total * (1 - s.spread)), 0), 2),
         round(coalesce(sum(li.total * (1 + s.spread)), 0), 2)
  from public.line_items li
  join public.partidas pa      on pa.id = li.partida_id
  join public.trades t         on t.id = pa.trade_id
  join public.organizations o  on o.id = li.organization_id
  join public.regions r        on r.id = o.region_id
  cross join lateral (
    select coalesce((r.settings -> 'confidence_spread' ->> coalesce(li.confidence::text, 'low'))::numeric, 0.25) as spread
  ) s
  where li.version_id = p_version
  group by t.id, t.name, t.sequence
  order by t.sequence, t.name;
$$;

-- 3. Supplier requests due a reminder (read by the reminder agent).
create view public.rfqs_due_reminder with (security_invoker = true) as
select r.id, r.organization_id, r.project_id, r.supplier_id, s.name as supplier, s.email,
       r.status, r.sent_at, r.reminder_count, r.last_reminder_at, r.reply_by, r.gmail_thread_id
from public.rfqs r
join public.suppliers s      on s.id = r.supplier_id
join public.organizations o  on o.id = r.organization_id
join public.regions g        on g.id = o.region_id
where r.status in ('sent', 'reminded')
  and not s.opt_out
  and r.reminder_count < coalesce((g.settings ->> 'rfq_max_reminders')::int, 2)
  and now() >= coalesce(r.last_reminder_at, r.sent_at)
               + make_interval(days => coalesce((g.settings ->> 'rfq_reminder_days')::int, 3));

-- 4. Supplier responsiveness, used to choose who to ask next time.
create view public.supplier_response with (security_invoker = true) as
select s.id as supplier_id, s.organization_id, s.name,
       count(r.id) filter (where r.sent_at is not null)                 as requests_sent,
       count(distinct q.rfq_id)                                         as requests_answered,
       round(count(distinct q.rfq_id)::numeric
             / nullif(count(r.id) filter (where r.sent_at is not null), 0), 2) as response_rate,
       round(avg(extract(epoch from (q.received_at - r.sent_at)) / 86400)::numeric, 1) as avg_days_to_reply
from public.suppliers s
left join public.rfqs r   on r.supplier_id = s.id
left join public.quotes q on q.rfq_id = r.id
group by s.id, s.organization_id, s.name;

-- 5. Estimate accuracy: last offer's range against the real final cost.
create view public.estimate_accuracy with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name,
       o.budget_low, o.budget_high, p.actual_cost,
       p.actual_cost between o.budget_low and o.budget_high as within_range,
       round((p.actual_cost - (o.budget_low + o.budget_high) / 2)
             / nullif((o.budget_low + o.budget_high) / 2, 0) * 100, 1) as error_vs_mid_pct
from public.projects p
join lateral (
  select budget_low, budget_high
  from public.offers
  where project_id = p.id and status in ('sent', 'accepted')
  order by revision desc
  limit 1
) o on true
where p.actual_cost is not null;

-- 6. Line items that still need a price (feed for supplier requests).
create view public.lines_needing_price with (security_invoker = true) as
select li.id, li.organization_id, v.project_id, li.version_id, pa.code, pa.short_description,
       pa.unit, li.quantity, pa.trade_id, li.state
from public.line_items li
join public.versions v  on v.id = li.version_id
join public.partidas pa on pa.id = li.partida_id
where li.state in ('unpriced', 'needs_rfq');

grant select on public.rfqs_due_reminder, public.supplier_response,
                public.estimate_accuracy, public.lines_needing_price to authenticated;
revoke all on public.rfqs_due_reminder, public.supplier_response,
              public.estimate_accuracy, public.lines_needing_price from anon;
revoke all on function public.current_prices(uuid), public.version_budget(uuid) from public, anon;
grant execute on function public.current_prices(uuid), public.version_budget(uuid) to authenticated;

-- Housekeeping run daily by pg_cron (next migration): close requests
-- that got all their reminders and still no reply.
create or replace function private.expire_stale_rfqs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.rfqs r
     set status = 'expired'
    from public.organizations o
    join public.regions g on g.id = o.region_id
   where o.id = r.organization_id
     and r.status in ('sent', 'reminded')
     and r.reminder_count >= coalesce((g.settings ->> 'rfq_max_reminders')::int, 2)
     and now() >= coalesce(r.last_reminder_at, r.sent_at)
                  + make_interval(days => coalesce((g.settings ->> 'rfq_reminder_days')::int, 3))
     and not exists (select 1 from public.quotes q where q.rfq_id = r.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.expire_stale_rfqs() from public;
