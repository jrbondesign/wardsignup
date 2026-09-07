#!/usr/bin/env bash
# When production was set up before `supabase db push`, the remote DB can be ahead
# of migration history. Mark legacy migrations as "applied" without re-running SQL,
# then `db push` will only apply new files (e.g. 20250329000000_...).
#
# Prereq: linked project (`supabase link`) and SUPABASE_ACCESS_TOKEN in env or .env.supabase
#
# Usage:
#   source .env.supabase   # or export SUPABASE_ACCESS_TOKEN=...
#   ./scripts/repair-remote-migration-history.sh
#   supabase db push --yes

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SECRET="$ROOT/.env.supabase"
if [[ -f "$SECRET" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRET"
  set +a
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Set SUPABASE_ACCESS_TOKEN (e.g. source .env.supabase)"
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

# These versions already match production; we only sync the history table.
# If `repair` says a version is already applied, skip that line and continue.
# If `db push` still tries 20250326000000 and errors, add:
#   supabase migration repair --status applied 20250326000000 --yes
LEGACY=(
  "20250326000001"
  "20250326000002"
  "20250327000001"
)

echo "Marking legacy migrations as applied on linked remote..."
for v in "${LEGACY[@]}"; do
  echo "  repair --status applied $v"
  supabase migration repair --status applied "$v" --yes
done

echo ""
echo "Done. Next run:"
echo "  supabase db push --yes"
echo "That should apply only 20250329000000_public_campaign_and_atomic_signup.sql (if not already)."
