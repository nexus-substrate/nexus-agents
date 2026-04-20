---
'nexus-agents': minor
---

feat(swe-bench): wire ClawGuard + structured task state into runAgentOnInstance (#1414)

Phase 5 progress for #1414. The SWE-bench runner now participates in
the same ClawGuard audit + structured-task-state journaling that the
orchestrate path gained in v2.50.

- `runAgentOnInstance` wraps the iteration loop in
  `withAccessPolicy(policy, ...)` after deriving a per-instance policy
  from the first 500 chars of `problem_statement`
- New helpers `deriveRunnerAccessPolicy`, `recordRunnerTaskInit`,
  `recordRunnerTaskFinal` mirror the pattern from orchestrate.ts;
  each is env-flag-gated (reuses `NEXUS_ACCESS_POLICY_MODE` and
  `NEXUS_TASK_STATE_ENABLED` from v2.50)
- Task state log captures lifecycle per instance:
  `planning → executing → (complete | blocked)`, with blockers
  recorded when the runner reports an error
- Derivation + recording never throw; they log and continue so a
  runner regression cannot take down a SWE-bench sweep

3 new integration tests cover policy shape on instance inputs;
existing 13 agent-runner tests unchanged.

Remaining #1414 work: `HarnessVerifyAdapter` wiring in
`createExecutor` (option 1) and pre-flight `research_query` hook
(option 3) — tracked as follow-up tasks.
