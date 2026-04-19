---
'nexus-agents': minor
---

feat(orchestrate): wire structured task state into orchestration lifecycle (#2043 / #2033)

Integration follow-up for #2033. The orchestrate MCP tool now records
lifecycle events (init → executing → complete | blocked) into the
structured task state log when `NEXUS_TASK_STATE_ENABLED=1` is set.

- New helpers `recordTaskStateInit`, `recordTaskStateStage`,
  `recordTaskStateBlocker` in orchestrate.ts. Each checks the env flag
  first and is a no-op when unset; zero behavior change by default.
- Wired into `executeOrchestration`:
  - Init on entry with stage `planning`
  - Stage update to `executing` before `orchestrator.execute`
  - On failure: append blocker + stage `blocked`
  - On success: stage `complete`
  - On exception: append blocker + stage `blocked`
- All helpers wrap the underlying Result-returning functions and log
  failures via `logger.warn` — orchestration never fails because the
  state log couldn't be written.

6 new tests cover the env gate, the success lifecycle (3 entries),
the failure lifecycle (4 entries including blocker), and the
never-throws contract on filesystem errors.
