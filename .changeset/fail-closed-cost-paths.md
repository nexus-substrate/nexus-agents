---
'nexus-agents': patch
---

refactor(cost): move the fail-closed cost paths onto the shared core (#5122)

Increment 3. `core/trace-pricing.calculateCost` and
`cli-adapters/budget-router.estimateRegistryCostUsd` now compute through
`token-cost-core`. Their `undefined`-on-unpriced policy stays at each call site,
named — it is deliberately different from `resolveCliCostPer1M`'s conservative
non-$0 fallback (#4196 vs #4168), and keeping both policies visible where they
apply is what stops one being swapped for the other.

**One observable change, deliberate and bounded.** The core multiplies before
dividing (`tokens * rate / 1e6`) where these paths divided first. That rounds
once instead of twice, so values differ in the last ulp — in both directions. One
input token at $5/1M now returns exactly `0.000005` where it returned
`0.0000049999999999999996`. Relative error against the previous form is under
1e-12; 4,296 tests across `core`, `cli-adapters` and `learning` pass unchanged.

The ordering is now pinned by test rather than left implicit, so a later
"simplification" back to divide-first cannot silently shift every cost in the
tree.

Remaining forks: 7.
