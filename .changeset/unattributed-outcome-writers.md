---
'nexus-agents': patch
---

fix(learning): stop execute_spec and run_graph_workflow crediting claude

Both tools appended a `TaskOutcome` with `cli: DEFAULT_CLI` — 'claude' — while
recording a synthetic `model` label (`'spec-executor'`, `'graph-workflow'`).
Neither knows which CLI served the work, so every run credited or debited claude
in the routing learner: the same fabrication #5003 fixed in the feedback bridge,
on two live tool paths.

`'unknown'` is the value `OutcomeCliSchema` already defines for this case, and
the bandit's warm-start partitions it out rather than replaying it (#4935), so
these runs stop moving any arm's measured success rate.
