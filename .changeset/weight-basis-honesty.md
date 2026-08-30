---
'nexus-agents': minor
---

fix(consensus): stop reporting unweighted tallies as performance-weighted (#5117)

`proof_of_learning` returned `"Approved with X% weighted approval"` and a
populated `weightedCounts` for tallies in which **every weight was structurally
1.0**. The performance map feeding those weights has never had a writer —
`updateAgentPerformance` has no non-test caller — so at the default threshold
the strategy was arithmetically identical to `simple_majority` while inviting
every reader of the record to believe voter track record moved the number.

`VotingOutcome` and `ConsensusResult` now carry `weightBasis`:
`'performance' | 'partial' | 'unweighted'`, and the reason text names which one.
`partial` is a real state, not a rounding — some voters having history while
others do not must not be reported as fully performance-weighted.

**The basis is derived from provenance, not from the weight value.** A voter
with a perfect record legitimately weighs exactly `1.0`, so "does any weight
differ from 1.0" cannot distinguish *measured and reliable* from *never
measured* — that test would be its own can't-distinguish defect. `recordVote`
now writes a weight only when a performance record exists, so absence in the map
carries the provenance. The arithmetic is unchanged: `countWeightedVotes`
already defaults a missing entry to `1.0`.

`QuorumValidator` gets the same treatment: its `agentWeights` input likewise has
no non-test producer, so its reasoning text now says
`unweighted (no agent weights supplied)` instead of describing a plain headcount
as a weighted ratio.

Also corrected: `calculateVoteWeight`'s JSDoc claimed weights range from
"0.5 (no history)" while the code returns `1.0` for no history, and the MCP
strategy description advertised performance weighting without stating that
nothing records the history it needs (#5234).
