---
name: bug-fix
description: |
  Fix a bug following project standards.
  Use when fixing defects, debugging issues, or resolving reported problems.
  Triggers on "fix bug", "debug", "fix issue", "resolve bug".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Bug Fix Skill

<!--
  CANONICAL SOURCES:
  - docs/development/CONTRIBUTION_GUIDE.md
  - skills/test-driven-development (Prove-It Pattern for the failing-test step)
  - skills/references/testing-patterns.md (pyramid, AAA, naming)
-->

**Full workflow:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md)

## Stop-the-Line Protocol

When a test, build, or lint fails mid-flow — **before** making any more changes:

1. **STOP** — do not edit, do not retry, do not "just try one more thing"
2. **PRESERVE** — capture the raw error, stack trace, last passing commit, and repro command. Paste into the PR description if relevant
3. **DIAGNOSE** — run the Triage Sequence below; identify the _causal_ layer, not the first surface that surfaced the error
4. **FIX** — change the _root cause only_. No speculative refactors, no drive-by cleanups
5. **GUARD** — add a regression test that would have caught the original failure
6. **RESUME** — re-run the full check suite; only then continue the original task

Rationale: failures compound. A bug unresolved at step N makes every change N+1…N+k incorrect. We observed this in #1871 (consensus_vote silent hang) — the symptoms looked like adapter timeouts, the cause was missing overall-deadline race.

## Triage Sequence

Run this order **before** "Implement fix." Skipping steps produces symptom-level patches that regress.

1. **Reproduce** reliably. If non-reproducible: log timestamps, add artificial delays to widen race windows, diff CI vs local env. Document the conditions.
2. **Localize** to a layer: UI / service / data / build / external dep. Resist "it must be X" — verify with a log, not a hunch.
3. **Reduce** to the minimal failing case. Smaller repros make the cause obvious; large repros hide it.
4. **Fix** the root cause. If your fix is _upstream_ of where the error surfaced, you're probably right. If it's _downstream_ (dedupe in the view, catch in the caller), you're probably patching the symptom.
5. **Guard** with a regression test that fails without the fix.
6. **Verify** end-to-end: `pnpm lint && pnpm typecheck && pnpm test` plus any integration/smoke test for the affected area.

## Anti-Rationalization — Debugging

Debugging tempts four recurring shortcuts. Each is a trap.

| Excuse                           | Counter                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I know what the bug is"         | Unverified guesses resolve only ~70% of the time. Reproduce first — the cost of confirming is minutes; the cost of a wrong fix is hours plus a regression. |
| "The failing test must be wrong" | Sometimes true, but verify against the spec _before_ changing the test. A test asserting correct-but-inconvenient behavior gets "fixed" to assert the bug. |
| "It works on my machine"         | Environment is a variable. Diff Node version, env vars, lockfile drift, CI container, clock/timezone, file system case sensitivity.                        |
| "This is flaky, ignore it"       | Flaky = the test is exposing a real race/ordering/timing bug. Fix the intermittency or understand why it happens. `.skip` with a TODO is a ticking debt.   |

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

- [ ] Reproduced reliably (or non-reproducibility documented)
- [ ] Localized to the causal layer (not the surfacing layer)
- [ ] Failing test written before fix
- [ ] Fix is at the root cause, not the symptom
- [ ] Fix is minimal (no unrelated refactors)
- [ ] Similar patterns checked elsewhere
- [ ] Regression test would have caught the original bug
- [ ] `pnpm lint && pnpm typecheck && pnpm test` passes
- [ ] Issue referenced in commit

## Red flags (in addition to the Stop-the-Line protocol)

- Bug fix without a regression test (the test stays as the future guard)
- Symptom-level patch (caller-side dedupe, view-side filter) when the root cause is upstream
- Fix that "just retries" without addressing why the failure happened
- Multiple unrelated changes in the same PR (drive-by refactors)
- Issue closed before the regression test fails on `main` without the fix
