---
'nexus-agents': patch
---

feat(outcomes): optional traceId/requestId correlation on routing TaskOutcome (#3146, epic #3143 P1)

Adds optional `traceId?`/`requestId?` to the routing `TaskOutcomeSchema` so outcomes can be correlated across the pipeline/audit substrate. Zod-optional and backward-compatible — older JSONL records without the fields hydrate unchanged. First additive PR of the ratified P1 durable-substrate plan; the feedback-side `StoredTaskOutcome` already carries `traceId`.
