#!/bin/bash
# Free, local-only check for the Fix 5 migrations
# 20261103090000_rls_initplan_wrap_auth_calls.sql (public) and
# 20261103090100_rls_initplan_wrap_storage.sql (storage.objects).
# Needs a throwaway local Postgres 17+ superuser (embedded-postgres binaries or
# `supabase start`). Never point PGHOST/PGPORT at prod: this creates databases
# and writes fixtures.
#
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres scripts/rls-tests/run_initplan.sh
#
# 1) before: every repo migration except this one (prod today).
# 2) after:  the same, then both Fix 5 migrations.
# Checks: (a) pg_policies is identical before and after once the wrap is
# normalized away (same names, roles, commands, expressions); (b) no bare
# auth.* call is left in any policy; (c) the same 54 case access matrix passes
# on both; (d) the planner shows an InitPlan for auth.uid() after; (e) run by a
# role that does not own storage.objects (like postgres on hosted Supabase),
# the storage migration skips cleanly and changes nothing.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/rls-tests"
MIG="$ROOT/supabase/migrations/20261103090000_rls_initplan_wrap_auth_calls.sql"
MIG_STORAGE="$ROOT/supabase/migrations/20261103090100_rls_initplan_wrap_storage.sql"
TEST="$HERE/rls_initplan_auth_wrap.sql"
case "${PGHOST:-}" in ""|/*|localhost|127.0.0.1) ;; *) echo "refusing non-local PGHOST"; exit 1;; esac

build() {
  local db=$1; shift
  psql -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db" 2>/dev/null
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$HERE/bootstrap.sql" >/dev/null
  for f in $(ls "$ROOT"/supabase/migrations/*.sql | grep -v 20261103090[01]00_rls_initplan) "$@"; do
    psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }
  done
}

build initplan_before
build initplan_after "$MIG" "$MIG_STORAGE"
# Re-applying must be a no-op (idempotent).
psql -q -v ON_ERROR_STOP=1 -d initplan_after -f "$MIG" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d initplan_after -f "$MIG_STORAGE" >/dev/null

psql -X -q -d initplan_before -f "$HERE/policies_snapshot.sql" > /tmp/initplan_before.txt
psql -X -q -d initplan_after  -f "$HERE/policies_snapshot.sql" > /tmp/initplan_after.txt
echo "== (a) policies before vs after (wrap normalized): $(wc -l < /tmp/initplan_before.txt) policies"
if ! diff -u /tmp/initplan_before.txt /tmp/initplan_after.txt; then echo "FAIL: policies changed beyond the wrap"; exit 1; fi
echo "identical"

echo "== (b) bare auth.* calls"
BEFORE=$(psql -X -q -d initplan_before -f "$HERE/bare_auth_calls.sql" | grep -c . || true)
AFTER=$(psql -X -q -d initplan_after -f "$HERE/bare_auth_calls.sql" | grep -c . || true)
echo "before: $BEFORE policies, after: $AFTER"
[ "$AFTER" = "0" ] || { echo "bare auth calls remain"; exit 1; }
[ "$BEFORE" = "15" ] || { echo "expected 15 policies to rewrite before, got $BEFORE"; exit 1; }

echo "== (c) access matrix before"
psql -X -d initplan_before -f "$TEST" > /tmp/initplan_matrix_before.txt
echo "== (c) access matrix after"
psql -X -d initplan_after -f "$TEST" > /tmp/initplan_matrix_after.txt
if ! diff -u /tmp/initplan_matrix_before.txt /tmp/initplan_matrix_after.txt; then echo "FAIL: access matrix differs"; exit 1; fi
echo "same results before and after"
grep -c PASS /tmp/initplan_matrix_after.txt | sed 's/$/ cases PASS/'

echo "== (d) plan after"
psql -X -q -d initplan_after -f "$HERE/initplan_explain.sql" | tee /tmp/initplan_explain.txt
grep -q "InitPlan" /tmp/initplan_explain.txt || { echo "no InitPlan"; exit 1; }
echo "== (e) storage migration as a role that does not own storage.objects"
build initplan_nonowner "$MIG"
psql -X -q -d initplan_nonowner -f "$HERE/policies_snapshot.sql" | grep '^storage\.' > /tmp/initplan_storage_before.txt
psql -X -q -d initplan_nonowner -c "DROP ROLE IF EXISTS initplan_migrator" -c "CREATE ROLE initplan_migrator NOSUPERUSER" \
  -c "GRANT USAGE ON SCHEMA storage TO initplan_migrator" 2>/dev/null
OUT=$(PGOPTIONS="-c client_min_messages=notice" psql -X -q -v ON_ERROR_STOP=1 -d initplan_nonowner \
  -c "SET ROLE initplan_migrator" -f "$MIG_STORAGE" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "skipped: initplan_migrator cannot alter policies on storage.objects" || { echo "storage migration did not skip"; exit 1; }
if ! psql -X -q -d initplan_nonowner -f "$HERE/policies_snapshot.sql" | grep '^storage\.' | diff -u /tmp/initplan_storage_before.txt -; then
  echo "FAIL: storage policies changed on skip"; exit 1
fi
echo "storage policies unchanged"
psql -X -q -d postgres -c "DROP DATABASE initplan_nonowner" -c "DROP ROLE IF EXISTS initplan_migrator" 2>/dev/null
echo "ALL CHECKS PASSED"
