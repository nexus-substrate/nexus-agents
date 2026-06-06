---
'nexus-agents': minor
---

feat(consensus): escalate borderline higher_order quickMode approvals to the full panel (#3174)

`quickMode` approvals now escalate to the full 7-voter panel when a
`higher_order`/`opinion_wise` vote approves with a borderline Bayesian
posterior (`posteriorApproval` below `HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR`,
0.65). Previously escalation fired only via the contrarian-agent check, which
ignored the posterior — a low-confidence Bayesian approval looked identical to a
clean one. The posterior check runs first, so a borderline approval escalates
without spending a contrarian call. New pure predicate `shouldEscalateLowPosterior`
in `consensus-vote-types.ts` (unit-tested); non-higher-order strategies,
rejections, and full-panel votes are unaffected.
