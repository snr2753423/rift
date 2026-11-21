---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# React Native / Expo Hooks

> This file extends [common-hooks.mdc](common-hooks.mdc) with React Native / Expo-specific automation guidance.

These are recommended after-edit automations to keep RN/Expo code healthy. Wire them in your hook runtime (or run manually); adapt commands to your package manager.

## Suggested after-edit checks (on edit of *.ts/*.tsx)

- **Type check:** `tsc --noEmit` — catch type errors early.
- **Lint:** `npx expo lint` (uses `eslint-config-expo`; flat config `eslint.config.js` is the default from SDK 53+).
- **Format:** `prettier --write` on changed files.

## Pre-release / periodic

- `npx expo-doctor` — validates Expo/native dependency health and config.
- `npx expo install --check` — keeps native deps aligned with the installed Expo SDK.
- `npm audit` — dependency vulnerability scan (END-ONLY — run at the very end of the project or when the user explicitly asks, see hackathon-mode §3).

## Notes

- Do not run heavy native builds inside fast edit hooks; keep edit-time hooks to typecheck/lint/format.
- Reserve `eas build` / E2E for explicit commands or CI, not per-edit automation.
- Keep these consistent with ECC hook runtime controls (`ECC_HOOK_PROFILE`, `ECC_DISABLED_HOOKS`).
