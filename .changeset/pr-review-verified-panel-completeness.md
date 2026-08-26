---
'nexus-agents': patch
---

fix(mcp): pr_review stops recording a verified panel when voters were missing

Under the default `errorPolicy: 'standard'`, `aggregatePrDecisions` dropped
errored voters from the denominator and then recorded
`{ decision: 'approve', verified: true }`. One approve plus four errors was
written into the governance record as a unanimous, verified approval —
unanimity measured over a denominator that excluded everyone who could have
disagreed. Inducing errors manufactured a verified approve, which is the exact
attack `absolute_quorum` was added to prevent.

Two neighbouring paths made the same claim: an all-errored panel
(`valid.length === 0`) returned `verified: true`, asserting a complete panel for
a vote in which nobody spoke, and the Tier-4 ambiguous abstain did the same
regardless of how many voters were missing.

The **decision** is unchanged — dropping the errored voter is what `standard`
means, and #4132 kept it deliberately. What changes is the separate claim about
the panel: `verified` is now `false` with a `reason` naming the counts whenever
fewer voters responded than were asked. A complete, error-free panel still
verifies.

Decided by consensus vote (higher_order, 6 approvers, 5 selecting this option
over flipping the default to `absolute_quorum` and over documenting the gap).
Closes #5017.
