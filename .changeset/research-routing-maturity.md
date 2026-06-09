---
'nexus-agents': minor
---

feat(routing): record research-maturity on routing outcomes + a measurement surface (#3234)

Closes the research→routing record-and-measure loop. The dev-pipeline research stage now exposes a structured `ResearchContext { text, metadata }` (was bare text); a deterministic `researchMaturity` score derived from the research quality-signals is attached to each decomposed `PipelineTask` (request-scoped, resume-safe), recorded on the MobiMem `ExecutionOutcome`, and surfaced through a new read-only measurement consumer `RoutingMemory.getResearchMaturityReport()` — success-rate bucketed by research-maturity (none/low/high) with the high-vs-none delta.

Per a 7/7 higher_order consensus vote, this is RECORD + MEASURE only: research-maturity does NOT influence live routing. Weighting the KNN router by this signal is deliberately deferred and gated on the measurement showing a real, similarity-controlled success-rate lift (#3815) — avoiding an unvalidated, possibly task-novelty-confounded change to the learning loop.
