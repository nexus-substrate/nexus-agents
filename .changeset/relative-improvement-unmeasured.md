---
'nexus-agents': minor
---

`ExperimentResult` now says whether `relativeImprovement` was measurable. A
control that recorded 0 successes is a real measurement; the ratio over it is
unbounded, and the `0` fallback sits on the same numeric scale as a genuine
result — so a change from 0% to 50% was reported as "0.0% improvement" with no
way for a consumer to tell it from a measured no-difference. The number is
unchanged for compatibility; `relativeImprovementMeasured` says whether to
believe it.
