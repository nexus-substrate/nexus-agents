---
'nexus-agents': minor
---

feat(mcp): run inline execution — wire pipeline + research executors

Wires two more strategy executors into the `run` tool's inline-execution path (`execute: true`): `pipeline` and `research` both dispatch to a new `runPipelineForGoal()` helper (auto-detected template, non-simulated) over the adaptive orchestrator. `graph-workflow` remains intentionally unwired (graph workflows are pre-defined templates, not a goal-only call) and fails closed with a typed error, as do the still-unwired strategies. Increment B slice (b) of #3575.
