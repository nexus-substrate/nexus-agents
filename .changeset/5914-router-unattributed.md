---
'nexus-agents': major
---

Replace the producerless `quality` member of the public `RouterType` union with
`unattributed`. Routing decisions with no decisive scoring stage now report
`unattributed` instead of `topsis`. Update exhaustive switches and router count
records to handle `unattributed` and remove `quality`.

`FeedbackLoopStats.decisionsUnattributed` is removed; read
`stats.decisionsByRouter.unattributed` instead. `countDecisionsByRouter` now returns
the bucket record directly, including unmeasured legacy decisions in
`unattributed`.

```diff
- const missing = stats.decisionsUnattributed;
+ const missing = stats.decisionsByRouter.unattributed;
```

Keep recording `routerTypeMeasured`: its SQLite signal distinguishes measured
results from legacy fallback labels and treats absent evidence as unmeasured.
Stored legacy `quality` values parse as `unattributed`; historical `topsis` values
remain `topsis` because their labels cannot reveal whether TOPSIS actually ran.
