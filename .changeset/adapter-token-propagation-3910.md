---
'nexus-agents': patch
---

feat(observability): propagate adapter per-voter tokens + make decision-cost drops non-silent (#3910)

#3855 follow-up. Two items from the #3908 ratification.

**Adapter token propagation.** The adapter layer already exposes per-call usage
(`CompletionResponse.usage` — `inputTokens` / `outputTokens`), but the voter
execution path discarded it, so every voter folded into the decision-cost rollup
as `unmeasured`. `runVoteCompletion` now captures the reported usage and threads
it up through `executeSingleVoteAttempt` → `executeWithRetries` →
`executeAgentVote` into the new optional `AgentVoteResult.inputTokens` /
`outputTokens` fields. The recording bridge reads them natively, so a voter whose
adapter reports tokens now resolves to a MEASURED rollup. Reads are defensive: an
adapter that does not report usage (CLI subscription, partial response) leaves the
counts `undefined` and stays honestly `unmeasured` — never a fabricated 0.

**Non-silent cost drops.** `JsonlStore.append` now returns whether the record was
durably persisted (was `void`; backward-compatible for callers that ignore it).
`DecisionCostStore.record` surfaces that flag, and the recording bridge logs a
`warn` AND increments a process-lifetime counter (`getDroppedCostRecordCount`)
when a rollup fails to persist — so dropped billing telemetry is visible rather
than silently swallowed. The decision still never fails: the summary is always
returned.

Tests: a voter with adapter-provided tokens yields a MEASURED decision-cost
rollup; a persistence failure is logged + counted (not silent) while still
returning the summary; `JsonlStore.append` reports success/failure.
