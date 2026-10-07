---
'nexus-agents': patch
---

`nexus-agents learning-metrics` no longer reports an absent measurement as a zero. With zero routings, `Success Rate` and `Avg Reward` print `unmeasured (0 routings)` instead of `0.0%` / `0.000`, and `Correlation Rate` prints `unmeasured (0 decisions)` when no decisions were recorded.

Each per-model line now names its sources. The reward comes from the LinUCB arm (`bandit`) or, for a model the bandit has no arm for, from the routing collector (`routing`). Success rate and selection share always come from the routing collector. A side with no samples prints as unmeasured. The old `reward: 0.70 | success: 0%` now reads `reward: 0.70 (bandit, 12 pulls) | success: unmeasured (0 routings)`. `ModelLearningStats` gains `rewardSource` and `routingSelectionCount`, so `--json` consumers can tell the two cases apart.

`learning-metrics --help` now prints the command's own help instead of the top-level help. `--json` now selects JSON output; before, the CLI ignored it and printed ASCII. `--export <path>` now always writes JSON, as its documentation states.
