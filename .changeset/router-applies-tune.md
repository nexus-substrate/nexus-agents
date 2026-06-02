---
'nexus-agents': minor
---

feat(routing): CompositeRouter applies bounded tune demotions (#3147 keystone step 2)

The router now reads the TuneAdjustmentStore and folds each demoted CLI's
multiplier into TOPSIS stage scoring as an additive penalty (`-(1 - multiplier)

- 10`, consistent with the distilled penalize/-5 scale; bounded by the store's
floor to ≈ -5 max). Gated by `NEXUS_TUNE_ENFORCE` — empty/no-op by default, so
  zero behavior change until the Tune loop is switched on. Completes the read side
  of the self-tuning loop; the TuneStage write/enforce path is the next step.
