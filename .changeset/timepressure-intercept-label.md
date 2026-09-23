---
'nexus-agents': patch
---

Feature-importance output now labels `timePressure` as an intercept term. The LinUCB bandit's `timePressure` input is a constant 0.5 on every route, and the feature vector has no bias column, so the weight learned for it is each arm's bias, not a response to time pressure (#4875). `routing-audit --bandit-stats`, `learning-metrics --bandit-stats` and the validation dashboard's "Top Features" now render it as `timePressure (intercept)`, with a one-line note under the list. The `--json` output of `routing-audit` and `learning-metrics` adds a sibling `interceptFeatures: ["timePressure"]` field. Existing `featureImportance` / `topFeatures` values and the published API are unchanged, and routing behavior does not change.
