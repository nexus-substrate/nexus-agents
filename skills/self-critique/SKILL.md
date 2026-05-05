---
name: self-critique
description: |
  Score your own output 0-10 across 5 task-appropriate dimensions before
  emitting it. Anything below band 3 (5-6 Functional) is a regression —
  fix and rescore. Use as a pre-emit gate when work is complex enough
  that grade-inflation is a real risk. Triggers on "self-critique",
  "score my output", "pre-emit review", "grade my work",
  "five-dimension critique".
allowed-tools: Read, Grep, Glob
---

# Self-Critique Skill

<!--
  CANONICAL SOURCES:
  - skills/reviewing-code (the external counterpart — reviews others' work)
  - skills/references/testing-patterns.md (for code-quality dimension definitions)
  Adapted from nexu-io/open-design (Apache-2.0, © 2025 nexu-io contributors).
  Original critique skill: https://github.com/nexu-io/open-design/blob/main/skills/critique/SKILL.md
-->

## What this skill is for

This is the **pre-emit gate**. Before you hand work back to the user — code, design, docs, a spec, a PR description — silently score it 0-10 across 5 task-appropriate dimensions. If the worst sustained band is below 3, the work is a regression: fix the lowest dimension, rescore, repeat.

This is **distinct from `reviewing-code`**:

| Skill            | Reviews                       | When                           |
| ---------------- | ----------------------------- | ------------------------------ |
| `reviewing-code` | _Others'_ code (PRs, commits) | After someone else writes code |
| `self-critique`  | _Your own_ output             | Before you emit anything       |

`reviewing-code` is the external gate. `self-critique` is the internal gate that runs first. Both can apply to the same artifact at different lifecycle points.

## When to apply

- Output is complex enough that "looks fine to me" isn't enough (architectural decisions, large refactors, security-touching code, public-facing docs)
- You generated something that will be hard to revise after the user reads it (a PR description, an ADR, a release announcement)
- You're tempted to ship faster than you're checking (the LLM-default failure mode)

**Skip when:**

- Trivial single-line fixes
- Mechanical tasks (dep bump, rename across files)
- The work has already been reviewed by `consensus_vote` or a human

## Scoring bands (universal)

Every dimension uses the same 0-10 scale with these bands. Memorize them.

| Score | Band            | Meaning                                                                                       |
| ----- | --------------- | --------------------------------------------------------------------------------------------- |
| 0-4   | **Broken**      | Doesn't satisfy the dimension. Visible problems a reader will notice. Fix before emit.        |
| 5-6   | **Functional**  | Satisfies the dimension at a baseline. No obvious failures, but unremarkable.                 |
| 7-8   | **Strong**      | Above baseline. An expert reader would find 1-2 minor issues.                                 |
| 9-10  | **Exceptional** | The work makes the case better than the spec required. Rare; don't grade-inflate to get here. |

## The 5 dimensions, per task type

Pick the dimension table that matches your task. Each table has 5 dimensions. Score each independently — **do not average**. The score is the **worst sustained band** across recent work in that dimension, not an arithmetic mean.

### Code (when shipping production code)

| Dimension        | Question                                                                              | What to look for                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Correctness**  | Does it actually do what the spec says, including edge cases?                         | Null/empty/boundary inputs, error paths, off-by-one, race conditions if `await` is between read and write.    |
| **Readability**  | Could another engineer maintain this without explanation?                             | Names match domain. Control flow obvious. No deeply nested logic. Comments explain _why_, not _what_.         |
| **Architecture** | Does it follow existing canonical patterns or introduce a new one with justification? | Module boundaries respected. No circular deps. Abstraction level appropriate. Canonical paths from CLAUDE.md. |
| **Security**     | Are inputs validated at boundaries? Are secrets out of code/logs?                     | Per `.rules/untrusted-input.md` Tier 1-4. Zod at MCP/HTTP boundaries. No `eval`/`innerHTML`.                  |
| **Performance**  | Are obvious anti-patterns absent?                                                     | N+1 queries, unbounded data, sync I/O in hot paths. Don't optimize without profiling.                         |

### Design (UI/UX/visual artifacts)

Per Open Design's original 5 dimensions:

| Dimension                  | Question                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| **Philosophy consistency** | Does the artifact pick one direction and stick to it through every micro-decision?           |
| **Visual hierarchy**       | Can a stranger figure out what to read first, second, third without being told?              |
| **Detail execution**       | Alignment, leading, kerning, image framing, edge-case spacing — the 90/10 stuff.             |
| **Functionality**          | Does it work for its intended use? Click targets, nav, readability at presentation distance. |
| **Innovation**             | One unexpected move that makes a viewer lean in — or generic AI-slop median?                 |

### Documentation

| Dimension           | Question                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Accuracy**        | Does the doc match current code? Run `grep` against the symbols it cites.                                    |
| **Discoverability** | Will a reader looking for this find it? Is it indexed in `docs/README.md`? Are search terms in the headings? |
| **Density**         | Is each paragraph load-bearing, or is it padding? Could you delete 30% without losing meaning?               |
| **Examples**        | Is there at least one runnable example for the canonical use case? Does the example actually run?            |
| **Tone**            | Direct, technical, no marketing fluff (per CLAUDE.md "Documentation Style").                                 |

### Spec / PR description / ADR

| Dimension           | Question                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Completeness**    | Are all required sections present? (Context, decision, alternatives, consequences for ADR)         |
| **Testability**     | Can the acceptance criterion be expressed as a test that passes/fails? "Works" is unfalsifiable.   |
| **Reversibility**   | Is the cost of unwinding this documented? Helps choose the right semver bump and review threshold. |
| **Stakeholder fit** | Does the proposal address the actual user problem, not a different problem the author preferred?   |
| **Scope**           | Is the "Not Doing" list explicit? Is the diff bounded by the stated scope?                         |

### Default (anything else)

| Dimension       | Question                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| **Soundness**   | Does the work do what the brief asked? No subtle scope shift?             |
| **Clarity**     | Could a fresh reader understand the purpose in 30 seconds?                |
| **Coverage**    | Are obvious edge cases handled or explicitly out-of-scope?                |
| **Specificity** | Is the work concrete, with names/numbers/citations? Or generic and vague? |
| **Restraint**   | Did you build what was asked, not what was tempting?                      |

## Scoring discipline

Read these every time. They are the difference between a critique that catches problems and grade-inflation theater.

1. **Always cite evidence.** Bad: "scored 5 because feels inconsistent." Good: "scored 5 because hero page mixes Playfair display with Inter sans on the same line." Numbers without evidence get rejected.

2. **Don't average up.** If Hierarchy is 5 because page 3 is broken, don't bump to 7 because pages 1 and 2 are fine. The score is the **worst sustained band**.

3. **Don't grade-inflate.** A 7 means _strong_, not _acceptable_. If every score is 7+, you're not critiquing — you're rubber-stamping. Aim for honest distribution: most production work scores 5-7 across most dimensions. A 9 should make you suspicious of yourself.

4. **Innovation/Restraint allowed to be low.** 5/10 on Innovation is fine for production deliverables that don't need to be novel. Don't punish _appropriate_ conservatism.

5. **One dimension can fail without the others.** A doc can be 9/10 on Accuracy and 4/10 on Discoverability — say so plainly. Don't average away interesting failures.

## The pre-emit cycle

```text
Generate output → Score 5 dims → Worst < 3 band? → Yes → Fix lowest → Rescore
                                                  → No  → Emit
```

Concretely:

1. **Pick the dimension table** matching your task type.
2. **Score each dimension** with a 30-80 word evidence paragraph naming specific elements (line numbers, file paths, class names, paragraph excerpts).
3. **Identify the lowest score.** If it's < 3 (Broken band), the work is a regression. Don't emit.
4. **Fix the lowest dimension.** Don't try to lift all five — focus on the worst.
5. **Rescore that dimension.** If now ≥ band 3, proceed to step 6. Otherwise loop.
6. **Optional**: emit the critique alongside the work for transparency. Format below.

## How to invoke

Three invocation paths:

- **Manual** — user says "self-critique this", "score my output", "5-dim review on what you just produced". Run the cycle.
- **Auto-load via skill keyword** — when triggers fire (per frontmatter), this skill is available; agent decides to use it.
- **Inline as subagent** — for high-stakes outputs, the parent agent dispatches a subagent with this skill loaded to score the output independently. Useful when the parent might grade-inflate its own work.

This skill does **not** auto-fire on every output — that would be context-budget waste on trivial tasks. It fires when the work warrants it.

## Output format (when emitting the critique)

```markdown
## Self-Critique

| Dimension    | Score | Band       | Evidence                                                                                                                  |
| ------------ | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Correctness  | 7/10  | Strong     | The off-by-one in line 42 was caught by the test added in line 87; remaining edge cases (empty array, null user) covered. |
| Readability  | 6/10  | Functional | Function names are clear, but `process()` at line 23 should be `validateAndPersist()`.                                    |
| Architecture | 5/10  | Functional | Direct adapter call bypasses `UnifiedAdapterRegistry` per CLAUDE.md canonical paths — flagged for follow-up.              |
| Security     | 8/10  | Strong     | Zod at boundary, no secrets in logs, parameterized queries.                                                               |
| Performance  | 7/10  | Strong     | No N+1 patterns; one `readFileSync` in cold-start path is acceptable.                                                     |

**Worst band**: 5/10 (Architecture). Above the 3 threshold; safe to emit. Follow-up issue filed for the canonical-path violation.
```

## Anti-rationalization — Self-critique

| Excuse                                                 | Counter                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The work is fine, I don't need to score it"           | The skill exists because LLMs grade-inflate. The score forces evidence; the evidence is what catches the problem.                                  |
| "I'll score it 7s across the board"                    | If every score is 7+, you're rubber-stamping. Honest distributions are mostly 5-7 with one or two 6s and one or two 8s.                            |
| "The user will tell me if it's wrong"                  | The user reads what you emit. Costly fixes happen post-emit. The cycle is cheap (~30 seconds); the post-emit fix is expensive (a turn at minimum). |
| "I averaged the scores so it's fine"                   | The worst band is the score. Page 3 broken pulls the whole work down regardless of how good pages 1-2 are.                                         |
| "Innovation should be 9 because I tried something new" | Innovation is the riskiest dimension to inflate. Did the new thing serve the brief, or was it grafted on?                                          |
| "I'll skip the evidence — I know what I mean"          | Evidence is what makes the critique falsifiable. Without it, the next reviewer has no way to verify or extend.                                     |

## Red flags

- All five scores are 7-8 (no honest distribution)
- Evidence paragraphs cite no specific elements
- Score went up after a "fix" with no concrete change in the work
- The lowest dimension is rationalized rather than fixed ("Innovation is supposed to be low here")
- Self-critique used to justify shipping known issues ("scored 4 on Security but it's just a prototype")
- Work emitted with self-critique skipped on a high-stakes output

## Verification checklist

- [ ] Dimension table matches the task type (code / design / docs / spec / default)
- [ ] Each of 5 dimensions has a score AND an evidence paragraph (30-80 words)
- [ ] Worst sustained band is ≥ 3 (Functional)
- [ ] If a dimension was fixed, the rescore reflects a real change in the work
- [ ] If output is emitted with self-critique inline, the table is included in the response
- [ ] No grade-inflation — at least one dimension < 8 unless the work is genuinely exceptional
