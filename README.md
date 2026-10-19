# Renovation Bids

From site visit to a priced offer. Multi-tenant from day one: Enzyme is the first organization.

- **App:** Next.js 16 (App Router) in this folder, deployed on Vercel.
- **Database:** Supabase (Postgres) in `supabase/`, deployed through Supabase's GitHub integration.

## App

| Route | What it does |
|---|---|
| `/login` | Email sign-in link (no password) |
| `/onboarding` | Create your studio; you become its owner |
| `/projects` | Project list and new project |
| `/projects/[id]` | Project facts, status, versions with budget ranges, new version (empty or copied) |
| `/projects/[id]/versions/[versionId]` | Budget editor: lines by trade, quantities, prices, confidence, low–high range per trade |

Local development:

```
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run dev
```

All data access goes through the signed-in user's session, so the database's row-level security decides what each user sees. No service key is used by the app.

# Database

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
