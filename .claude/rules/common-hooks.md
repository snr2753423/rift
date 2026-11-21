# Hooks System

## Hook Types

- **beforeShellExecution / beforeReadFile / beforeMCPExecution**: Before a command runs, a file is read, or an MCP tool runs (validation, parameter modification)
- **afterFileEdit / afterShellExecution / afterMCPExecution**: After a file is edited, a command runs, or an MCP tool runs (auto-format, checks)
- **sessionEnd / stop**: When a session ends (session-end checks: evaluate session, cost, typecheck, console log — no audit skill)

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag

## Progress Tracking

Track multi-step progress in the run's stage-ledger file (see the orchestrate skill) or the chat's task list to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
