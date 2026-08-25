---
'nexus-agents': minor
---

give ResourceStrategyStage the budget data it reads

Increment 2 of #4866, following the panel's Option B: pass each stage what it
needs as a typed argument rather than reviving the cross-stage signal channel.

`ResourceStrategyStage` runs on every route (`enableResourceStrategy` defaults
to `true`) and skipped every time with trace reason "no budget data". It looked
for a `budget:utilization=` signal emitted by `BudgetFilterStage` — which has no
production instantiation — and was handed a fresh context with `signals: []`
regardless.

- `applyBudgetFilter` computes utilization from the projected spend and the
  configured `maxCostUsd`, mirroring the formula in `budget-stage.ts`.
- `runBudgetStage` returns it; `runPipeline` threads it into
  `runResourceStrategyStage` as a typed argument.
- `ResourceStrategyStageResult` gains `tierMeasured`. `buildOptionalFields`
  recorded `resourceTier` only when the tier differed from `'balanced'`, so a
  measured balanced tier was indistinguishable from a stage that never ran.
  It now keys on whether a tier was selected.

**Scope of the behaviour change:** utilization is `undefined` unless
`maxCostUsd` is configured, and the stage keeps skipping in that case. Only
deployments that set a cost ceiling — an explicit opt-in to budget-aware
routing — see tier adjustments begin to apply.

Fixes the `it.fails` proof added in #4867. Refs #4834.
