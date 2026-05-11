# Git & GitHub Rules

<!-- CANONICAL SOURCE: docs/development/CONTRIBUTION_GUIDE.md -->

Quick reference for git workflows. **Full documentation:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md)

## Commit Messages (Enforced)

Use conventional commits: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

**Enforcement:** commitlint runs on every commit (via `.husky/commit-msg` hook) and on every PR (via CI). Non-conforming commits are rejected.

**Examples:**

```
feat(routing): add adaptive timeout based on p95 latency
fix(consensus): prevent duplicate votes in rapid succession
test(opencode-parser): add branch coverage for error events
refactor(mcp): extract tool registration into standalone table
docs: update CLAUDE.md with new MCP tool reference
chore: upgrade vitest to v4
perf(topsis): cache normalized scores across routing calls
```

**Bad examples (will be rejected):**

```
Update routing           # missing type
feat: Foo bar            # sentence-case subject (rejected post-#2572)
feat: FOO BAR            # upper-case subject (rejected)
feature(routing): add x  # wrong type (feature → feat)
```

**Subject case allowance** (#2572): PascalCase / start-case is **allowed** in subjects so they can reference code symbols like `OutcomeStore`, `CompositeRouter`, `IModelAdapter`. Only sentence-case (`Foo bar`) and upper-case (`FOO BAR`) are rejected.

**Config:** `commitlint.config.ts` extends `@commitlint/config-conventional` with overrides documented inline.

## Branch Naming

- `feat/<issue>-description`
- `fix/<issue>-description`
- `refactor/description`
- `docs/description`

## Quick Commands

```bash
# Issues
gh issue create --title "..." --body "..." --label "enhancement"
gh issue list --state open

# PRs
gh pr create --title "..." --body "..." --base main
gh pr merge --squash --delete-branch
```

See [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md) for full workflow.
