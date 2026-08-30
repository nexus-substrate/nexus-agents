---
'nexus-agents': patch
---

refactor(cost): give the cost core a blended component and move path 11 onto it (#5122)

Increment 5. `testing/e2e/accuracy-eval` computed `(totalTokens / 1000) * 0.003`
inline, with no model in scope and no test covering the rate.

Rather than fold that total into the core's `input` field — arithmetically
identical and semantically false, since a reader could no longer tell a real
input-only call from a blended guess — the core gains an explicit `blended`
component with its own rate. Two in-tree paths genuinely have no split to offer,
so the shape is real and now has a name.

`blended` is lower fidelity by construction and the type says so: a caller
holding an input/output split must not use it. That is the defect #5180 tracks,
where a split is available and discarded.

The rate becomes a named `NOMINAL_BLENDED_RATE_PER_1M` constant, documented as a
rough order-of-magnitude figure for comparing runs rather than money — this
evaluator has no model, so there is no vendor rate to resolve.

Remaining forks: 5.
