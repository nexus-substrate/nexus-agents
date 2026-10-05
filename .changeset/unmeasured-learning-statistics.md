---
'nexus-agents': major
---

Represent missing learning measurements as `null` in the public API. The
`StoredModelStats` fields `avgReward`, `avgQualityScore`, `avgLatencyMs`, and
`successRate` are now `number | null`; each is null when its aggregate has no
inputs, including models with routing decisions but no outcomes. Consumers must
handle null explicitly and exclude unmeasured values from metric rankings or
place them last, rather than treating them as zero.

`ExperimentResult.relativeImprovement` is now `number | null`, returning null
when the control has no samples or has a measured zero success rate. The
`relativeImprovementMeasured` field has been removed. Check the value for null
and display `'-'` for undefined lift. Use the existing `control.n` to distinguish
no control samples (`0`) from a measured zero baseline (`> 0`); measured zero
lift still returns numeric `0`.

```diff
-const lift = result.relativeImprovementMeasured
-  ? `${(result.relativeImprovement * 100).toFixed(1)}%`
-  : '-';
+const lift = result.relativeImprovement === null
+  ? '-'
+  : `${(result.relativeImprovement * 100).toFixed(1)}%`;
```
