#!/usr/bin/env bash
# Push local supabase/migrations to a remote Supabase project.
#
# Prerequisites:
#   1. Create a personal access token: https://supabase.com/dashboard/account/tokens
#   2. Staging project ref: Dashboard → Project Settings → General → Reference ID
#
# Usage (staging):
#   export SUPABASE_ACCESS_TOKEN="your-token"
#   export SUPABASE_PROJECT_REF="abcdefghijklmnop"   # staging ref only
#   ./scripts/supabase-push-remote.sh
#
# Always set SUPABASE_PROJECT_REF explicitly (staging ref recommended).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Error: set SUPABASE_ACCESS_TOKEN (Supabase Dashboard → Account → Access Tokens)."
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Error: set SUPABASE_PROJECT_REF to the target project Reference ID (e.g. staging)."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN

echo "Linking project ${SUPABASE_PROJECT_REF}..."
supabase link --project-ref "${SUPABASE_PROJECT_REF}" --yes

echo "Pushing migrations..."
supabase db push --yes

echo "Done. Verify in Dashboard → Database → Migrations."
