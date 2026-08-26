---
'nexus-agents': patch
---

fix(learning): stop the feedback bridge fabricating CLI attribution

The EventBus → OutcomeStore bridge hardcoded `cli: 'claude'` and
`category: 'code_generation'` on every `stage.failed` event. `StageFailedEvent`
carries no `cli`, so the attribution was invented on every pipeline stage
failure — including local gates where no CLI ran at all. Ten such events halve
claude's measured success rate in the 20-entry window behind
`getCachedCliSuccessRate`, cut up to 0.15 off the reward LinUCB trains on, and
after five create an `active` distilled rule that penalises claude at routing
time.

`agent-executor.ts` documents that exact bug (#2823 — "silently corrupted
weather-report + LinUCB cold-start warmStart() with false claude credit on every
pipeline run") and skips the record rather than lie. The bridge re-introduced,
through the event bus, the record the executor suppresses.

The CLI is now resolved from the event's `model` (carried since #4194) via the
model registry, and a failure that cannot be attributed writes nothing. The
bridge is also no longer wired into the server: every
`emitStageEvent(…, 'failed')` in `agent-executor` is already paired with its own
`recordOutcome`, so it was double-counting attributable failures on top of
fabricating unattributable ones.

`createFeedbackSubscriber` stays exported and callable — removing it needed a
unanimous vote it did not get (record #78) — but it can no longer write a record
it cannot support.
