---
'nexus-agents': minor
---

feat(routing): derive tier tables from registry quality+pricing (#4195)

The hardcoded tier / strength / rank tables that were duplicated across the
routing chain now derive from each CLI's default-model `qualityScores` + real
registry `pricing` through a single authoritative helper,
`cli-adapters/derive-tier-tables.ts`. Consolidated consumers:

- `zero-router-types.DEFAULT_TIER_TO_CLIS` — `deriveTierToClis()`
- `confidence-cascade-stage.CLI_CONFIDENCE_PROFILES` — `deriveCliConfidenceProfiles()`
- `composite-router-helpers.filterByPreferenceTier` strong/weak sets —
  `deriveStrongClis()` / `deriveWeakClis()`, and its `filterByDifficultyTier`
  parallel tier literal — `deriveTierToClis()`
- `resource-strategy-stage.CLI_QUALITY_RANK` / `CLI_COST_RANK` —
  `deriveCliQualityRank()` / `deriveCliCostRank()`

Binding vote conditions (#4195), each unit-pinned in
`derive-tier-tables.test.ts`:

1. A CLI whose default model lacks `qualityScores` classifies conservative and
   is excluded from the powerful tier and the premium ("strong") set — an
   unvetted model never fronts the frontier tier.
2. Composes safely with `resolve-model-for-tier`: because (1) keeps unscored
   CLIs out of the powerful tier, and a degenerate all-unscored cohort yields an
   _empty_ powerful tier (never a synthesised frontier default), an empty
   powerful tier no longer silently up-costs.
3. A $0/$0 default (genuine `:free` or a catalog artifact, #4209) is normalised
   to most-expensive, so it can never win the cost rank or the premium set and
   pull real traffic to it as "cheapest".
4. Every ordering is deterministic — value-keyed with explicit, stable
   tie-breaks (quality ties break by premium price; never `qualityScores`-NaN or
   insertion-order dependent).

The router-scoring `CAPABILITY_MATRIX` was assessed and intentionally retained:
it is a per-task-type _affinity_ matrix (orthogonal to the quality/cost tier
axis and not recoverable from `qualityScores`), and its per-CLI capability
inputs are already registry-derived via `buildCliCapabilityProfiles`.

Full suite green with no fixture changes — the registry-derived orderings
reproduce every previously-pinned tier / rank / strength selection. Closes the
last buildable child of epic #4175.
