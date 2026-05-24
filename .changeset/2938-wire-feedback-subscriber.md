---
'nexus-agents': patch
---

**fix(pipeline):** wire the `createFeedbackSubscriber` bridge so the advertised feedback loop actually runs.

`feedback-subscriber.ts`'s module docstring claimed it _"closes the feedback loop: execution → events → outcomes → routing"_ — but the only consumers were the unit test and two re-exports. No `PipelineRunner` or graph runner ever subscribed the bridge, so `EventBus` `model.called` / `stage.failed` events never reached `OutcomeStore` via this path.

Added `startFeedbackSubscriber` / `shutdownFeedbackSubscriber` lifecycle wrappers around the existing `createFeedbackSubscriber` (kept that function intact for test-suite use). Wired into:

- `cli-server-tools.ts:initV2PipelineSubsystems` — starts the subscription once on server init, paired with the EventBus bridge wiring.
- `cli-server.ts:createShutdownCleanup` — releases the subscription on SIGTERM teardown (same lifecycle slot as `shutdownExpertBridge` from #2946).

Both start and shutdown are idempotent. 4 new regression tests cover: subscription wires correctly, idempotency on repeated start, shutdown releases the subscription, double-shutdown does not throw. Closes #2938.
