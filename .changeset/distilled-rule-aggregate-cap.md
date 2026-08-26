---
'nexus-agents': patch
---

fix(routing): bound the total distilled-rule adjustment per candidate

`findMatchingRules` treats an undefined task category as match-all, and each
matched rule was applied to the score separately with no bound on the sum. Since
`detectTaskCategory` returns null for any content without a specialization
keyword, an unscoped task could stack six penalties at confidence 0.88 into
**-26.4** against a candidate at 0 — an order of magnitude past `avoidDelta`,
the largest documented single-rule bound, driven entirely by rules learned for
categories that were not this task's.

Every documented bound was per-rule (`ACTION_DELTAS`); nothing bounded the
aggregate. The matched deltas are now summed and clamped to the single-rule
range, and a `distilled-rule:capped=<cli>` signal says when the clamp bit — a
bounded score is not the same as one the rules produced, and the trace should
not imply otherwise.

Remedy chosen by a 7-voter panel: Option A, 4 of 6 approvers, audit record #81.
