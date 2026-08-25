---
'nexus-agents': patch
---

stop advertising higher_order as a correlation-aware verdict

The `consensus_vote` tool description told callers that `higher_order` provides
"Bayesian-optimal aggregation with correlation awareness". It does not decide
the verdict that way. `OWVoting.calculateOutcome` — the `IVotingStrategy` the
`ConsensusEngine` calls — runs `aggregateSimpleInternal` and discards weights,
so approve/reject is a simple tally and correlated voters each carry full
independent weight.

The Bayesian analysis is real and does run, but its `posteriorApproval` reaches
only contrarian escalation, never the verdict.

Corrects the tool description, the module docstring, and three docs that
repeated the claim. No behaviour change — the aggregation itself is unchanged,
and whether to wire it into the verdict is #4701.
