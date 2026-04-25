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

- [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- [SECURITY.md](../../docs/architecture/SECURITY.md)

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

See [SECURITY.md](../../docs/architecture/SECURITY.md) for full threat model.

## Review Process

```bash
# 1. Run quality gates
pnpm lint && pnpm typecheck && pnpm test

# 2. Check coverage
pnpm test:coverage
```

## Verification Gate — MANDATORY for every finding

> A 2026-04-25 audit (#2225) found a 100% false-positive rate in
> second-pass code-review findings. Each false positive cost ~5min of
> triage. The fix is a stricter pre-file gate.

Before flagging any finding, run this checklist:

1. **Read the cited line + 5 lines before + 5 lines after.** Most false
   positives die here — "missing bounds check" turns out to be at the
   next line; "O(n²) loop" has a `.slice(0, 20)` cap on the line above.
2. **Trace the call path.** Is the flagged code reachable in practice?
   Or does upstream validation (e.g. `isValidCommand`, Zod schema)
   already filter the input?
3. **Name the observable failure.** What test would assert the bug?
   "Wrong return value", "leaked resource", "raised exception" — be
   concrete. If you can't, the finding is not load-bearing.
4. **Rule out JS non-issues:**
   - **No "race condition" without `await` between read and write** —
     JS is single-threaded; sync code is atomic at microtask level
   - Maps support set/delete during iteration per ECMA-262
   - `NaN` comparisons fail closed silently (no observable bad state)
   - `as Record<string, unknown>` is safe IF every access has `typeof`
     guards — read the whole function before flagging the cast

If any check raises "wait, actually..." → **drop the finding**. Don't
file, don't include in the report. False positives compound: pollute
the backlog, train future agents on noise, erode trust in tooling.

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

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for common issues and patterns.
