---
'nexus-agents': patch
---

Route the `run`/MetaOrchestrator consensus-strategy path through the in-process gateway ([#4042](https://github.com/nexus-substrate/nexus-agents/issues/4042))

#4040 routed `consensus_vote` and `pr_review` voters through the in-process gateway adapter
when configured, but consensus reached via the `run` tool's consensus strategy
(`runConsensusForGoal`) still called `executeVoting` with no gateway adapters — so it fell
back to the CLI subprocess voter path. This threads `gatewayAdapters` from the `run` tool's
deps through `buildDefaultExecutors` → `runConsensusForGoal` → `executeVoting`, so the `run`
consensus path matches the two MCP tools: in-process voters (no subprocess, no cross-process
key) when a gateway is configured, CLI fallback otherwise. Closes a gap surfaced by the #4040
review; routing in-process also removes the subprocess that was the re-entrancy concern.
