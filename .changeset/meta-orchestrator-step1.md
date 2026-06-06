---
'nexus-agents': minor
---

feat(orchestration): add MetaOrchestrator selection tier (step 1)

Introduces `createMetaOrchestrator()` — a thin, deterministic selection tier that, given a goal, picks one `ExecutionStrategy` among the existing specialized pipelines (single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / spec / research). It reuses the existing `SharedTaskAnalyzer`, `WorkflowRouter`, and `classifyTask` brains rather than duplicating their logic, and returns a transparent `MetaDecision` (strategy + reasoning + confidence + alternatives + shaping flag + underlying signals) with a `forceStrategy` power-user override. This is the "routing" pattern (select once per task), not a runtime-switching mega-pipeline. Dispatch wiring, decision logging, and learned selection follow in later steps of the epic.
