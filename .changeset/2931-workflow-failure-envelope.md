---
'nexus-agents': patch
---

**fix(workflows):** `run_workflow` failure envelope is now queryable — real `executionId` + `durationMs` instead of `'unknown'`/`0`.

Pre-fix, every timed-out or failed `run_workflow` MCP call returned `{ executionId: 'unknown', durationMs: 0, ... }`. The two values are queried by clients via `query_trace(runId=...)` and weather-report dashboards — so a hung run was effectively un-debuggable from the client side. (See #2931 for the original repro: 4 of 5 substantive calls hit the 120s step timer with `executionId: 'unknown'`.)

Root cause was a missing wire between two layers:

- `parallel-executor.ts:createStepError` builds a `WorkflowError` with `{ stepId, error }` context — the step's diagnostic, but no run-level id.
- `workflow-engine.ts:runExecution` returned that inner error as-is when steps failed, so `executionId` never reached the caller.
- `mcp/tools/run-workflow-helpers.ts:createFailedResult` hardcoded `'unknown'` and `0` for both fields.

The fix:

1. **`workflow-engine.ts:runExecution`** now wraps the inner step-failure error to enrich the context with `executionId` + elapsed `durationMs` (preserving the original message + the per-step `stepId` for diagnostic continuity).
2. **`createFailedResult`** accepts optional `{ executionId, durationMs }` opts and keeps the legacy sentinels as defaults for backwards compatibility with any other caller.
3. **`run-workflow.ts:handleRunWorkflow`** extracts both from the enriched error context via a `buildFailureEnvelope` helper (split out to keep complexity under the 10-cap).

Out of scope (filed as follow-up for #2931): item 1 (root-cause investigation of the first-step adapter hang) and item 4 (per-call `timeoutMs` parameter). Those need a separate PR — this one closes the debuggability gap so the root cause can actually be traced via `query_trace` next time.

5 regression tests added (1 in `workflow-engine.test.ts` for the enrichment, 4 in `run-workflow-helpers.test.ts` for envelope shape across opt combinations).
