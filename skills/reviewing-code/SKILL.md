---
name: reviewing-code
description: |
  Review code changes following project standards and security guidelines.
  Checks for lint compliance, type safety, test coverage, and security issues.
  Use when reviewing PRs, auditing code, or checking implementation quality.
  Triggers on "review code", "code review", "check this", "audit", "PR review".
allowed-tools: Read, Grep, Glob, Bash, LSP
---

# Code Review Skill

<!-- CANONICAL SOURCES:
  - CODING_STANDARDS.md
  - docs/architecture/SECURITY.md
-->

**Full documentation:**

- [CODING_STANDARDS.md](../../../CODING_STANDARDS.md)
- [SECURITY.md](../../../docs/architecture/SECURITY.md)

## Review Checklist

### Structural (Section 3)

| Criterion | Limit       |
| --------- | ----------- |
| File      | ≤ 400 lines |
| Function  | ≤ 50 lines  |
| Nesting   | ≤ 4 levels  |

### Type Safety (Section 4)

- [ ] No `any` types
- [ ] `Result<T, E>` for fallible ops
- [ ] Zod at boundaries

### Security (Section 7)

- [ ] No secrets in code/logs
- [ ] Path traversal prevention
- [ ] No user-provided RegExp

See [SECURITY.md](../../../docs/architecture/SECURITY.md) for full threat model.

## Review Process

```bash
# 1. Run quality gates
pnpm lint && pnpm typecheck && pnpm test

# 2. Check coverage
pnpm test:coverage
```

## Review Output

```markdown
## Code Review: [File/PR]

### Critical (Must Fix)

- [ ] Issue at `file:line`

### Major (Should Fix)

- [ ] Issue

### Recommendation

[ ] APPROVE / [ ] REQUEST_CHANGES
```

See [CODING_STANDARDS.md](../../../CODING_STANDARDS.md) for common issues and patterns.
