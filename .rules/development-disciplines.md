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

## Related canonical sources

- `.rules/typescript.md` — Zero `any` policy, strict-mode enforcement.
- `.rules/testing.md` — test layout, integration test rules, vitest specifics.
- `.rules/governance.md` — fitness target, supermajority rules, refactor gates.
