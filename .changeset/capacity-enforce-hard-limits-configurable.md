---
'nexus-agents': minor
---

feat(routing): make the capacity stage's documented opt-in actually settable

`CapacityFilterStage` excludes an exhausted arm only when `enforceHardLimits` is
true, and its doc said the flag "remains available for callers who have a real
quota signal". No caller could set it: the sole production construction passed a
hardcoded `{}`. So `outcome.excluded` was always empty, `excludedCount` could
only ever report zero, and the fail-closed _"All routing candidates excluded —
capacity_exhausted"_ branch was unreachable.

The blocker that justified holding it — #4456's "no real quota signal exists
yet" — has been overtaken. `CapacityTracker.recordProviderQuotaExhaustion` sets
an exhaustion window from a durable provider `retry-after`, fired by
`base-adapter` and `model-to-cli-adapter` on `RATE_LIMITED`, and `assessCapacity`
maps it to `'exhausted'`. The evidence exists, so the opt-in is now real:
`capacityStageConfig` on `CompositeRouterConfig` threads through to the stage.

**The default is unchanged.** `enforceHardLimits` stays `false` and #4456's
signal-only posture holds — it is a choice a caller can override rather than a
hardcoding nobody could reach.

`CompositeRouterStats` gains `capacityStats: { enforced, excludedCount }`.
`enforced` is the load-bearing half: a zero `excludedCount` means one thing when
enforcement is on and something else entirely when it is off, and the count
alone could not say which. The field is absent when the stage is disabled — a
third state, distinct from both zeros.

Closes #4658.
