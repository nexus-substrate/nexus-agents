---
'nexus-agents': minor
---

compute cost from the full model registry; unpriced is unmeasured, never $0

`computeCostUSD` now reads pricing via `getDefaultRegistry().getEntry()` —
the full chain (manifest > in-tree > models.dev > generated LiteLLM catalog),
including the #4164 normalized/identity resolution tier — instead of the
in-tree tier only, so long-tail catalog models and decorated model names from
OpenAI-compatible gateways price correctly. New `computeCostDetail` returns
`{costUsd, priced, resolvedId, matchedVia?}`; `computeCostUSD` is a thin
wrapper (public API unchanged). `votesToCostInputs` omits `costUsd` for
unpriced models (tokens kept) and `rollupDecisionCost` now counts a voter
without a computable cost as UNMEASURED (#3855 semantics) — a missing price
is never recorded as a measured $0. `UsageEvent` gains optional
`priced`/`priceSource` provenance fields so audit can distinguish a real $0
from an unpriced model.
