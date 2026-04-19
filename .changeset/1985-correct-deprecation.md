---
'nexus-agents': patch
---

docs(cli-adapters,coordination): correct task-classifier and task-features deprecation markers (closes #1985)

Audit during #1985 found that the `@deprecated — use SharedTaskAnalyzer`
markers on two modules were aspirational, not actionable:

- `cli-adapters/task-classifier.ts` exposes `FallbackTaskType` — a 5-value
  taxonomy (code/research/documentation/analysis/general) tuned for
  CLI fallback-chain selection. `SharedTaskAnalyzer.TaskTypeCategory`
  has 9 values tuned for capability routing. They are not interchangeable.
- `agents/coordination/task-features.ts` exposes `extractTaskFeatures` —
  produces `ScalingTaskType`-categorized features for the scaling-predictor
  model. That is a different feature set than `SharedTaskAnalyzer.analyze()`
  produces for capability routing.

Both modules serve distinct, still-needed purposes. Removed the misleading
`@deprecated` markers and clarified each module's role + relationship to
`SharedTaskAnalyzer`. No code behavior changes.

The original issue #1985 ("migrate to SharedTaskAnalyzer") is resolved
because there is nothing to migrate — the modules were incorrectly
deprecated. A future unification (if warranted) would be a new design
proposal, not a 1:1 migration.
