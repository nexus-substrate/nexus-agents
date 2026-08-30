---
'nexus-agents': minor
---

fix(routing): QualityConstraintStage cost ceiling no longer fails open (#5186)

The stage derived its rate from `costPerMillionInput / 1000` and applied it to a
total token count, then compared the result to `maxCostUsd`. Output tokens bill
at 5-6x input across all four CLIs, so the estimate ran that far under the worst
case — and because the check is `estimate > max → reject`, understating means the
ceiling **admitted** candidates it was configured to reject.

The profile now carries both rates. When a caller supplies
`expectedInputTokens` and `expectedOutputTokens` the ceiling is priced exactly;
when it supplies only a total there is no honest single rate, so the whole total
is charged at the OUTPUT rate. Over-rejecting a cheap candidate costs a routing
option; under-rejecting an expensive one costs money — the same asymmetry #4196
already encodes elsewhere.

Found by the concern-registry ratchet (#5123) on its first run, not by the #5122
audit that inventoried eleven cost paths. The stage is opt-in
(`qualityConstraint` defaults to `false`), so the blast radius is operators who
enabled it.

One existing test encoded the defect — it asserted "only gemini ($0.003) passes",
a figure computed from the input-only rate. Updated to the conservative bound,
with the fail-open case pinned as its own regression test.

Minor rather than patch: `QualityConstraintConfig` gains two additive optional
fields (`expectedInputTokens`, `expectedOutputTokens`). The api-surface gate
flagged them and its own guidance classes additive optional fields as minor —
worth following even though the substance is a bug fix.

Concern-registry alternates: 3 → 2.
