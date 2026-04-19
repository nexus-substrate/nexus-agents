---
'nexus-agents': minor
---

feat(orchestration): wire topological wave recomputation into worker-dispatcher (#2043 / #2034)

Integration follow-up for #2034. The pure utility has been live since
#2038; this PR makes it take effect in real dispatch:

- Adds optional `dependsOn?: readonly BuiltInExpertType[]` field on
  `AgentPlanEntry`. Absent or empty → entry keeps its priority-based
  wave assignment; pre-dependsOn plans are unaffected.
- New `applyDependencyWaves(entries)` helper in `worker-dispatcher.ts`
  checks whether any entry declares `dependsOn`; if yes, runs the plan
  through `topologicalWaveAssign` before dispatch; if no, returns the
  plan unchanged by identity.
- `dispatchWorkers` calls `applyDependencyWaves` before `groupByWave`,
  so the live pipeline now respects DAG edges.
- Fallback policy: cycles or missing refs log a warning and revert to
  the original priority-based assignment — dispatch never fails because
  the plan's dependency graph is malformed.
- 6 new integration tests cover: unchanged pass-through, linear chain,
  diamond grouping, cycle fallback, missing-ref fallback, empty plan.
- 133 existing aorchestra tests still pass unchanged.

Planner-side emission of `dependsOn` (so `planAgentTeam` actually
produces DAGs) is a deliberate follow-up — this PR establishes the
consumer contract so custom planners and trigger-table authors can
start producing DAGs today.

Remaining from #2043: verify-loop integration (#2032) into agent-runner.
