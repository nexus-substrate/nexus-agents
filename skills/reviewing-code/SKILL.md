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

<!--
  CANONICAL SOURCES:
  - CODING_STANDARDS.md
  - docs/architecture/SECURITY.md
  - skills/references/security-checklist.md (OWASP Top 10, validation patterns)
  - skills/references/testing-patterns.md (test-quality assessment)
  - .claude/agents/code-reviewer.md (Staff-Engineer narrative-review persona)
-->

## Five-axis review framework

Evaluate every change across these dimensions. The order matters — correctness gates merge; the rest are quality.

1. **Correctness** — does the code do what the spec says? Are edge cases (null, empty, boundary, error paths) handled? Are the tests actually testing the behavior, not just the implementation?
2. **Readability** — would another engineer understand this without explanation? Names follow project conventions? Control flow straightforward?
3. **Architecture** — does it follow existing canonical patterns (`CLAUDE.md` "Canonical Paths") or introduce a new one? Module boundaries respected? No circular deps? Abstraction level appropriate?
4. **Security** — input validated at boundaries (per `.rules/untrusted-input.md`)? Secrets out of code/logs? Auth/authz where needed? Parameterized queries? See [security-checklist](../references/security-checklist.md).
5. **Performance** — N+1 patterns? Unbounded data fetching? Sync I/O in hot paths? Re-render storms? Missing pagination? Don't optimize without evidence — see `performance-optimization` skill.

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

## Anti-rationalization — Code review

| Excuse                                             | Counter                                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "It's a small change, no need for thorough review" | Small changes hide subtle bugs: off-by-one, missed null check, type narrowing slipped. Apply the 4-point gate to every finding regardless of diff size.                     |
| "Tests pass, so it's correct"                      | Tests verify what was tested. Edge cases the tests don't cover are still bugs. Use the five-axis framework — correctness ≠ "tests green."                                   |
| "I trust the author"                               | Trust is for the human relationship; the review is for the code. Apply the same gate to senior contributors as to first-timers.                                             |
| "The CI gates would catch any real issue"          | CI catches a known set of failure modes. Reviews catch the ones CI doesn't model — architecture drift, unclear naming, subtle security gaps, unintended public-API changes. |
| "I'd refactor this differently, but it works"      | If the existing pattern is canonical (per CLAUDE.md), don't fight it. If your way is genuinely better, file a follow-up — don't gate the merge.                             |
| "I'll flag it; the author can decide"              | Every flagged finding costs review-cycle time. Apply the 4-point gate first; only flag what passed all four.                                                                |

## Output categorization

Every finding gets one of three tags. The bar matters — over-flagging dilutes the signal.

- **Critical** — must fix before merge. Security vulnerability, data loss risk, broken functionality, public-API regression.
- **Important** — should fix before merge. Missing test, wrong abstraction, poor error handling, type-safety violation.
- **Suggestion** — consider for improvement. Naming, code style, optional optimization, alternative approach. Author may accept or defer.

If you tag everything Critical, nothing is Critical. Three or more Critical findings on a non-emergency PR usually means the PR is too big — split it.

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
