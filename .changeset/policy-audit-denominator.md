---
'nexus-agents': minor
---

feat(observability): durable per-evaluation policy-audit summary + would-block rate (#3727)

The pipeline policy gate's durable audit log recorded only per-violation records (the numerator) — a clean/allowed evaluation wrote nothing, so the would-block RATE had no denominator and couldn't be computed from the durable log. `evaluatePipelinePolicy` now appends ONE per-evaluation summary record (`recordKind: 'summary'`, carrying `violationCount`) on EVERY evaluation including clean ones, in addition to the existing per-violation records (`recordKind: 'violation'`) — preserving the #3710 count-parity invariant. A new `computePolicyWouldBlockRate(events)` helper computes the rate from the summary records (denominator) and those with violations (numerator). The discriminator + count round-trip through the audit bridge into the persisted record. Decided by a 7/7 higher_order vote (capture-now, since warn-mode soak data is non-backfillable). Live-routing use of the rate stays gated on the #3769-enforce readiness gate.
