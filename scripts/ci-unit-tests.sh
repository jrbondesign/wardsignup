#!/usr/bin/env bash
# Run Jest tests the PR diff can reach; fall back to the full unit suite.
set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  git fetch --no-tags origin main
fi

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Could not resolve $BASE_REF; running the full unit suite."
  exec npm test -- --ci --color
fi

changed="$(git diff --name-only "$BASE_REF"...HEAD || true)"
if [ -z "$changed" ] || echo "$changed" | grep -Eq '(^|/)(package-lock\.json|package\.json|jest\.config\.[a-z]+|tsconfig.*\.json|eslint\.config\.[a-z]+)$|^\.github/workflows/'; then
  echo "Config, workflow, or empty diff; running the full unit suite."
  exec npm test -- --ci --color
fi

tests="$(npx jest --changedSince="$BASE_REF" --listTests || true)"
if [ -z "$tests" ]; then
  echo "No tests related to this diff; running the full unit suite."
  exec npm test -- --ci --color
fi

echo "Running tests related to this diff:"
echo "$tests"
exec npx jest --ci --color --changedSince="$BASE_REF"
