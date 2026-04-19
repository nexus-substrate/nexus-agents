---
'nexus-agents': minor
---

feat(mcp): query_task_state tool for reading structured task logs (#2046)

Closes the loop on the #2033 structured-task-state pipeline. The
orchestrate tool (#2045) writes state to JSONL logs; the new
`query_task_state` MCP tool reads them back and returns the current
snapshot.

- New tool at `mcp/tools/query-task-state-tool.ts` following the
  `query_trace` pattern (secure handler, rate limiter, timeout guard).
- Uses `readTaskState` from `context/structured-task-state.ts`, so
  path-traversal validation and malformed-line resilience are
  inherited.
- Non-throwing error contract: missing logs or validation failures
  return `{found: false, errorMessage: ...}` inside a successful
  tool result rather than raising.
- Wired into `cli-server-tools.ts` dispatcher, `mcp/tools/index.ts`
  barrel, `mcp/index.ts` re-exports, and tools array.
- 5 tests for input schema + registration; existing tools-index and
  cli-server-tools tests updated to expect 31 tools (was 30).

Closes #2046.
