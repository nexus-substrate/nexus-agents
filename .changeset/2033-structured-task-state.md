---
'nexus-agents': minor
---

feat(context): structured task state with append-only JSONL log (#2033)

Adds a per-task state module that lets long-running orchestration
tasks record decisions, blockers, stage transitions, and position in
an append-only log keyed by taskId. The log replays forward into a
current `StructuredTaskState` snapshot, so resume-after-restart
reads the latest state without replaying everything.

Replaces ad-hoc `memory_write` calls for multi-step orchestration
per the GSD STATE.md pattern. No new MCP tool yet — pure
filesystem + reducer foundation so downstream work can choose
whether to surface it as MCP, CLI, or programmatic.

- `StructuredTaskStateSchema` + `StructuredTaskLogEntrySchema` (Zod)
  - Stages: `planning | executing | verifying | complete | blocked`
  - Entry types: `init | decision | blocker | blocker_resolved | stage | position`
- `initTaskState` / `appendDecision` / `appendBlocker` /
  `resolveBlocker` / `updateStage` / `updatePosition` helpers
- `readTaskState` reduces the log to the final snapshot
- `reduceLogEntries` pure reducer (exported for tests and callers
  that want to fold an in-memory sequence)
- Path-traversal safe; taskId validated before any filesystem
  operation
- Storage: `~/.nexus-agents/tasks/state-{taskId}.jsonl` (directory
  mode 0o700, file mode 0o600)

12 tests cover round-trip, missing init, append + resolve,
reducer purity, path-traversal rejection, and malformed-line
resilience.

Child of #1574 (SWE-bench Verified prep) via #2030.
