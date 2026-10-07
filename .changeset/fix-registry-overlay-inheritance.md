---
'nexus-agents': patch
---

A model-registry overlay entry that omits `pricing` (for example, one that only
overrides `contextWindow`) no longer drops the model's lower-tier price (#7132).
The entry keeps the lower tier's rate, cache rates and billing-scope provenance,
and the price keeps its basis: in-tree and catalog rates stay `list`, a rate
declared in the user overlay stays `declared` under an operator manifest. Trace
cost (`calculateCost`), usage-ledger cost (`computeCostDetail`) and cost-ceiling
pricing (`getModelPricing`) now agree for such models instead of the ledger and
ceiling treating them as unpriced. An overlay that supplies `pricing` still
replaces the whole rate and is reported `declared`.

`loadManifestOverlay()` now returns user and operator overlay entries in
precedence order (user first, then operator) instead of pre-merging them by id.
A caller that reads its `entries` directly can therefore see the same model id
twice when both overlays define it; the registry resolves the collision
(operator wins, omitted `pricing` inherits).
