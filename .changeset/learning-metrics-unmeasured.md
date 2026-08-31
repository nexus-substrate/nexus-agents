---
'nexus-agents': patch
---

fix(cli): learning-metrics no longer reports a green ✓ "exploiting" over zero data (#5267)

`cli-commands-handlers.ts` calls `learningMetricsCommand(options)` with **no
second `context` argument**, and no production caller supplies one. So
`gatherLearningMetrics` always took its fallback —
`?? { totalPulls: 0, explorationRatio: 0, … }` — and `explorationRatio: 0` is
`< 0.3`, which produced `learningStatus: 'exploiting'`, rendered with a **green
✓**.

The CLI reported that the bandit had converged past exploration into
exploitation — the strongest positive signal on the screen — when the bandit was
never consulted.

`learningStatus` gains `'unmeasured'`, guarded on `totalPulls === 0`. That keys
the verdict on the input it actually depends on, and covers both cases: no
bandit supplied, and a real bandit that has pulled nothing. The renderer shows
`? Learning Status: unmeasured (no routing decisions recorded)` — never the green
check.

**Two tests pinned the defect.** One was named `summary shows exploring status
for high exploration ratio`, asserted `'exploiting'`, and carried a comment
explaining the mechanism: *"When all sources undefined, exploration ratio is 0 →
exploiting"*. The other whitelisted `['exploring', 'exploiting', 'balanced']`, so
it would have failed on the honest value while passing on the fabricated one.

Internal only — `learningStatus` is not on the published API surface, so widening
the union is not breaking.

Making these two surfaces reflect the router's *real* bandit state is tracked
separately in #5275, which also records why "extract the warm-start" may be the
wrong shape for it.
