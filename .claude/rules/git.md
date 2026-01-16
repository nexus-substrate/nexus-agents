# Git & GitHub Rules

<!-- CANONICAL SOURCE: docs/development/CONTRIBUTION_GUIDE.md -->

Quick reference for git workflows. **Full documentation:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md)

## Commit Messages

Use conventional commits: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

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
