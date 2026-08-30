---
'nexus-agents': patch
---

refactor(cost): absorb the last subsystem-local cost helper into the core (#5122)

`tokensToCostUsd` was introduced in #5171 to collapse three inline
`tokensUsed * 0.00001` expressions, and deliberately kept subsystem-local rather
than becoming a twelfth token→USD path. With the core's `blended` component now
in place, that reservation no longer applies: this is exactly the shape it was
added for.

The name and per-1K convention stay — three call sites in that subsystem read
better for them — but the arithmetic is no longer a second implementation.
Verified identical across five token/rate cases.

`blended` rather than `input` because this subsystem tracks a single token count
with no split. Folding it into `input` would be arithmetically identical and
semantically false.

Concern-registry alternates for `compute-token-cost-in-usd`: **0**. Every
token→USD path in the tree now routes through `learning/token-cost-core`, and
the #5123 ratchet fails CI on a new one. That closes the #5122 pilot's
consolidation half — eleven implementations (twelve, counting the one the ratchet
itself found) down to one.
