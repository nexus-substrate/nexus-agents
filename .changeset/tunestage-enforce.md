---
'nexus-agents': minor
---

feat(tune): TuneStage applies bounded routing demotions when enforced (#3147)

Flips the TuneStage enforce path from a fail-closed no-op to a real bounded
mutation: on `signal.swarm_unhealthy` it calls `TuneAdjustmentStore.demote`
(demotion-only, floored, capped, time-decaying), audited via a structured log.
Gated by `NEXUS_TUNE_ENFORCE` — the SAME flag the router read uses, so the loop
is either fully live or fully shadow, never half-wired. Default off (shadow).
Non-routing signals (fitness_declined/vote_rejected) stay shadow even when
enforced — they belong to issue-filing/review paths, not routing. Closes the
self-tuning loop's write side end-to-end (store + router read + this write).
