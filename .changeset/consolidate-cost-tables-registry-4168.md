---
'nexus-agents': minor
---

refactor(routing): consolidate cost tables onto registry pricing (#4168)

The hardcoded per-CLI/per-model USD cost tables that were duplicated across the
routing chain and cost gates now read `ModelEntry.pricing` from the model
registry through a single authoritative helper, `resolveCliCostPer1M` /
`resolveModelCostPer1M` (in `config/model-config-helpers.ts`, backed by the
`STATIC_CLI_COST_PER_1M` fallback in `config/in-tree-data.ts`).

Consolidated sources: `budget-utils.TOKEN_COSTS`, `budget-stage`'s
`COST_PER_1K_TOKENS`, `test-metrics`'s inline table, and `buildTopsisProfiles`'
pricing path. Priced models upgrade to real registry data; an UNPRICED model
falls back to the conservative static per-CLI estimate — never $0, so an unknown
candidate cannot fail OPEN through a budget filter or look cheapest to TOPSIS and
get over-selected. Registry pricing is per-1M tokens; the per-1K `budget-stage`
table was converted accordingly. The `#4196` cost-ceiling path
(`estimateRegistryCostUsd`) is unchanged: it deliberately keeps its
`undefined`-on-unpriced fail-CLOSED semantics rather than the filter's
conservative fallback.

Frontier CLI defaults (claude-fable-5, gpt-5.5, gemini-3-pro) now carry real
registry pricing, so cost fixtures asserting the old static numbers were updated
deliberately. Unblocks #4195.
