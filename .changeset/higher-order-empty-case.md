---
'nexus-agents': patch
---

fix(consensus): the higher-order strategy reports an empty or all-abstain panel as no votes cast, not 50%

`OWVoting.toVotingOutcome` published `aggregateSimple`'s `posteriorApproval = 0.5`
fallback as `approvalPercentage: 50` whenever nothing countable was cast — a
measured-looking midpoint standing in for an unmeasured panel.

This was the only one of the four strategies missing the guard;
`SimpleMajorityStrategy` and `SupermajorityStrategy` already answer the same
input with `0` and `'No votes cast (excluding abstentions)'`. The fix matches
them, so the four strategies now give one answer to the empty case.

Reachable in production rather than theoretical: an errored voter
(`voter-execution.ts:92`) and an unparseable response
(`protocol-helpers.ts:101`) both produce `abstain`.

Scope: this is the non-breaking half of #4701's defect 2. A split panel is
still recorded as `rejected` — distinguishing it needs a new
`VoteDecisionStatus` member, which is a breaking change to an exported type and
is tracked in #4740 behind a unanimous vote.
