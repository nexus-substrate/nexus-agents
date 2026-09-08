---
'nexus-agents': patch
---

`routing.linucb.maxDecisionTimeMs` is deprecated (#5918). It is declared three
times, validated, and copied into the runtime config, and nothing on the
routing path ever compares anything to it — setting it does not bound routing.
`adaptRoutingConfig` now warns once when an operator actually sets it, all three
declarations carry `@deprecated`, and the two conflicting defaults (50 and 100)
are one. The field still resolves exactly as before; removing it is a published-
API break, queued for the next major as #5963.

Also renames `RoutingScorerConfig.maxDecisionTimeMs` to `latencyBudgetMs`. That
type is not in the published API surface. It is a genuine after-the-fact
grading threshold, and sharing the name made a repo-wide grep for the router's
field return it, reading as though routing were bounded.
