---
'nexus-agents': major
---

Retire the `proof_of_learning` consensus strategy and its weighted-quorum branch in 9.0 (#5234, unanimous panel `vote-1791191269012-2wxf9h4`). There was no defensible ground-truth correctness signal for voter performance, and production votes always used equal weights. The in-memory performance tracking API, which nothing wrote to, is removed with it. These exports are gone: `ProofOfLearningStrategy`, `AgentPerformance`, `AgentPerformanceSchema`, `calculateVoteWeight`, `ConsensusEngine.updateAgentPerformance`, `ConsensusEngine.getAgentPerformance`, `ConsensusEngineConfig.enablePerformanceTracking` and `ProposalState.voteWeights`. A config object that still sets `enablePerformanceTracking` is accepted and the key is ignored.

New MCP consensus votes, pipeline votes, CLI `--strategy` selections, and engine proposals reject `proof_of_learning`. Use `simple_majority` for the same unweighted tally, or `higher_order` for contrarian escalation:

```diff
- strategy: 'proof_of_learning'
+ strategy: 'simple_majority'
```

Historical vote records and committed ledgers remain readable and verifiable; their persisted strategy enum and hash projection are unchanged.
