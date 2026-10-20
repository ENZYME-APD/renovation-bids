# Renovation Bids

From site visit to a priced offer. Multi-tenant from day one: Enzyme is the first organization.

- **App:** Next.js 16 (App Router) in this folder, deployed on Vercel.
- **Database:** Supabase (Postgres) in `supabase/`, deployed through Supabase's GitHub integration.

## App

| Route | What it does |
|---|---|
| `/login` | Email sign-in link (no password) |
| `/onboarding` | Create your studio; you become its owner |
| `/dashboard` | KPIs, action items, charts (status, bids per month, €/m², budget vs committed vs paid), recent activity |
| `/projects` | Project list and new project |
| `/projects/[id]` | Project facts, status, versions with budget ranges, new version (empty or copied) |
| `/projects/[id]/versions/[versionId]` | Budget editor: lines grouped by chapter or room, batch edit (state, confidence, room, price, quantity factor, delete, undo), add room / add line dialogs |
| `/projects/[id]/purchases` | Cost control by chapter, purchase orders from budget lines, supplier invoices, payments, "save as price" |
| `/catalogue` | Partidas by chapter with current price and price history; new studio partidas, customise or hide standard ones, set prices |
| `/settings` | Profile, studio (currency, language, default contingency and VAT), team and invitations, AI access, activity log with undo |
| `/invite/[token]` | Accept an invitation (must be signed in with the invited email) |
| `/oauth/consent` | Approve an AI assistant's access (Supabase OAuth server) |
| `/api/mcp` | MCP server for AI assistants (see below) |

Roles: owner, admin (studio and team), member (edit projects), viewer (read only).

## Theme

Every colour, radius and font lives in `app/theme.css`, each colour as `light-dark(<light>, <dark>)`. Change the values there to rebrand; components only use the tokens (`bg-surface`, `text-ink`, `bg-accent`…). The header toggle cycles Auto (follows the system), Light and Dark, saved in a `theme` cookie so the page renders in the right theme straight away.

## AI assistants (MCP)

`/api/mcp` is a stateless MCP server (JSON-RPC over HTTP), modelled on the Fee Calculator's. Sign-in is OAuth 2.1 with Supabase Auth as the authorization server; the assistant's token runs as the user, so row-level security applies. The studio's rules (Settings → AI access: who may connect, who may let it make changes) are enforced in the database too (`…_ai_access_rules.sql`), because an assistant's token could also reach the Data API directly. Assistants never get admin rights. Every change carries a change id and can be undone.

One-time setup in Supabase (Authentication → OAuth Server): enable it, set the authorization path to `/oauth/consent`, allow dynamic client registration. Then in Claude add a custom connector with `https://renovation-bids.vercel.app/api/mcp`.

## Activity log

Database triggers record every insert, update and delete on studio data: who, when, from where (app, AI, system), the old and new row. The app sends `x-change-id` per request and the MCP server per tool call; `undo_change(change_id)` reverts a whole change, refusing if the rows were edited since.

## Types

`lib/database.types.ts` can be regenerated from a local database with the migrations applied (useful before a migration is deployed):

```
PGHOST=... PGUSER=... PGDATABASE=... python3 scripts/gen_types.py
```

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
| `…_catalogue_es_v1.sql` | Standard catalogue: 20 chapters, 97 partidas, 10 room templates, bid-stage rule |
| `…_roles_settings_activity.sql` | Viewer role, studio settings, profiles, invitations, activity log and undo |
| `…_purchases_dashboard.sql` | Purchase orders, supplier invoices, payments, cost-control and dashboard views, action items |
| `…_ai_access_rules.sql` | Studio AI rules enforced in the membership helpers |
| `supabase/tests/` | Local test runner + 97 checks: tenant isolation, bid flow, catalogue, activity/undo, roles, purchasing, AI rules |

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

# Catalogue (Spain)

`catalogue/es_catalogue.py` is the single source for Enzyme's standard partida catalogue: 20 chapters mapped to CYPE renovation chapters, 97 all-in partidas with stable codes (`DEM-040`, `REV-010`…), and 10 room templates (quantity = factor × size + fixed).

```
python3 catalogue/build_xlsx.py   # catalogue/out/Enzyme_catalogo_partidas_ES.xlsx (catalogue + calculator)
python3 catalogue/build_sql.py    # migration for the shared catalogue + catalogue/out/enzyme_prices.sql
```

Prices are Enzyme's own (Ortega y Gasset 47, REV 2) and stay private to the studio: run `catalogue/out/enzyme_prices.sql` once after the Enzyme studio exists.

**Bid-stage rule:** a project has one standard version until its status is Won; the database blocks a second version before that.
