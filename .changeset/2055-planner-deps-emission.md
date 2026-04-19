---
'nexus-agents': minor
---

feat(orchestration): emit dependsOn from planAgentTeam (#2055)

Makes the #2049 integration actually active. `planAgentTeam` now
populates `dependsOn` on each `AgentPlanEntry` whose role has
declared dependencies in the existing `EXPERT_DEPENDENCIES` map,
filtered to roles actually present in the plan.

- `assignDependencyAwareWaves` previously only mutated the `wave`
  number; now it also sets `dependsOn` (filtered to present deps)
- `applyDependencyWaves` in `worker-dispatcher.ts` (#2049) now sees
  these edges and runs `topologicalWaveAssign` — end-to-end DAG
  dispatch is live without any caller-side change
- Never emits empty arrays — the field is either absent or
  has ≥1 role
- 3 new tests confirm emission, absence on degenerate plans, and
  no-empty-arrays contract
- 66 existing agent-planner tests pass unchanged

Closes the dormant integration path from #2049. SWE-bench runs and
other orchestrate paths now get dependency-aware wave ordering for
free.
