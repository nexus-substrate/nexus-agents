---
'nexus-agents': minor
---

feat(mcp): run inline execution — wire consensus executor

Wires the `consensus` strategy into the `run` tool's inline-execution path via a new `runConsensusForGoal()` helper (votes on the goal as the proposal through the real consensus engine; non-simulated). Now wired for `execute: true`: dev-pipeline, pipeline, research, consensus. The remaining strategies (spec, orchestrate, single-shot, graph-workflow) stay fail-closed with documented reasons. Increment B slice (c) of #3575.
