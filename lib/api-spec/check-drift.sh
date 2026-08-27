#!/usr/bin/env bash
# Detects drift between lib/api-spec/openapi.yaml and the generated API
# clients (lib/api-client-react/src/generated, lib/api-zod/src/generated).
#
# It re-runs orval codegen and checks whether that changes any committed
# file. If it does, someone edited openapi.yaml (or hand-edited a generated
# file) without regenerating and committing the output, so the generated
# clients no longer match the spec.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

GENERATED_PATHS=(
  "lib/api-client-react/src/generated"
  "lib/api-zod/src/generated"
)

# Fail loudly if there were already-uncommitted changes to the generated
# output before we start — otherwise we can't tell our own regeneration
# apart from pre-existing local edits.
PRE_EXISTING="$(git status --porcelain -- "${GENERATED_PATHS[@]}")"
if [ -n "$PRE_EXISTING" ]; then
  echo "Cannot check for API spec drift: the generated API client files already have uncommitted changes." >&2
  echo "Commit or stash them first, then re-run this check." >&2
  echo "$PRE_EXISTING" >&2
  exit 1
fi

echo "Running orval codegen from lib/api-spec/openapi.yaml..."
if ! (cd lib/api-spec && pnpm run codegen); then
  echo "codegen failed to run — see output above." >&2
  exit 1
fi

DRIFT="$(git status --porcelain -- "${GENERATED_PATHS[@]}")"

if [ -n "$DRIFT" ]; then
  echo ""
  echo "API spec drift detected!" >&2
  echo "lib/api-spec/openapi.yaml no longer matches the committed generated API clients" >&2
  echo "(lib/api-client-react/src/generated and lib/api-zod/src/generated)." >&2
  echo "" >&2
  echo "Changed/untracked files after running codegen:" >&2
  echo "$DRIFT" >&2
  echo "" >&2
  echo "Fix: run 'pnpm --filter @workspace/api-spec run codegen' and commit the result." >&2
  exit 1
fi

echo "No drift detected — generated API clients match openapi.yaml."
