---
name: API spec/codegen drift check
description: How the orval-generated API clients are checked for drift against openapi.yaml, and what the check does/doesn't cover.
---

The `api-spec-drift` validation command (`bash lib/api-spec/check-drift.sh`) re-runs `pnpm --filter @workspace/api-spec run codegen` and then checks `git status --porcelain` on `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`. Any diff (including untracked new files) means openapi.yaml and the generated clients are out of sync, so it fails with the changed file list.

**Why:** openapi.yaml and its two generated outputs (api-client-react, api-zod) had drifted silently in the past (spec at 0.6.0, generated api.ts still describing an older field) because nothing regenerated+diffed them automatically.

**How to apply:** The check refuses to run (and says so) if the generated dirs already have uncommitted changes going in — it can't tell its own regeneration apart from pre-existing edits, so commit/stash first. It only runs when manually triggered via the validation flow; it is not wired into `pnpm run build`/`typecheck` or a git hook (see follow-up task on making it automatic).
