---
'nexus-agents': minor
---

stop reporting an agreement rate from an untrained shadow selector

`MetaShadowRecord.learnedStrategy` was `'single-shot'` on every run.
`NEXUS_META_SHADOW_TRAIN` defaults off, so the bandit is never updated, every
arm holds identical parameters, `computeUCB` scores them equally, and the
strict `>` tie-break in `select` resolves to arm 0 — which is `'single-shot'`.

`summarizeShadowAgreement` counted those, so the reported agreement rate was
not a comparison at all: it was **the frequency with which the rule-based
router happens to choose single-shot**, labelled as learned-vs-rules agreement.
That number is the evidence base for the enforce flip in #3552.

- `predict` now returns `trained`, false while no arm has been pulled.
- `MetaShadowRecord` gains an optional `modelTrained`. Absent means the record
  predates the field and came from the same cold bandit, so it counts as
  untrained.
- `ShadowAgreementSummary` gains `trainedRecords`, and `agreementRate` is taken
  over those only. Under the default configuration that is now `0` over `0` —
  visibly nothing measured, rather than a high rate that looks like evidence.

Fixes #4825.
