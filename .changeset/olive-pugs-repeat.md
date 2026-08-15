---
'nexus-agents': minor
---

Add capacity-aware routing exclusion (#4373, criterion 3 of #4351).

`CapacityFilterStage` removes a routing candidate whose adapter reports **measurably** exhausted capacity, emitting a normalized `capacity_exhausted` diagnostic. When every candidate is excluded the router now fails closed with an error naming each excluded arm and why, instead of routing to an adapter that cannot serve.

This restores — in the shape the router actually needs — the capacity semantics of the `WorkBalancer` removed in #4378. Only the predicate carried over; the queue did not.

**Unmeasured capacity never excludes.** `CapacityStatus.observed` (#4374) marks whether a reading is real: when false, every other field is a default rather than a measurement. The stage classifies each candidate as exhausted / healthy / **unmeasured** and only an observed reading can exclude. A missing adapter or a failed capacity probe is likewise unmeasured, never exhausted — it fails open on absent evidence. Unmeasured candidates are also not counted as healthy; they surface as a distinct `capacity:unmeasured-N` signal.

Enforcing by default (7/7 consensus vote). The local tracker sees only this process's spend, so `remainingTokens` is an upper bound — meaning an _observed_ exhaustion implies provider-side quota is at least as exhausted. The residual error is therefore false negatives, which is the pre-existing behaviour this fixes.

**Known limitation:** the tracker has no visibility into provider-side quota consumed by other processes, so exhaustion burned elsewhere is still invisible. This closes criterion 3 for locally-observable exhaustion only.

Wired to the existing `enableCapacityBalancing` config flag rather than a new one. That flag was declared for #807 and defaulted to `true` while promising "deprioritize exhausted CLIs", but no stage ever read it — it is now honest. Set it to `false` to disable, or construct the stage with `enforceHardLimits: false` for signal-only operation.
