---
'nexus-agents': minor
---

**fix(mcp): wall-clock deadline safeguards for `consensus_vote` and `orchestrate`**

Both long-running MCP tools now clamp their internal wall-clock deadline below the outer `wrapToolWithTimeout` cap via `getMcpSafeDeadlineMs`, and return a structured partial result when the deadline fires — instead of the naked `Operation '<tool>' timed out after Nms` error that clients saw before.

- `consensus_vote` (#2108): stuck roles surface as `{ source: 'error', error: 'overall consensus deadline exceeded' }`; every completed vote survives.
- `orchestrate` (#2110): a new `raceAgainstDeadline` primitive in `core/race/` races `executeOrchestration` against a 890s deadline (900s cap − 10s safety buffer). On timeout, the client receives a schema-valid `OrchestrateOutput` with `metadata.timeoutReason = 'orchestration overall deadline exceeded'`, preserving captured setup state (`taskId`, `agentPlan`, `workerDispatch`).

New in the public schema: `OrchestrateOutputSchema.metadata.timeoutReason` is an optional string. Additive, non-breaking.

Closes epic #2104. Follow-up #2111 tracks the state-snapshot fidelity improvement (deferred from the MVP).
