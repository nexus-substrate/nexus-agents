---
paths: ['**/*']
description: Red/Green TDD, YAGNI, DRY — non-negotiable disciplines for any code change
---

# Development Disciplines — TDD, YAGNI, DRY

<!-- CANONICAL SOURCE: this file. CLAUDE.md links here. -->

Auto-loaded. These three principles are **non-negotiable** across all building, reviewing, and architecture work in nexus-agents.

## Red/Green TDD

Write a failing test first (red), then write the minimum code to make it pass (green), then refactor. Never write production code without a corresponding test. Tests define the spec; code satisfies it.

**Why:** without a failing test up front, "done" has no reference frame — and post-hoc tests tend to assert what the code already does rather than what it's supposed to do.

**How to apply:** when adding a new feature or fixing a bug, the first commit (or first hunk) on the feature branch should be a test that fails for the right reason. The second commit makes it pass. Refactor after green.

**Skill:** `test-driven-development` covers the workflow in detail.

## YAGNI — You Aren't Gonna Need It

Do not build for hypothetical future requirements. Implement only what is needed right now. Speculative abstractions, unused parameters, and "just in case" code are banned. If a requirement emerges later, add it then.

**Why:** every speculative abstraction is maintenance debt that hasn't been amortized by a real use case. Most "we'll need this someday" features never get used, but their tests, type signatures, and code paths still need to be maintained.

**How to apply:** if a parameter, method, or class has zero current callers, don't add it. If a feature flag has only one branch ever exercised, collapse it. If "we might want this" surfaces during review, file an issue rather than adding the code.

**Reuse ladder (apply BEFORE writing, not just at review):** stop at the first rung that holds — (1) does this need to exist at all? → skip it; (2) standard library / language built-in? → use it; (3) native platform feature or an existing nexus-agents substrate primitive (canonical-path module, existing voter/pipeline/store)? → use it; (4) already-installed dependency? → use it; (5) one line? → one line; (6) only then, the minimum that works. Lazy, not negligent: trust-boundary validation, error handling, security, and accessibility are **never** the thing cut. This is the same ladder the `scope_steward` voter enforces at vote time (`cli/voter-prompts.ts`).

## DRY — Don't Repeat Yourself

Every piece of knowledge must have a single, unambiguous, authoritative representation. When you see the same logic in two places, extract it. **But do not DRY prematurely — two instances is a coincidence, three is a pattern worth extracting.**

**Why:** premature extraction is one of the most expensive forms of rework. The wrong abstraction is harder to dislodge than three copies of the same code, because it has consumers depending on its shape.

**How to apply:** wait for the third occurrence before extracting. When you extract, make sure the abstraction names the _concept_, not the _implementation_. If the extraction would force consumers to pass flags to opt out of behavior they don't want, the abstraction is wrong — keep the duplicates.

## Name the empty case

When a check aggregates a verdict over a collection, state what an empty collection means. Never let a language default answer it.

`[].every(p)` is `true`. `![].some(p)` is `true`. A `for` loop with an early failure return never runs its body on an empty collection, so it falls through to the pass. `errors.length === 0` holds when the producing loop iterated nothing. `Math.min(...[])` is `Infinity`. And `0 === 0`. Every one of these renders **absence as health**.

**Why:** a gate that reports success because it had nothing to check is worse than no gate. It launders unreviewed work as reviewed, and it is exactly the artifact a later human spot-check trusts. This is the concrete form of the Mission's rule that a check which cannot fail by construction is not a check — see `.rules/governance.md` and the fidelity-defect bar in CLAUDE.md.

**How to apply:**

- Reach for `allOf` / `anyOf` / `verdictOver` in `packages/nexus-agents/src/utils/verdict-aggregation.ts`. Their `whenEmpty` argument is required, so the empty case cannot be left implicit. Where the helper does not fit, an explicit `if (nothingWasMeasured) return <honest value>` is equally good — the requirement is that the empty case is **named**, not that a particular helper is used.
- Ask what an empty collection is evidence _of_. Usually nothing, in which case the honest answer is the non-committal verdict (`pending`, `unmeasured`, `skip`), not the optimistic one. Reserve the optimistic value for cases where vacuous truth is genuinely the contract, and say so at the call site.
- **Absence of criteria is not absence of evidence.** A score over zero declared constraints may legitimately be a perfect score; a score over zero _measured_ constraints never is. Distinguish the two before changing anything.
- **Every fix in this class needs an empty-input test**, and it is the test — not the type system and not the lint rule — that actually catches the class.

**Three failure modes specific to fixing this class**, all observed while closing #4585:

1. **A guard that cannot fire.** Before adding an empty-case branch, trace whether the caller can produce the empty input. An unreachable guard plus tests that exercise shapes production cannot produce is dead code reported as a fix.
2. **A control test that certifies without measuring.** The test proving a fix does not over-fire must assert on input the check genuinely _evaluates_. A positive control whose subject is skipped certifies "measured" on zero measurements — the defect, reproduced inside its own regression test.
3. **An assertion that pins the half-fixed number.** If a fix names one check and leaves its neighbours vacuous, do not write the test against the resulting score. That encodes the survivors as correct.

Assume existing tests may **assert** the defect. Three did in the `.every()` sweep, including one expecting `success: true` for a release that announced zero channels. Repoint the assertion, never delete it, and leave a comment recording what it previously pinned.

**Enforcement:** `nexus/no-vacuous-verdict` (`eslint-rules/no-vacuous-verdict.js`) flags the syntactic shape when the value lands in a verdict-shaped name. It is a floor, not a proof — measured recall was 7 of 10 on the known corpus, and it cannot see reachability or applicability at all. The empty-input test and an adversarial review pass are what cover the rest.

## Related canonical sources

- `.rules/typescript.md` — Zero `any` policy, strict-mode enforcement.
- `.rules/testing.md` — test layout, integration test rules, vitest specifics.
- `.rules/governance.md` — fitness target, supermajority rules, refactor gates.
- `packages/nexus-agents/src/utils/verdict-aggregation.ts` — the empty-verdict helpers and how to choose `whenEmpty`.
