---
name: bug-fix
description: |
  Fix a bug following project standards.
  Use when fixing defects, debugging issues, or resolving reported problems.
  Triggers on "fix bug", "debug", "fix issue", "resolve bug".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Bug Fix Skill

<!-- CANONICAL SOURCE: docs/development/CONTRIBUTION_GUIDE.md -->

**Full workflow:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md)

## Workflow

1. **Create/verify GitHub issue** with reproduction steps

   ```bash
   gh issue list --state open
   gh issue create --title "bug: [description]" --label "bug"
   ```

2. **Write failing test** that demonstrates the bug

   ```bash
   pnpm test -- --watch
   ```

3. **Implement fix** — minimal changes, don't refactor surrounding code

4. **Verify test passes**

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```

5. **Check for similar bugs elsewhere**

   ```bash
   # Search for similar patterns in codebase
   ```

6. **Create PR**

   ```bash
   git commit -m "fix(scope): description

   Closes #<issue>

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

   gh pr create --title "fix(scope): description" --base main
   ```

## Quality Checklist

- [ ] Failing test written before fix
- [ ] Fix is minimal (no unrelated changes)
- [ ] Similar patterns checked elsewhere
- [ ] `pnpm lint && pnpm typecheck && pnpm test` passes
- [ ] Issue referenced in commit
