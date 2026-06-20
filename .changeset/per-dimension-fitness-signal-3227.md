---
'nexus-agents': minor
---

feat(observability): per-dimension fitness-remediation signal (#3227)

Surface a per-dimension fitness-remediation signal so a below-target dimension
(not just the aggregate score or a single critical finding) reaches the EXISTING
off-by-default research→implement loop. SIGNAL-GENERATION ONLY — no new loop, no
TuneStage change, no routing mutation, no new autonomous behavior; the consumer
and its off-by-default gate are unchanged.

- A dimension is below-target when `dimensionScore < FITNESS_DIMENSION_TARGET_FRACTION (0.6) × dimensionMax`,
  computed against each dimension's OWN published max from the new
  `FITNESS_DIMENSION_MAX` source-of-truth table (the boundary is exclusive).
- One aggregated `tech-debt:fitness-dimension:<dimension>:<hash>` signal per
  below-target dimension (never one-signal-per-finding), capped to the top-3
  worst by points-below-target (`MAX_DIMENSION_SIGNALS_PER_RUN`), with a stable
  dedup hash of `(dimension + sorted finding identifiers)` so an unchanged
  dimension does not re-emit.
- The critical-finding and per-dimension paths share one finding renderer (no
  forked near-duplicate builder). Findings are validated against the closed
  dimension set and free-text is length-capped (findings-as-data; a finding's
  suggestion is payload data, never an instruction).
