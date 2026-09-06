---
'nexus-agents': patch
---

The V2 pipeline init log no longer asserts two things it had not measured.
`feedbackSubscriber: 'active'` named a subscription #5003's panel deliberately
removed — nothing called `startFeedbackSubscriber`, while `cli-server.ts` still
called `shutdownFeedbackSubscriber()` as an unconditional no-op. `bridged:
bridge.forwarded()` was read during init, before any pipeline event could exist,
so it was structurally `0` on every startup. The vestigial start/shutdown pair
is removed (`createFeedbackSubscriber` stays — it is public API for embedders
who manage their own store), and the V2→V1 forwarder, whose `dispose` was
dropped on the floor and leaked past every shutdown, gains a
`startPipelineEventBridge` / `shutdownPipelineEventBridge` pair wired into the
same teardown slot.
