#!/usr/bin/env bash
# Runs all migrations + seed + tests on a throwaway local Postgres (16+).
# Usage: PGHOST=... PGUSER=... supabase/tests/run_local.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
db="renovation_bids_test"

dropdb --if-exists "$db"
createdb "$db"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }

run "$here/00_local_supabase_stub.sql"
for f in "$root"/migrations/*.sql; do
  case "$f" in *_cron.sql) echo "skip $(basename "$f") (needs pg_cron)"; continue;; esac
  echo "apply $(basename "$f")"
  run "$f"
done
echo "run tests"
# One session: the catalogue test reuses the studios set up by the first file.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/rls_and_flow_test.sql" -f "$here/catalogue_test.sql" -f "$here/activity_test.sql" -f "$here/purchases_test.sql" -f "$here/ai_access_test.sql" -f "$here/lifecycle_test.sql" -f "$here/costing_loop_test.sql" -f "$here/room_geometry_test.sql"
