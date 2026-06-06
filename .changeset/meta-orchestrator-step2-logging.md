---
'nexus-agents': minor
---

feat(orchestration): log MetaOrchestrator selection decisions (step 2)

Every MetaOrchestrator selection now emits a `MetaSelectionRecord` (decision id, goal, chosen strategy, confidence, pattern, pipeline type, alternatives, shaping flag, forced flag, timestamp) to a configurable `MetaDecisionSink`. The default sink writes a structured audit log line; `createRecordingSink()` provides an in-memory bounded buffer for inspection. `MetaDecision` now carries a `decisionId` — the join key a later task outcome references (mirrors `TaskOutcome.routingDecisionId`), the substrate that learned selection (step 3) will mine. Observability only: selection behavior is unchanged. This record type is intentionally distinct from the model-centric `RoutingDecision` in the learning module (strategy selection vs model selection).
