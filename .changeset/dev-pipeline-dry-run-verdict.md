---
'nexus-agents': minor
---

`run_dev_pipeline` dry runs now report the plan vote's outcome. The response and `DevPipelineResult` carry `planVoteDecision` (`approved` / `rejected` / `no_quorum`), `planVoteApprovalPercentage`, and `planVoteRecordId` when the vote wrote a ledger record. Before this, the verdict was only in the vote ledger and the logs. A terminal plan-gate stop carries the same fields. A full run's result is unchanged.

The `run_dev_pipeline` response also gains `security: { status: 'passed' | 'failed' | 'unmeasured' }`. A scan that did not run, or a result that does not say whether it ran, reports `unmeasured`, so it can no longer be mistaken for a failed check. `securityPassed` is still returned as a boolean for compatibility, but on its own it is not a verdict: read it only when `securityRan` is `true`, or read `security.status` instead. The `VoteResult` type gains an optional `voteRecordId`.
