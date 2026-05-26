---
'nexus-agents': minor
---

**feat(state):** `StructuredTaskState` gains `version`, `result`, `cancellation` fields (Stage 2 of #2631).

Stage 2 of 5 in the async-mode build (epic #2631, design vote approved 7-0 on #3041). Adds the schema fields the rest of the async-mode pattern reads/writes. Backward-compatible by construction.

## Schema additions

```ts
{
  // ...existing fields
  /** Monotonic ++1 on every write. Backward-compat: missing = 0. */
  version?: number,
  /** Tool result payload, set via `appendResult` (capped at 1 MiB). */
  result?: unknown,
  /** Set via `appendCancellation`; append-only — first one wins. */
  cancellation?: { requestedAt: string; reason?: string },
}
```

Two new log-entry variants on `StructuredTaskLogEntrySchema`:

- `{ event: 'result', ts, result: unknown }`
- `{ event: 'cancellation', ts, cancellation: { requestedAt, reason? } }`

Two new helpers on `structured-task-state.ts`:

- `appendResult(taskId, result, ts, customDir?)` — JSON-serializes the payload, measures `Buffer.byteLength` (UTF-8 bytes, not JS code units), truncates over-cap writes to `{ truncated: true, originalBytes, maxBytes, note }`. Returns `err` cleanly on non-serializable inputs (BigInt etc.).
- `appendCancellation(taskId, cancellation, customDir?)` — writes the marker. Reducer keeps the FIRST cancellation in memory across duplicate events (audit-trail-only).

## Backward compatibility (the invariant that keeps Stage 1 polling clients alive)

`version` is optional in the schema; the reducer treats missing as `0`. A polling client written against pre-Stage-2 nexus-agents reading post-Stage-2 logs sees `version` show up; a post-Stage-2 client reading pre-Stage-2 logs sees `version: 0`. Either direction works.

## Lifecycle invariants (next-contributor flags)

Two contracts shipped here that are hard to walk back:

1. **`version` is monotonic and 1-per-event.** Every non-init log entry bumps version by exactly 1. Even an append-only-blocked cancellation (second one ignored in state) still bumps version so polling clients can observe the log grew. Don't change to "only bump on visible state change" — that would lose audit visibility.
2. **`cancellation` is first-wins in memory.** Disk keeps every cancellation event for audit, but `state.cancellation` is whichever request landed first. A malicious or buggy double-cancel can't rewrite the requestedAt timestamp.

## Result size cap (security flag from #3041 vote)

`TASK_RESULT_MAX_BYTES = 1_048_576` (1 MiB). Over-cap payloads get the truncation marker, not silent drop — caller can tell "result was dropped at write" vs "result was never written." Caps result-retention DoS where a misbehaving tool could write a 100 MiB blob and block reads of every other task on the data dir.

## Tests

10 new cases in `structured-task-state.test.ts`:

- Monotonic version starts at 0, increments on every event, two consecutive events reach v2 (catches a one-time bump-at-end bug).
- Backward-compat: old-shape state log without `version` reduces to v0.
- `appendResult` writes payload visible after `readTaskState`, version bumps.
- `appendResult` truncates over-cap payloads to a typed marker.
- `appendResult` measures UTF-8 bytes (emoji-heavy payload trips the cap even with low JS code-unit length).
- `appendResult` returns `err` cleanly on serialization failure (BigInt).
- `appendCancellation` writes marker visible after read.
- `appendCancellation` append-only — second event doesn't overwrite first `requestedAt`, but version still bumps so audit growth is observable.

1,195 targeted tests pass (`src/context/`, `src/mcp/tools/orchestrate.test.ts`, `src/mcp/tools/query-task-state-tool.test.ts`, `src/mcp/jobs/`); `tsc` + `eslint` clean.

## What's next (Stage 3, #3044)

`run_workflow` async-mode lands next — that PR migrates the orchestrate async-mode writer from the Stage-1 sidecar (`mcp/jobs/job-result-store.ts`) to `appendResult` / `appendCancellation`, then ships async-mode for `run_workflow` itself. After Stage 3 lands, the sidecar files become legacy that the next cleanup sweep removes (per the Stage 1 PR's note).
