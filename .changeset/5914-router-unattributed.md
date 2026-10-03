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
One shared normalizer validates stored labels in Zod and SQLite readers. Stored
legacy `quality` values parse as `unattributed` with `routerTypeMeasured=false`,
even if the stored flag claims measurement. Historical `topsis` values remain
`topsis` because their labels cannot reveal whether TOPSIS actually ran.

Unknown labels (including the old test-only `composite` label) fail validation.
SQLite single and collection readers return `OutcomeStorageError` with a
`ZodError` cause; one corrupt row fails the entire collection read rather than
returning invalid attribution as valid telemetry. Zod parsing rejects the same
labels. Repair the stored label before retrying the read.

`FeedbackRoutingDecisionSchema` (internally `RoutingDecisionSchema`) is now a
composed Zod intersection. Object-specific methods such as `.shape`, `.extend`,
and `.pick` are no longer available; compose with `.and` or validate with `.parse`
and `.safeParse`.
