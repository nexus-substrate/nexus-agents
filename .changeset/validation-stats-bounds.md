---
'nexus-agents': patch
---

Two statistics in the learning loop were computable outside their own range. `pValue` could exceed 1 across the whole near-null region, because the continuity correction was subtracted from the difference before the division and a negative z was then doubled as an upper tail; the corrected statistic is now clamped at 0. `recommendedSampleSize` was ~56% too high, because `getZScore` applies the two-tail transform itself and was being handed already-transformed arguments; a one-tailed `zQuantile` primitive now backs both.
