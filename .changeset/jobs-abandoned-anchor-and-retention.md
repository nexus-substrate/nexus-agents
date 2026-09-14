---
'nexus-agents': minor
---

`get_job_result` now judges a `pending` job abandoned against the runaway guard the job actually ran under, and the job store gets a retention sweep.

Since 8.54.5 an operator can raise the async job-body guard to two hours with `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` or `NEXUS_TIMEOUT_MULTIPLIER`, but `abandoned` was still computed against the declared one-hour base — so a job 61 minutes into a live two-hour body was reported abandoned while its guard had 59 minutes left. The check now resolves the same guard `runAsJob` applies, plus 30 seconds of slack for the terminal write, and re-resolves it on every read.

Job records under `<data dir>/jobs/` were never removed. A sweep now runs once per process per hour before an async dispatch, and on demand via `nexus-agents jobs prune [--dry-run]`, which prints the counts. Terminal records (`complete`, `failed`, `cancelled`) settled more than seven days ago are deleted. A `pending` record older than both the guard and the window is rewritten as `failed` with the new optional `errorKind: 'abandoned'` field rather than deleted, so the evidence that the dispatch happened survives; `pending` records inside the window are left alone. Files that do not parse are counted as `unreadable` and never touched. An idempotency key older than the window whose job record is gone is removed with it, so a stale key cannot replay a job `get_job_result` can no longer find.
