---
'nexus-agents': patch
---

feat(capability-loop): runaway-loop guard for auto-remediation (#3617)

Condition 6 of the #3540 auto-invoke gate. A `RemediationGuard` that prevents the
recursive self-trigger loop (an auto-PR perturbs fitness → emits a new signal →
triggers another remediation → …) by bounding three axes, fail-closed:

- **idempotency + cooldown** — the same `signalKey` can't re-trigger within
  `cooldownMs` (default 6h), breaking the common same-signal re-fire;
- **depth/generation** — a remediation chain is capped at `maxGenerations`
  (default 1), bounding cascades across different signals;
- **rate cap** — ≤ `maxPerWindow` (default 5, mirrors MAX_ISSUES_PER_RUN) per
  `windowMs` (default 24h).

Pure + in-memory + bounded; nothing executes. The enforce path (#3618) consults
it before routing any remediation to the dev-pipeline.
