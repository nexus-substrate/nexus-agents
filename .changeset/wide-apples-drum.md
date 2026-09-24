---
---

Internal cleanup with no consumer-visible change (#6741). Removes code that the gateway and process-kill work left unreachable or unused: the `CascadeRouterBase` module, the `'agreement_cascade'` routing-strategy value, an unreachable caller-input branch in `ResilientAdapter`'s breaker recording, the always-empty `transformed` field on the internal optional-param plan, an unreferenced `gatewayHostOf` helper, two unimported confidence-router types, and stale comments. None of these were in the package's public API surface.
