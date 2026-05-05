---
name: code-simplification
description: |
  Reduce nesting, extract names, eliminate redundancy without changing
  behavior. Apply after features work and tests pass — never as a
  drive-by during feature work. Triggers on "simplify", "refactor for
  clarity", "this is hard to read", "code review flagged complexity".
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Code Simplification Skill

<!--
  CANONICAL SOURCES:
  - CLAUDE.md "Prime Directive: correctness > simplicity > performance > cleverness"
  - CLAUDE.md "Anti-Sprawl Policy"
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## When to trigger

**Apply when:**

- Features work and tests pass — simplification is a separate phase
- Code review flagged readability (deep nesting, long functions, unclear names)
- You're touching the area for an unrelated reason and the existing code obstructs understanding
- A new contributor (human or agent) was confused by the same code twice

**Skip when:**

- The code is already clean or follows the canonical pattern
- You don't fully understand what the code does (Chesterton's Fence — see below)
- Performance is critical and the "simplification" would change hot-path semantics
- Tests don't exist yet — write them first (`test-driven-development` skill)

## The five principles

1. **Preserve behavior exactly.** Ask: "Does this produce the same output for every input — including the inputs the original author was paranoid about?"
2. **Follow project conventions.** Match the existing codebase, not your external preferences. The `.rules/` directory and CLAUDE.md describe what's canonical here.
3. **Prefer clarity over cleverness.** Explicit beats compact when the reader has to "decompile" the line in their head.
4. **Maintain balance.** Don't over-inline (one giant function), don't over-extract (10 micro-helpers each used once).
5. **Scope to what changed.** Drive-by refactors in unrelated files inflate diffs and hide regressions. Open a follow-up PR.

## Chesterton's Fence

> "Don't remove a fence in the middle of a field until you understand why it was put there."

Before deleting code, comment, or guard clause:

1. **Search for the issue or commit** that added it (`git log -S "term" --all`, `git blame`).
2. **Understand the original intent.** A weird-looking check often guards against a real production bug from years ago.
3. If the original reason no longer applies, **document the reasoning** in the simplification commit. If you can't determine the reason, **leave it alone** — the cost of the fence is one read, the cost of a regression is much higher.

## The process

1. **Understand before touching** — apply Chesterton's Fence above.
2. **Identify opportunities**
   - Deep nesting (>3 levels) — extract guard clauses, early returns, helper functions
   - Long functions (>50 lines per `.rules/typescript.md`) — split by concern
   - Generic names (`data`, `tmp`, `result`) — rename to describe role in this scope
   - Duplicated logic in 3+ places — extract (2 instances is coincidence, per CLAUDE.md DRY rule)
   - Redundant abstractions (one-liner wrappers, single-implementation interfaces)
3. **Apply changes incrementally.** One simplification → run tests → commit. Never batch multiple simplifications without tests between.
4. **Keep refactoring separate from feature work.** Different commits, ideally different PRs.
5. **Verify the result is genuinely easier to understand.** Read it cold. If you still need to think, the simplification didn't land.

## Anti-rationalization — Simplification

| Excuse                                         | Counter                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "It's working — leave it"                      | Working ≠ maintainable. Today's working-but-confusing code is tomorrow's bug-fix nightmare.                                                    |
| "Fewer lines = simpler"                        | Line count is a proxy, not a goal. A 5-line clever expression is often less readable than 12 obvious lines.                                    |
| "I'll refactor while I add features"           | This is how regressions arrive. Mixing refactor + feature changes makes the diff impossible to review and the regression impossible to bisect. |
| "Types are self-documenting"                   | Types describe shape, not intent. `function process(x: User): Result` says nothing about what `process` does.                                  |
| "Just one tiny drive-by cleanup"               | Drive-by edits in unrelated files inflate the diff and hide regressions in unrelated systems. Open a follow-up PR.                             |
| "I don't need to understand it to refactor it" | Yes you do. See Chesterton's Fence.                                                                                                            |

## Red flags

- Tests had to be modified to pass — you changed behavior, not just shape
- "Simplified" code is longer or harder to follow than the original
- You removed error handling because it "looked redundant"
- You're refactoring code you can't fully explain
- Multiple simplifications batched into one commit without tests between them
- The diff touches files unrelated to the original task

## Verification checklist

- [ ] All tests pass **unmodified**: `pnpm lint && pnpm typecheck && pnpm test`
- [ ] No errors swallowed, no `try/catch` removed unless replaced with explicit non-erroring path
- [ ] Each simplification is a separate commit with the test run in between
- [ ] Diff scope matches the original task — no unrelated drive-bys
- [ ] Names follow project conventions; no `data`/`tmp`/`result` introduced
- [ ] Function size, file size, and complexity ESLint gates still pass (max-lines-per-function: 50, max-lines: 400, complexity: 10)
- [ ] Read the result cold. If still confusing, the simplification didn't land — revert and try again.
