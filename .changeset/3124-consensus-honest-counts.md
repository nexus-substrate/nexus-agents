---
'nexus-agents': patch
---

fix(consensus): error-policy short-circuit reports honest vote counts (#3124)

A `consensus_vote` that short-circuits on an error policy (`fail_closed`, or the >50%-error hard floor) reported `voteCounts: {approve:0,reject:0,abstain:0}` and `approvalPercentage:0` even when most voters clearly approved — so a 6/7 approval with one timed-out voter looked like a flat rejection at 0%. `createPolicyFailedResult` now reports the TRUE breakdown of the responding (non-error) voters (e.g. `approve:6`, `approvalPercentage:100`) while the decision still fails closed, and the response carries a new `policyReason` field (e.g. `fail_closed: 1 voter(s) errored`) so callers don't mistake a policy short-circuit for a genuine rejection. The gate decision is unchanged — the contested question of whether `higher_order`/`unanimous` should _default_ to `reduce_denominator` is tracked separately (decided via consensus_vote, see #3138).
