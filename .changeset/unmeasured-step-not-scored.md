---
'nexus-agents': minor
---

stop rewarding a step for having no measured token usage

`computeStepReward` penalises a step by `tokensUsed * rate`, so a step whose
adapter reported no usage received **no cost penalty at all** and scored as more
efficient than one that reported honestly. The reward preferred the step it knew
least about, and the same zero under-accumulated into `totalCost` / `totalTokens`.

Decided by a 7-voter `higher_order` panel (4/6): refuse to score an unmeasured
step rather than impute a value for it. A per-step reward has no defensible
substitute — a mean or a worst-case invents a number for _that_ step — so it is
excluded from the trajectory the learner fits.

- `AgentStepOutput` gains `tokensMeasured`; `buildStepOutput` carries it from
  `result.metadata`.
- `computeStepReward` returns `number | null`; `null` means unscorable.
- `convertTrajectory` drops unscored steps — this is the exclusion itself.
  `convertSingleStep` returns `null` so its caller decides.
- `computeMetrics` averages over scored steps only and reports `scoredSteps`,
  so the mean is not read as covering the whole trajectory.
- `state-manager` sums measured steps only and counts the rest as
  `unmeasuredSteps`, so the totals read as the lower bound they are.

A **measured** zero is still scored: the check keys on `tokensMeasured === false`,
never on `tokensUsed === 0`. Absent means measured, so no existing producer
drops out of the trajectory.

Fixes #4766.
