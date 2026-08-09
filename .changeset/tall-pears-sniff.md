---
'nexus-agents': patch
---

fix: stop three fail-open sites reporting failed work as success (#4362)

Increment 1 of the unanimous Option C decision on #4351. Each site let a failure
that was detected somewhere in the stack reach the caller as a success:

- **`pipeline/pipeline-graph.ts`** — `createNodeHandler` discarded
  `StageOutput.success`/`.error`, so a stage that failed cleanly was
  indistinguishable from one that succeeded. It now throws a `StageFailureError`,
  routing the failure through the graph executor's existing channel
  (`NodeResult.status: 'failed'`).
- **`pipeline/graph-pipeline-runner.ts`** — `executeAndReport` derived `success`
  from "the BSP loop returned", never inspecting `nodeResults`. It now reports
  `success: false` when any node failed, names the failed stage ids, and keeps the
  partial `finalState`.
- **`mcp/tools/run-tool.ts`** — `executeRunBody` wrapped any resolved dispatch in
  `toolSuccess`. It now returns a `business` error when the engine reported its own
  failure (`success: false` from the pipeline engines, `completed: false` from the
  dev pipeline), and the async path rejects so the job records `failed` rather than
  `complete`. A `rejected` consensus verdict stays a success — it is the answer the
  caller asked for, not a fault.
- **`mcp/tools/consensus-vote.ts`** — `dispatchAsyncConsensusVote` passed
  `handleConsensusVote`'s `{ ok: false }` straight into `runAsJob`, which records
  `complete` for anything that resolves; a dead voter panel therefore produced a job
  a caller read as successful. It now rejects, mirroring the sync path.

The throw-based mechanism was chosen by `consensus_vote` (`higher_order`, 7/0) over
adding a parallel error key to graph state. No behaviour changes on any wired
template: every in-tree template is a linear chain, and the only production producer
of `StageOutput` already wrote `null` on failure.
