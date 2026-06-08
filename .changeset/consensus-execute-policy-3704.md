---
'nexus-agents': patch
---

Enforce policy at the consensus→execute seam in the legacy dev-pipeline (#3704).

`runDevPipeline` orchestrates via stage callbacks and never traverses the graph
PipelineRunner, so the #3177 graph gates never fired for it — leaving the
consensus→execute boundary unguarded. A policy check now runs after the approved
plan-vote loop (and the dry-run short-circuit) and before decompose, reusing the
existing `evaluatePipelinePolicy` evaluator (no new evaluator path). Mode resolves
via `getGateEnforcementMode()` (WARN by default; block/off opt-in via
`NEXUS_POLICY_GATE_MODE`). `policy.evaluated` is emitted on the shared pipeline
event bus before any block-mode `PolicyBlockedError` throw, so blocked runs are
audited. WARN logs and continues; block throws and aborts the run.
