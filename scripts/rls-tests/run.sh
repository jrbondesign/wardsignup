#!/bin/bash
# Free, local-only RLS check. Needs a throwaway local Postgres 17+ superuser
# (e.g. `npx embedded-postgres` binaries, or `supabase start`). Never point
# PGHOST/PGPORT at prod: this creates databases and writes fixtures.
#
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres scripts/rls-tests/run.sh
#
# 1) before: all repo migrations except the lockdown + prod_drift.sql (the two
#    prod-only allow-all policies). The RLS test is expected to FAIL here.
# 2) after:  same, then the lockdown migration. The RLS test must pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/rls-tests"
LOCK="$ROOT/supabase/migrations/20261101140000_lock_down_sessions_event_invites_rls.sql"
TEST="$HERE/rls_lockdown_sessions_event_invites.sql"
case "${PGHOST:-}" in ""|/*|localhost|127.0.0.1) ;; *) echo "refusing non-local PGHOST"; exit 1;; esac

build() {
  local db=$1; shift
  psql -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$HERE/bootstrap.sql" >/dev/null
  for f in $(ls "$ROOT"/supabase/migrations/*.sql | grep -v 20261101140000_lock_down) "$@"; do
    psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }
  done
}

build rls_before "$HERE/prod_drift.sql"
echo "== before (prod today): expect failures"
psql -d rls_before -f "$TEST" || true
build rls_after "$HERE/prod_drift.sql" "$LOCK"
echo "== after lockdown: must pass"
psql -d rls_after -f "$TEST"
