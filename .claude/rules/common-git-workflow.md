# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Commit messages carry no `Co-authored-by:` trailer for any AI tool (including Cursor) and name no AI tool as author or contributor. The commit author is the user. (NOCOAUTHOR_F27)

Note: this paragraph describes Cursor installs and does not apply to this Cursor plugin install — Cursor commit attribution follows the project's Cursor/git configuration.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see the development workflow rule.
