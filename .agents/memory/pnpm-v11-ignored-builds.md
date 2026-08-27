---
name: pnpm v11 ERR_PNPM_IGNORED_BUILDS
description: Why a Render (or any CI) deploy can fail with ERR_PNPM_IGNORED_BUILDS even though `pnpm install` is clean in the Replit workspace, and how to fix it without weakening the supply-chain allowlist.
---

## The trap

`pnpm-workspace.yaml` can list approved build-script packages under `onlyBuiltDependencies` (pnpm v10.x mechanism). pnpm v11+ dropped that key from its settings entirely in favor of `allowBuilds` (a name→boolean map) plus `strictDepBuilds` (defaults to `true` in v11+). A workspace configured only with `onlyBuiltDependencies` installs cleanly under pnpm v10 but hard-fails under pnpm v11+ with:

```
ERR_PNPM_IGNORED_BUILDS
Ignored build scripts: <package>
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

This bites specifically when the repo has **no `packageManager` field** pinning the pnpm version — the dev workspace uses whatever pnpm is preinstalled (often v10.x), while a host like Render resolves a newer default (v11+) at build time, so the same lockfile behaves differently in the two places.

## The fix

Keep both mechanisms in sync in `pnpm-workspace.yaml`, so it works on both major lines:

```yaml
onlyBuiltDependencies:
  - esbuild
  # ... existing approvals

allowBuilds:
  esbuild: true
  # ... same approvals, mirrored
```

Also pin `"packageManager": "pnpm@<exact version>"` in the root `package.json` for determinism, but don't rely on the pin alone — not every host's build step honors corepack, so `allowBuilds` is the real fix and the pin is defense in depth.

**Why:** confirmed by reproducing a from-scratch install with pnpm 10.26.1 (clean) vs pnpm 11.24.0 (fails on `esbuild@0.27.3` specifically) against the same lockfile/config — isolates the failure to the pnpm major version's config schema, not the dependency itself. pnpm v11 itself will auto-append a `allowBuilds: { pkg: "set this to true or false" }` placeholder stub into `pnpm-workspace.yaml` when it first hits this in non-interactive/CI mode — if you see that stub, replace the placeholder string with a real `true`/`false` per package rather than deleting it.

## Gotcha while reproducing this locally

`corepack use pnpm@<version>` writes its downloaded tool into the **shared** corepack tools dir (e.g. `.local/share/pnpm/.tools/pnpm/<version>_tmp_*`) regardless of which directory you run it from — it is not scoped to a `/tmp` scratch copy. If you run it while testing a different pnpm version, the leftover temp package.json under `.local/share/pnpm/.tools/` can get vacuumed into the *real* project's `pnpm-lock.yaml` as a bogus importer on the next `pnpm install` in the real workspace, and the lockfile's `catalogs` section can get dropped in the same rewrite. Fix: delete the stray `.local/share/pnpm/.tools/pnpm/<version>*` dirs, `git checkout -- pnpm-lock.yaml`, and reinstall clean — verify with `git diff --stat pnpm-lock.yaml` that it comes back empty. Prefer testing alternate pnpm versions via `npm install -g pnpm@<version> --prefix /tmp/some-throwaway-prefix` and invoking the binary by full path instead of `corepack use`.
