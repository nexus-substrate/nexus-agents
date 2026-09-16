---
'nexus-agents': minor
---

`consensus_vote` now records the undeclared-options detector's verdict on every vote (#5422). The warning that fires when a proposal names alternatives in prose without declared `options` (#5360) could not have its precision measured over the vote ledger, which stores a 503-char proposal preview, so the verdict is recorded live at the tool boundary instead: the decision-cost record (`<dataDir>/learning/decision-costs.jsonl`) carries an optional `undeclaredOptionsDetector` field with `fired`, the matching `pattern`, a `excerpt` of at most 120 characters from the full proposal, and `declaredOptionCount`. Not-fired votes are recorded too; they are the denominator. Rows written by `pr_review` or before this release have no field, which is distinct from not-fired.

New pure `detectUndeclaredOptions(proposal, declaredOptions)` returns that verdict; the existing `checkUndeclaredOptions` warning now derives from it, so the two cannot disagree. `UNDECLARED_OPTION_PATTERNS` is exported unchanged and a test pins that no pattern nests a quantifier. The `#4362` mention that the issue hand-labelled as a false positive still fires and is pinned as such, so the measurement counts it rather than a pattern change hiding it.

`scripts/undeclared-options-precision.ts` (manual-only) lists the fired rows for hand-labelling, prints `fired / total`, and given a `<decisionId>,<tp|fp>` labels file prints precision with `n` against the promotion bar. With no fired rows it prints `unmeasured (0 fired rows)` and exits 2 — never a precision of 1.
