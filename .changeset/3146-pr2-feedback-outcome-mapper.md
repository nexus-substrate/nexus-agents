---
'nexus-agents': patch
---

feat(outcomes): feedback→routing TaskOutcome mapper (#3146, epic #3143 P1)

Adds `feedbackToRoutingOutcome(feedback, context)` (new `learning/feedback-outcome-mapper.ts`) — a one-way, pure mapper converting a feedback-layer `TaskOutcome` into a routing-layer one, so feedback outcomes can be recorded into the routing OutcomeStore for unified analysis. The feedback `traceId` is carried through (lands in the optional routing `traceId` from PR-1/#3281), giving cross-layer correlation. The two `TaskOutcome` types stay separately exported (no symbol collapse). Lossy by design: the feedback `qualitySignals`/`qualityScore` have no routing-schema home and are dropped; `errorMessage` is clipped to the schema's 500-char max. Output is schema-valid. Additive — no existing code paths changed.
