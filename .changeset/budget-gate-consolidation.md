---
'nexus-agents': patch
---

refactor(cost): collapse the duplicate CLI cost paths onto the shared core (#5122)

Increment 2. `cli-adapters/budget-utils.estimateCost` and
`testing/framework/test-metrics.estimateCost` were byte-for-byte duplicates of
the same arithmetic over the same resolver — paths 3 and 6 of the eleven-way
inventory. The arithmetic now comes from `token-cost-core`, and test-metrics
delegates to the budget path so the conservative-fallback policy has exactly one
definition.

The policy itself deliberately stays in `resolveCliCostPer1M`. An unpriced
candidate must never reach a budget gate as $0, because a $0 always passes a
budget filter and looks cheapest to TOPSIS (#4165/#4196) — swapping this for a
zero-on-unpriced cost function is the trap the ratifying panel called out.

Also adds the direct test that safety net was missing. Every
`DEFAULT_MODEL_PER_CLI` entry is priced today, so the fallback branch never runs
through `resolveCliCostPer1M` — which means the obvious "no CLI estimates free"
assertion passes because the registry has rates, not because the net works, and
stayed green when the fallback was mutated to `{0, 0}`. The net is dormant by
design; a dormant guard nothing exercises is indistinguishable from a broken one,
so it is now tested directly.

Behaviour unchanged, verified by shadow comparison across 20 CLI/token
combinations before and after: zero divergences. Remaining forks: 9.
