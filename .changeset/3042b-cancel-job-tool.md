---
'nexus-agents': minor
---

**feat(jobs):** `cancel_job` MCP tool (#3042 Stage 1b / epic #2631).

Cancellation tool for the async-mode pattern. Returns to close the Stage-1 follow-up reserved under #3042 (the cancel piece deferred when #3048 shipped the protocol skeleton).

## Surface

`cancel_job({ jobId, reason? })` — returns a discriminated `CancelJobResponse` with one of four outcomes:

- **`cancelled`** — the job was `pending` and is now `cancelled`. The dispatching process's in-flight `AbortController` (already wired in Stages 1/3/4) is the actual stop signal for same-process work; this tool writes the durable cancellation record so cross-session pollers can observe.
- **`already_complete`** — job is already `complete` / `failed`. The terminal record is preserved (Security flag from the #3041 vote: cancel-after-complete must NOT rewrite history). The original result payload + error context are intact.
- **`already_cancelled`** — second + cancellation against the same jobId is a no-op. Idempotent for safe retry.
- **`unknown_job`** — no record found for the jobId. Sidecar file missing or unreadable.

## What this tool does NOT do

- **Cross-process abort.** Per-process AbortControllers can only signal what they own. For a multi-process deployment, the durable cancellation record is observable via `get_job_result` and `list_jobs`, but the worker process needs to poll for it (future work; not part of this PR).
- **Result deletion.** Once a job is `complete`, the result payload stays in the sidecar — cancel doesn't redact it.

## Lifecycle invariants (next-contributor flags)

1. **`already_complete` MUST NOT overwrite the terminal record.** Security flag from #3041 vote — if a future contributor "simplifies" the handler to always call `writeJobCancelled`, the post-complete cancel-then-poll race would erase the original result. Test covers this.
2. **`cancelled` writes the same JSON shape as other terminal records.** `JobResult.status === 'cancelled'` lets clients treat it as a terminal state (no further polling needed).

## What's still open under the umbrella

- **Stage 1c — `idempotencyKey`** (sha256 replay-safe re-invocation). Final piece of #3042.
- **Cross-process cancel propagation** — workers polling `get_job_result` mid-execution to honor cancellation. Future work, separate issue.
- **Sidecar→Stage 2 schema migration** — moves async-mode writers to `appendResult` / `appendCancellation` from #3061. Separate small PR.

## Tests

- 4 schema cases (jobId required, reason optional + length-bounded).
- 3 store-integration cases (writeJobCancelled visible after read, preserves createdAt, omits error when reason undefined).
- 5 outcome cases (cancel pending → cancelled; cancel-after-complete preserves result; cancel-after-fail preserves error; second cancel = already_cancelled; unknown_job).
- Existing tool-count assertions bumped 39 → 40 (`EXPECTED_TOOL_COUNT`, `TOOL_ANNOTATIONS`, `REGISTERED_TOOLS`).
- 150 targeted tests pass (`src/mcp/jobs/`, `src/mcp/tools/cancel-job-tool.test.ts`, `index.test.ts`, `tool-annotations.test.ts`, `cli-server-tools.test.ts`); `tsc` + `eslint` clean.

## Note on tool count

This PR adds `cancel_job` as the 40th tool, parallel to #3066 (Stage 5) which adds `list_jobs` as ALSO the 40th. Whichever merges first claims #40; the other rebases to #41. The count assertions in tests will need a rebase pass from the loser.
