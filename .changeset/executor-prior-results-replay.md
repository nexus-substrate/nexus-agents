---
'nexus-agents': patch
---

feat(graph): add priorResults replay to executeGraph (selective-retry slice 2)

`GraphExecuteOptions.priorResults` lets a caller pass prior NodeResults; the
executor replays any node with a `success` entry (reusing its stateUpdates so
downstream state is faithful) instead of re-executing it, while failed/absent
nodes run fresh. Additive/optional — no behavior change without the option.
Foundation primitive for `retryFailed` to re-run only failed nodes (slice 3, #3534).
