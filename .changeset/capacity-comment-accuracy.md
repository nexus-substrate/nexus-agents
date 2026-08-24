---
'nexus-agents': patch
---

docs(routing): the capacity stage does run — correcting a correction

The `#4658` wiring note claimed the capacity stage "is not part of the
production routing chain" and that "neither the signal nor the exclusion runs
today". Both are false, and false in the direction that invites deleting live
code.

`enableCapacityBalancing` defaults to `true`, `composite-router.ts` constructs
`CapacityFilterStage` directly, and `composite-router-stages.ts` awaits
`filterArms` in the pipeline. Every route is assessed. What does not run is the
EXCLUSION, because `enforceHardLimits` stays at its `false` default via a
hardcoded `{}` — so `excludedCount` really is structurally 0.

The earlier note reasoned from `createCapacityStage`, the factory, having no
non-test caller. That is true and remains true; production does not use the
factory. "The factory is unused" is not "the stage is unused".

Two tests now pin the claims — that the stage is default-on, and that an
observed exhaustion is assessed but not excluded — so the comment cannot drift
in either direction again without a failure.
