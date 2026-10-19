# Renovation Bids — database

Supabase (Postgres) schema for the renovation-bid product. Multi-tenant from day one: Enzyme is the first organization.

## What's here

| File | Contents |
|---|---|
| `supabase/migrations/…_platform.sql` | Regions, organizations, members, tenancy helpers, `create_organization()` sign-up function |
| `…_domain.sql` | 16 business tables + 2 link tables, composite foreign keys, scope triggers |
| `…_rls.sql` | Row-level security: own rows + shared regional catalogue (read-only) |
| `…_queries.sql` | `current_prices()`, `version_budget()`, views for reminders, supplier response, estimate accuracy, lines needing a price |
| `…_cron.sql` | Daily pg_cron job that expires unanswered supplier requests |
| `…_seed_spain.sql` | Spain region settings, 15 trades, 15 starter partidas (placeholder codes, no prices) |
| `supabase/tests/` | Local test runner + 36 checks: tenant isolation and the core bid flow |

## Rules the database enforces

- Each studio sees and edits only its own rows. Tested with a second dummy studio.
- A row can't point to another studio's row (composite foreign keys plus triggers).
- A supplier request can't be marked sent without a named approver.
- A price parsed by AI from a quote is not used until someone reviews it.
- Shared catalogue and region settings are read-only for customers.
- Suppliers found on the web must record where the contact came from (GDPR/LSSI).

## Run the tests locally

Needs Postgres 16. `00_local_supabase_stub.sql` fakes the Supabase auth pieces, for local use only.

```
PGHOST=... PGUSER=... supabase/tests/run_local.sh
```

## Deploy

The Supabase project is linked to this repo through Supabase's GitHub integration: migrations in `supabase/migrations` deploy when merged to `main`. New migrations need a timestamp later than the last one. Storage buckets (scans, photos, offers) are not in the migrations yet.

## Defaults to review

`regions.settings` for `es`: confidence spreads ±5% / ±12% / ±25%, a reminder after 3 days, a maximum of 2 reminders. These are proposed starting values, not researched figures.
