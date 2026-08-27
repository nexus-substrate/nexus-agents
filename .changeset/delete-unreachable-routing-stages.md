---
'nexus-agents': patch
---

refactor(routing): delete seven routing stages that were never constructed

`BudgetFilterStage`, `LinUCBStage`, `ZeroRouterStage`, `PreferenceStage`,
`TopsisRouterStage`, `LatencyStage` and `RoutingPipeline` were instantiated
nowhere outside their own factories and their own test files. `CompositeRouter`'s
internal pipeline is the canonical routing path and always was: ADR-0005 listed
migration to `IRoutingPipeline` as "Optional / Phase 3 – Future" and it was
never taken.

Not a breaking change — none of the seven appears in `api-surface.txt` or is
re-exported from `src/index.ts`; they were reachable only through internal
barrels. The seven stages that ARE constructed in production are untouched.

Deleting the producer exposed a consumer that could no longer fire:
`ResourceStrategyStage` read a `budget:utilization=` signal whose only emitter
was `BudgetFilterStage`. #4869 had already superseded that channel with typed
metadata, so the read is removed and its tests moved to the live channel.

That leaves the string-prefix signal channel with producers but **no consumers
at all**, which `signal-contract.test.ts` now asserts explicitly rather than
guarding as impossible — so a future consumer reintroduces itself loudly instead
of resurrecting a dead channel by accident.

`docs/architecture/deprecation-pipeline.md` claimed "Integration with
CompositeRouter complete (disabled by default via feature flags)". There were no
feature flags, because there was no integration; corrected in place.

Decided by consensus vote (`higher_order`, supermajority, 6 of 6 approvers).
Closes #4872.
