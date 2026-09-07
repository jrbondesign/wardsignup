#!/usr/bin/env bash
# Apply organizer email migration to remote Supabase Postgres.
#
# Option 1 — psql (fastest if you have the connection string):
#   export DATABASE_URL="postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"
#   ./scripts/apply-organizer-email-migration.sh
#
# Option 2 — Supabase CLI (after: supabase login && supabase link --project-ref <ref>):
#   cd "$(dirname "$0")/.."
#   supabase db push
#
# Option 3 — Supabase Dashboard → SQL Editor → paste the migration file contents.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/migrations/20260401120000_organizer_email.sql"

if [[ ! -f "$SQL" ]]; then
  echo "Missing migration: $SQL"
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Applying via psql and DATABASE_URL..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL"
  echo "Done."
  exit 0
fi

if command -v supabase >/dev/null 2>&1; then
  cd "$ROOT"
  if supabase projects list >/dev/null 2>&1; then
    echo "Applying via supabase db push..."
    supabase db push
    exit 0
  fi
fi

echo "No DATABASE_URL or logged-in Supabase CLI."
echo ""
echo "Do one of the following:"
echo "  1) Supabase Dashboard → SQL Editor → paste and run this file:"
echo "     $SQL"
echo "  2) Run: supabase login && supabase link --project-ref <your-project-ref> && supabase db push"
echo "  3) Set DATABASE_URL and run this script again."
exit 1
