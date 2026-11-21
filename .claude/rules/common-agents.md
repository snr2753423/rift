# Agent Orchestration

## Available Agents

Located in the plugin's `agents/` directory (installed as Cursor agents):

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| architect (`agents/ecc-architect.md`) | Implementation planning + system design | Complex features, refactoring, architectural decisions |
| tdd-guide (`agents/ecc-tdd-guide.md`) | Test-driven development | New features, bug fixes |
| code-reviewer (`agents/ecc-code-reviewer.md`) | Code review | After writing code |
| security-reviewer (`agents/ecc-security-reviewer.md`) | Security analysis | Before commits |
| build-error-resolver (`agents/ecc-build-error-resolver.md`) | Fix build errors | When build fails |
| e2e-runner (`agents/ecc-e2e-runner.md`) | E2E testing | Critical user flows |
| refactor-cleaner (`agents/ecc-refactor-cleaner.md`) | Dead code cleanup | Code maintenance |
| doc-updater (`agents/ecc-doc-updater.md`) | Documentation | Updating docs |

## Immediate Agent Usage

No user prompt needed — subject to the orchestrate skill's routing rule, which governs this list too:

Implementation-agent dispatch follows the factory routing in orchestrate's GLOBAL-ROUTING block (fix #29, GLOBAL-ROUTING_F29): every implementation dispatch carries a director brief, no-guessing applies, and the orchestrator verifies the output against the brief's acceptance criteria before use. Fan-out is bounded by efficiency: N>3 justified in one line; drones carry minimal context.
1. Complex feature requests — Use **architect** agent (`agents/ecc-architect.md`), but only when the work spans several pieces at once or the user asks to delegate; otherwise do the work directly in the main context
2. Code just written/modified - Use **code-reviewer** agent (`agents/ecc-code-reviewer.md`)
3. Bug fix or new feature - Use **tdd-guide** agent (`agents/ecc-tdd-guide.md`)
4. Architectural decision — Use **architect** agent (`agents/ecc-architect.md`), but only when the work spans several pieces at once or the user asks to delegate; otherwise do the work directly in the main context

## If a named agent does not resolve (fix #24)

Cursor may resolve agents by frontmatter `name:` or by filename — the plugin cites both forms at every invocation (`` `X` agent (`agents/ecc-X.md`) ``) so either resolution works. If a named agent still cannot be resolved (Cursor reports it cannot find `X`), spawn a general subagent on `haiku` (or `inherit` — the model selected in this chat — for the chat-model agents: `architect`, `healthcare-reviewer`, `spec-miner`, `deep-reasoner`) with the agent file's instructions inlined, and record the miss in the run ledger.

## Parallel Task Execution

Use parallel subagent execution for independent read-only operations only; never parallelize concurrent file edits (serialize them), never delegate the orchestration itself, and never spawn a subagent for trivial single-step work — see the orchestrate skill's routing rule, which governs here and in the Immediate Agent Usage list above.

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
