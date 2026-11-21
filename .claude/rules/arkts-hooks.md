---
paths:
  - "**/*.ets"
  - "**/*.ts"
  - "**/module.json5"
  - "**/oh-package.json5"
---

# HarmonyOS / ArkTS Hooks

> This file extends [common-hooks.mdc](common-hooks.mdc) with HarmonyOS-specific build and validation hooks.

## Build Commands

### HAP Package Build

```bash
# Build HAP package (global hvigor environment)
hvigorw assembleHap -p product=default

# Build with specific module
hvigorw assembleHap -p module=entry -p product=default

# Clean build
hvigorw clean
```

### DevEco Studio CLI

```bash
# Check project structure
hvigorw --version

# Install dependencies
ohpm install

# Update dependencies
ohpm update
```

## Recommended After-Edit Hooks

### After Editing .ets/.ts Files

Run hvigor build to check for ArkTS compilation errors. This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after any `.ets` or `.ts` file is edited, run `hvigorw assembleHap -p product=default 2>&1 | tail -20` asynchronously with a 60-second timeout, and surface the last 20 lines of output on failure.

### After Editing module.json5

Validate permission and ability declarations. This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after `module.json5` is edited, remind the agent to verify that permissions and abilities are declared correctly.

### After Editing oh-package.json5

Reinstall dependencies. This was a Cursor hook block; in Cursor, wire it as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after `oh-package.json5` is edited, run `ohpm install 2>&1 | tail -10` asynchronously with a 30-second timeout.

## Before-Write Reminders

### V1 Decorator Guard

Warn when code contains V1 state management decorators. This was a Cursor pre-write hook block; Cursor has no before-write hook, so it cannot warn before the write happens. Wire the equivalent as an `afterFileEdit` entry in `hooks/hooks.json`, following the existing dispatcher pattern in `hooks/after-file-edit.js`: after a `.ets` file is edited, remind the agent to use `@ComponentV2` / `@Local` / `@Param` — V1 decorators (`@State`, `@Prop`, `@Link`) are prohibited.

## Validation Checklist

After each implementation cycle, verify:

- [ ] `hvigorw assembleHap` completes without errors
- [ ] No V1 decorators in new or modified `.ets` files
- [ ] No `@ohos.router` imports in new or modified files
- [ ] All API permissions declared in `module.json5`
- [ ] All dependencies listed in `oh-package.json5`
- [ ] Resource strings added to all i18n directories
- [ ] Dark theme colors provided for new color resources
