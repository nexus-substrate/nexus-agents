---
name: test-driven-development
description: |
  Write failing tests before implementation. The Red-Green-Refactor cycle is
  a core nexus-agents discipline (CLAUDE.md prime directive). Use when
  implementing new logic, fixing bugs (Prove-It Pattern), or modifying
  existing behavior. Triggers on "TDD", "write a test", "test-first",
  "red-green-refactor", "fixing a bug" (Prove-It).
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Test-Driven Development Skill

<!--
  CANONICAL SOURCES:
  - CLAUDE.md "Development Disciplines → Red/Green TDD" (non-negotiable)
  - .rules/typescript.md
  - docs/development/CONTRIBUTION_GUIDE.md
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

**Full workflow:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md). **Prime directive:** [CLAUDE.md → Development Disciplines](../../CLAUDE.md).

## When to apply

- Any new logic or behavior — write the test first
- Bug fixes — use the **Prove-It Pattern** (failing test demonstrates the bug, then fix)
- Modifications to existing functionality
- Edge cases and error paths
- Any change that risks regressing tested behavior

**Skip TDD for:**

- Configuration-only edits (pure values, no branching)
- Documentation changes
- Static asset moves with no behavioral impact

## The Red-Green-Refactor cycle

1. **RED** — write a test that fails because the functionality doesn't exist yet. Run it. Confirm the failure message points at the missing piece.
2. **GREEN** — implement the **minimum** code to make the test pass. Resist the urge to "round out" the API in the same step.
3. **REFACTOR** — improve names, structure, duplication while keeping the test green. Run the suite after every refactor step.

## The Prove-It Pattern (bug fixes)

When a bug is reported:

1. **Reproduce** the bug with a minimal failing test.
2. **Confirm the test fails** in `main` — this proves the bug exists and your test is correctly sensitive.
3. **Implement the fix** at the root cause (see `bug-fix` skill for triage layering).
4. **Confirm the test now passes.**
5. **Run the full suite** — `pnpm test` — to catch regressions the fix may have introduced elsewhere.

The test stays as a regression guard. Future refactors can't silently re-break this case.

## Test pyramid (target shape)

| Tier        | Share | Latency      | Scope                                   |
| ----------- | ----- | ------------ | --------------------------------------- |
| Unit        | ~80%  | milliseconds | single module, no I/O                   |
| Integration | ~15%  | seconds      | component interactions, may touch fs/db |
| E2E         | ~5%   | minutes      | critical user flows end-to-end          |

**The Beyoncé Rule:** "If you liked it, you should have put a test on it." Infrastructure changes don't catch behavioral bugs — your tests do.

## Test quality principles

| Principle                                        | What it means                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **State-based assertions**                       | Verify outcomes, not which methods were called. Refactoring-resistant.                                          |
| **DAMP over DRY**                                | Tests are self-contained specifications. Duplicating setup is acceptable; cleverness in shared fixtures is not. |
| **Real implementations** > fakes > stubs > mocks | Mock at the network/process boundary, not within your own modules.                                              |
| **Arrange-Act-Assert**                           | One scenario per test. Setup, action, assertion — clearly separated.                                            |
| **One assertion per concept**                    | A test verifies one behavior. Multiple `expect()` calls are fine if they describe the same behavior.            |
| **Names read like specifications**               | `it('returns 0 for an empty array')` — not `it('test1')`.                                                       |

## Anti-rationalization — TDD

| Excuse                                  | Counter                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "I'll write tests after"                | You won't. Post-hoc tests verify the implementation you happened to write, not the behavior you needed.               |
| "Too simple to test"                    | Simple code becomes complicated. The test documents the expected behavior so future-you can refactor with confidence. |
| "Tests slow me down"                    | Tests slow the first hour and accelerate every hour after. The break-even is usually within the same PR.              |
| "I tested manually in the browser/REPL" | Manual testing doesn't persist. The next change silently breaks it.                                                   |
| "Code is self-explanatory"              | Code says **how**, tests say **what** and **why-it-must**. Without the test, the spec is in your head only.           |
| "Just a prototype"                      | Prototypes become production. Prototype-without-tests becomes production-debt-with-bugs.                              |

## Red flags

- Production code committed without a corresponding test in the same diff
- Tests that pass on first run with no implementation change (likely not testing the requirement)
- Bug-fix PRs without a regression test that fails on `main` without the fix
- Test names that describe the implementation (`'calls saveToDatabase'`) instead of the behavior (`'persists user across reloads'`)
- `.skip()`, `.todo()`, or commented-out tests with no follow-up issue

## Verification checklist

- [ ] Every new behavior has at least one test covering it
- [ ] Bug fixes include a regression test that fails on `main` without the fix
- [ ] All tests pass: `pnpm test`
- [ ] Test names describe the behavior, not the implementation
- [ ] No `.skip` / `.todo` / disabled tests added in this PR (or each is linked to an issue)
- [ ] Coverage hasn't decreased: `pnpm coverage` (gate: 89.66% statements, 93.26% functions per CLAUDE.md)
- [ ] If the fix is complex enough to warrant E2E coverage, an integration or E2E test is added
