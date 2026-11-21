# Performance Optimization

## Model Selection Strategy

**haiku** (cheapest; scout/recon and lightweight work)

**haiku** (standard agentic work; fast-worker)

**the model selected in this chat** (deepest reasoning; deep-reasoner)

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Extended Thinking

Reasoning depth is controlled by the agent model inheritance in agents/ (notably `inherit` for deep-reasoner — it runs on the model selected in this chat). Do not use effort controls — Grok takes per-vendor `reasoning_effort`, which Cursor does not expose in a pin.

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
