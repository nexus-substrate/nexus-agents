---
'nexus-agents': minor
---

feat(swe-bench): per-expert context-budget observer (#2031)

Adds non-blocking context-utilization telemetry around
`expert.execute(task)` in the `execute_expert` MCP tool path.

- After each expert call succeeds, computes utilization =
  `tokensUsed / contextWindow` (window looked up from the canonical
  model registry via `getModelContextWindow`).
- When utilization >= `NEXUS_CONTEXT_WARN_THRESHOLD` (default 0.85),
  emits a `context_warning` log entry with `expertId`, `role`,
  `modelId`, raw token counts, percent utilization, and task length.
- Below threshold, emits `context_utilization` at debug level.
- Never throws — telemetry failure must not break the caller.

Addresses #2031 (child of #1574 SWE-bench Verified prep epic). The
workflow layer already has budget enforcement via
`budget-circuit-breaker.ts`, but expert-direct calls via
`execute_expert` bypass that path. This closes the visibility gap.

Next step (separate issue): aggregate these events in the SWE-bench
runner to identify context-exhaustion failure modes on SWE-bench
Verified.
