---
'nexus-agents': minor
---

feat(tune): enable the self-tuning routing loop by default (#3323)

**NOTABLE — behavior change.** `NEXUS_TUNE_ENFORCE` now defaults to **`true`**:
routing self-tunes by default. When a CLI's health degrades (SwarmObserver
bottleneck or adapter circuit-breaker failover emits `signal.swarm_unhealthy`),
the `CompositeRouter` applies a **bounded** demotion to that CLI's candidate
score.

The demotion is strictly safety-bounded so it is self-correcting, never a
ratchet: demotion-only (a CLI is slowed, never boosted), floored at `0.5` (never
zeroed — a sole-viable CLI is always still selectable), capped at `0.2` per step,
and time-decaying linearly back to neutral over 30 minutes. Every demotion is
recorded to the immutable audit log (`tune.demote`, verify via
`verify_audit_chain`).

**Opt out** with `NEXUS_TUNE_ENFORCE=false` to restore shadow mode (the loop logs
what it _would_ do and records the `intended` counter — visible in
`nexus-agents health` → "Self-Tuning Demotions" — but leaves routing untouched).

Completes epic #3143 (close the loop) / keystone #3147.
