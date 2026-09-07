---
'nexus-agents': patch
---

learning: `recommendedSampleSize` now says whether its baseline was measured (#5857)

`ExperimentResult.recommendedSampleSize` answers "how much more traffic do I need?" — the question an operator asks exactly when `hasMinimumSampleSize` is false. It was computed from `control.successRate`, which `calculateVariantStats` produces as `n > 0 ? successes / n : 0`, so a control with **no observations** and a control that genuinely measured 0% both hand `calculateMinSampleSize` the same `0`. For a 10% minimum detectable effect the unmeasured case reports **74** where the same experiment with a measured 50% control reports **391**: real arithmetic over a fabricated input, 5.3× too small, in the direction that tells the operator to stop collecting.

The file already knew this could happen — `relativeImprovementMeasured` was added two lines above for the same value. `ExperimentResult` now also carries `recommendedSampleSizeMeasured`.

The two markers are deliberately **not** one shared flag, and their gates differ: this one is `control.n > 0`, because a control of 0/50 is a measured baseline of 0.0 and a legitimate input to a power calculation, while the *ratio over* that same rate still does not exist. A test pins the input where the two disagree.
