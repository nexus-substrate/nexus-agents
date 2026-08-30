---
'nexus-agents': patch
---

refactor(cost): move the TOPSIS cost estimate onto the shared core (#5122)

Increment 4a. `cli-adapters/topsis-helpers.estimateCost` now computes through
`token-cost-core` via rate injection — the capability the core was given
specifically for paths that price against something other than the registry.
Rates still come from the routing profile, which is why this path exists
separately at all.

Same last-ulp difference as increment 3 (the core defers the division), in one
of twenty shadow-compared cases, and there the core's value is the exact one:
`0.326508` rather than `0.32650799999999996`.

Path 7 (`orchestration-observer-helpers.calculateTokenCost`) was expected to land
here too and does not. It applies a single blended per-1K rate to `totalTokens`
from a per-model table the observer maintains itself, discarding the
input/output split its caller already holds. That is a design decision rather
than a conversion, and is now tracked in #5180.

Remaining forks: 6.
