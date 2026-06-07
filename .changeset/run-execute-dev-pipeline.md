---
'nexus-agents': minor
---

feat(mcp): run tool inline execution — execute:true (dev-pipeline wired)

The `run` entry point gains `execute: true` (default false). When set, it selects a strategy via the MetaOrchestrator and dispatches it through the MetaDispatcher to a real engine executor, returning the result and recording a `MetaOutcomeRecord` keyed by `decisionId`. The first wired executor is `dev-pipeline` (real, non-simulated — via a new `runDevPipelineForGoal` helper); strategies without an executor fail closed with a typed `MetaDispatchError`. Executors live at the MCP-tool layer (injected into the dispatcher) so the orchestration core stays cycle-free. Default behavior is unchanged (read-only routing decision). Increment B slice (a) of #3575; remaining engine executors and the demotion of the specialized tools follow in later slices.
