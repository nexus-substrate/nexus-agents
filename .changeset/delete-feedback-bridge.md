---
'nexus-agents': minor
---

fix(learning): delete the feedback bridge that fabricated CLI attribution

The EventBus → OutcomeStore bridge hardcoded `cli: 'claude'` and
`category: 'code_generation'` on every `stage.failed` event. `StageFailedEvent`
carries no `cli`, so the attribution was invented on every pipeline stage
failure — including stages where no CLI ran at all.

`agent-executor.ts` documents that exact bug (#2823 — "silently corrupted
weather-report + LinUCB cold-start warmStart() with false claude credit on every
pipeline run") and skips the record rather than lie. The bridge re-introduced,
through the event bus, the record the executor suppresses. It was also
double-counting: every `emitStageEvent(…, 'failed')` there is paired with its
own `recordOutcome`.

`agent-executor` is now the single canonical outcome writer. Remedy chosen by a
7-voter panel: Option A, 6 of 6 approvers, audit record #77.

BREAKING: `createFeedbackSubscriber` is removed from the public API surface.
