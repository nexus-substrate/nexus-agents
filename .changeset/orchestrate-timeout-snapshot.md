---
'nexus-agents': patch
---

**feat(orchestrate): richer partial-result content on wall-clock timeouts (#2111 / #2116)**

Follow-up to the deadline safeguard shipped in v2.54.0. When `orchestrate` hits its wall-clock deadline, the partial `OrchestrateOutput` now includes whatever the orchestration captured before the hang:

- `routing` — populated once `routeAndPrepare` returns (post-routing-decision)
- `analysis` — populated when the fast-path completes
- `stepsCompleted` — carries the snapshot's step counter rather than being forced to 0

Empty-snapshot fallback is unchanged (sentinel analysis with `complexity: 1`, `taskType: 'unknown'`), so clients keyed on the v2.54.0 shape keep working. Additive-only; no schema changes.
