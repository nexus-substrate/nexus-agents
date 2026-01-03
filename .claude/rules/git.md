---
paths: "*"
---

# Git & GitHub Rules

## Commit Messages

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

Examples:
- `feat(agents): add dynamic expert creation`
- `fix(mcp): prevent path traversal in read_files`
- `refactor(core): extract Result type to shared module`

## Branch Naming

- `feat/<issue>-description` - New features
- `fix/<issue>-description` - Bug fixes
- `refactor/description` - Refactoring
- `docs/description` - Documentation

## PR Requirements

- Reference issue number in description
- Include summary of changes
- Ensure all CI checks pass
- Request review before merge

## GitHub CLI Commands

```bash
# Issues
gh issue create --title "..." --body "..." --label "enhancement"
gh issue list --state open
gh issue view <number>

# PRs
gh pr create --title "..." --body "..." --base master
gh pr view <number>
gh pr merge --squash --delete-branch

# Checks
gh pr checks <number>
```
