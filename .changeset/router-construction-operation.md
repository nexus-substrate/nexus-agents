---
'nexus-agents': patch
---

docs(routing): record router construction as a distinct operation (#5191)

A panel ratified 5/6 that `createAllAdapters` is **not** deprecated for router
construction — it is the canonical answer to a different question.

Two structural blockers, found by attempting the migration: `createCompositeRouter`
takes `Map<RoutingArmId, ICliAdapter>`, while the registry offers
`IResilientAdapter` (which `extends IModelAdapter`, not `ICliAdapter`) one CLI at
a time. No bridge exists, so the canonical path cannot type-check for either
router call site.

It also should not be used there. The router **is** the selection/failover layer,
so resilient-wrapped arms would nest two failover mechanisms, and shared
circuit-breaker state would make an arm report unavailable without the router
ever testing it — the doctor-probe defect (#5209) applied to routing. The arm map
is also the LinUCB bandit space, so coupled arm availability would distort
exploration signals.

Scopes the #5192 lint rule to exempt the two router sites, pins both with the
reasoning, and adds a test so a future "canonical path" cleanup cannot silently
change routing semantics. The singleton/transport limitation is deferred and
tracked in #5211.

That reframes the 7:1 call-site ratio the issue opened with: for the router sites
the canonical path cannot serve the use, which is a wrong map rather than
developers ignoring it.
