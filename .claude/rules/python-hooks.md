---
paths:
  - "**/*.py"
  - "**/*.pyi"
---

# Python Hooks

> This file extends the common hooks rule with Python specific content.

## After-Edit Hooks

Configure as an `afterFileEdit` hook in the plugin's `hooks/hooks.json`:

- **black/ruff**: Auto-format `.py` files after edit
- **mypy/pyright**: Run type checking after editing `.py` files

## Warnings

- Warn about `print()` statements in edited files (use `logging` module instead)
