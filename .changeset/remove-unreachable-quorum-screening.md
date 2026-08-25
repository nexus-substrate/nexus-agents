---
'nexus-agents': patch
---

remove the quorum agent screening that could never exclude anyone

`QuorumValidator.isAgentEligible` had three exclusion branches, all requiring an
`AgentRecord`. No production caller supplied one, and no producer of trust
scores or Byzantine flags exists anywhere in `src/` — `enableByzantineDetection`
had zero writers. So every voter was always eligible.

The breakdown nonetheless emitted an `eligibleAgents` list containing every
voter. A source comment explaining that nothing was screened does not travel
with a serialized record, so a machine consumer read screening-shaped output as
evidence that screening ran.

Removes the branches, `enableByzantineDetection`, `agentRecords`, `AgentRecord`,
`EligibilityResult`, and the `eligibleAgents` field, so the breakdown no longer
reports a measurement it never took. Git history holds the implementation for
whenever a real trust-score producer appears.

`consensus_vote` 7-0 unanimous. Fixes #4666.
