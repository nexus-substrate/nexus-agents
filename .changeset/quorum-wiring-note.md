---
'nexus-agents': patch
---

docs(consensus): say that quorum eligibility screening never runs in production

`QuorumValidator.isAgentEligible` has three exclusion branches —
`byzantine_flagged`, `low_trust`, `insufficient_weight` — and none can fire from
a real run. All require an `AgentRecord`, and the only production path in
(`voting-protocol-helpers` → `validateQuorum` → `getQuorumBreakdown`) passes
`{ votes, config }` with no `agentRecords`. With no record the method returns
`{ eligible: true, weight: 1.0 }` immediately, so `eligibleAgents` is always
every voter. `enableByzantineDetection` additionally has zero writers anywhere
in `src/`.

Deliberately NOT deleted. The behaviour is correct and covered by four tests, so
this is unwired capability rather than dead code, and removing a working trust
model is a decision about the resilience posture — tracked in #4666, not
something to slip into a cleanup.

What changes is that the code no longer implies screening happens: the method
documents that a full eligible list is not evidence anything was screened, and a
new test pins that production shape — Byzantine detection enabled, no records
supplied, nobody excluded. If a producer for `AgentRecord` is ever wired, that
test fails and should be replaced by one asserting the real screening.

Severity is low and unchanged: this is `VotingProtocol`, not the live
`consensus_vote` engine, so trust screening is not silently disabled on the path
that decides real things.
