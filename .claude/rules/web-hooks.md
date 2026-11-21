---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

> This file extends [common-hooks.mdc](common-hooks.mdc) with web-specific hook recommendations.

# Web Hooks

## Recommended After-Edit Hooks

Prefer project-local tooling. Do not wire hooks to remote one-off package execution.

### Format on Save

Use the project's existing formatter entrypoint after edits. This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js` (which already batches format and type-check work at stop time via `hooks/stop.js`): after a frontend file is edited, run `pnpm prettier --write` on the edited file.

Equivalent local commands via `yarn prettier` or `npm exec prettier --` are fine when they use repo-owned dependencies.

### Lint Check

This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after a frontend file is edited, run `pnpm eslint --fix` on the edited file.

### Type Check

Use `--incremental` so re-runs reuse the previous `.tsbuildinfo` (1-3s on unchanged code instead of 30-60s every time). Wrap in `timeout` so a stuck tsc gets reaped by the OS instead of accumulating across edits — this prevents the multi-process buildup that happens when edits fire faster than tsc finishes.

This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after a frontend file is edited, run `timeout 60 pnpm tsc --noEmit --pretty false --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo`. (The plugin already batches type-checking at stop time via `hooks/stop.js`; a per-edit branch here is the faster-feedback variant.)

**Why both flags matter:**
- Without `--incremental`, every edit re-checks the entire program from scratch. On a real Next.js project this stacks fast: edits at 5-10s intervals + 30-60s tsc runs = N concurrent tsc processes.
- Without `timeout`, a tsc that hangs (transitive dep change, type-checker stuck on a recursive type) never exits and orphans when the parent shell does.
- `--tsBuildInfoFile` is required because `--noEmit` normally suppresses the buildinfo write; specifying the path explicitly keeps incremental working.

If you're on Windows without GNU coreutils, swap `timeout 60` for a PowerShell wrapper or rely on a Stop/SessionEnd hook to sweep stale tsc processes.

### CSS Lint

NOT shipped: no stylelint wiring exists in this plugin. The shipped `afterFileEdit` entry in `hooks/hooks.json` runs only `hooks/after-file-edit.js`, which accumulates edited JS/TS paths, warns on `console.log`, and runs the frontend design-quality reminder — it never runs stylelint (or any CSS linter) on an edited stylesheet. If a project wants `pnpm stylelint --fix` on stylesheet edits, that would be a new hook branch to add deliberately, not something already wired here.

## Before-Write Guard (no Cursor equivalent)

### Guard File Size

Block oversized writes from tool input content, not from a file that may not exist yet. This was a Cursor pre-write hook block that rejected a write over 800 lines before it happened. Cursor has no equivalent for blocking a write: neither `beforeReadFile` nor `beforeSubmitPrompt` can block a write. And no after-the-fact equivalent is shipped either: the shipped `afterFileEdit` entry in `hooks/hooks.json` runs only `hooks/after-file-edit.js` (accumulate edited paths, warn on `console.log`, run the frontend design-quality reminder) — it has no 800-line check and warns about nothing based on file size. There is currently no shipped warning when an edited file exceeds 800 lines; splitting oversized files is a manual review step, not a hook behaviour.

## Stop Hooks

### Final Build Verification

This was a Cursor stop-hook block; it is NOT wired in this plugin. The `stop` event in `hooks/hooks.json` runs `hooks/stop.js`, which batches format, type-check, console-log, and session-end work at session end — it runs no `pnpm build` and performs no production-build verification. No build verification runs at session end in the shipped hooks; running `pnpm build` before closing a session is a manual step. (Adding a `pnpm build` dispatch branch to `hooks/stop.js` would be new wiring, not something already present.)

## Ordering

Recommended order:
1. format
2. lint
3. type check
4. build verification
