---
'nexus-agents': minor
---

**feat(jobs):** cross-tool concurrency cap + `list_jobs` MCP tool (Stage 5 of #2631).

**Final stage of epic #2631** — closes the async-mode build series (#3048 / #3061 / #3063 / #3064 → this PR).

## Changes

### Cross-tool global concurrency cap

`getGlobalJobCap()` + `getTotalInFlight()` added to `mcp/jobs/job-concurrency.ts`. `tryAcquire` now enforces BOTH the per-tool cap (existed) AND the global cross-tool cap (new). Defensive backstop the Contrarian vote on #3041 specifically called for: prevents 5 tools × 3 jobs each saturating the host's adapter slots even when each per-tool cap is satisfied.

- Default cap: **10** (`DEFAULT_GLOBAL_JOB_CAP`). Comfortably above the sum of per-tool defaults (3+3+2+4=12 is also fine because no realistic workload fills every tool simultaneously) but stops runaway parallel fan-outs.
- Env override: `NEXUS_JOB_MAX_CONCURRENT_TOTAL`. `0` disables async-mode across ALL tools simultaneously.

### `list_jobs` MCP tool (40th tool)

Cross-session discovery surface. Walks `<NEXUS_DATA_DIR>/jobs/result-*.json` and returns one `JobSummary` per record — jobId, toolName, status, timestamps, hasError. Filters by `toolName` (exact match) and `status` (`pending | complete | failed | cancelled`). `limit` capped at 200. Newest-first sort matches the typical "what just happened" discovery flow.

**Result payloads are intentionally excluded from summaries** — large `complete` records can be 1 MiB each (per Stage 2's `TASK_RESULT_MAX_BYTES` cap), and `list_jobs` is meant for discovery, not retrieval. Callers fetch full records via `get_job_result(jobId)`.

Registered through every dispatch surface: `cli-server-tools.ts` STANDALONE_TOOLS, `mcp/tools/index.ts` REGISTERED_TOOL_NAMES + EXPECTED_TOOL_NAMES, both tool-annotation tables, the security RISKY_TOOLS_ALLOWLIST (read-only), and `scripts/tool-descriptions-data.ts` (long + README forms). Tool count: 39 → 40.

## Why this completes the epic

The original epic #2631 listed five open questions; the staged build answered each:

| Open question                                                                     | Resolution                                                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Discovery — how does the caller find a job they kicked off in a previous session? | **This PR** — `list_jobs` walks the sidecar dir; cross-session discoverable.                                                        |
| Cancellation                                                                      | `cancel_job` is a separate deferred PR under Stage 1 (#3042). AbortSignal plumbing from #3035/#3038.                                |
| Resource limits                                                                   | Stage 3 added per-tool caps (#3044); **this PR** adds the global cross-tool cap.                                                    |
| Notification on completion                                                        | Polling via `get_job_result` (Stage 1, #3048). MCP doesn't have push-after-request semantics so the deferred-by-vote answer stands. |
| Backpressure                                                                      | Stages 3 + 5 — `busy` envelope with `retryAfterMs` synchronous when caps fill.                                                      |

## Lifecycle invariants (next-contributor flags)

1. **Both caps must pass** to acquire a slot — per-tool AND global. A future caller can't accidentally weaken this by checking only one.
2. **`getTotalInFlight()` sums across all tools** — used by both the cap check and observability. If it drifts (negative count, stale entries), `tryAcquire` would either over-admit or under-admit; tests guard this.
3. **`list_jobs` result-payload exclusion is by design** — the JobSummary shape doesn't include `result`. A future contributor wanting to "make it easier" by inlining the payload would re-introduce the 1 MiB × N response size that the size discipline was protecting against.

## Tests

- 6 new `list-jobs-tool.test.ts` schema cases (input validation across `toolName`/`status`/`limit`).
- 7 new `list-jobs-tool.test.ts` integration cases (empty dir, summary shape excludes payload, newest-first sort, status preservation, hasError flag, non-matching filenames defensively skipped).
- 7 new `job-concurrency.test.ts` global-cap cases (default, env override, non-numeric fallback, cap=0 disables all tools, global blocks across tools, release frees slot, getTotalInFlight sums).
- Existing tool-count assertions bumped 39 → 40 (`EXPECTED_TOOL_COUNT`, `TOOL_ANNOTATIONS`, `REGISTERED_TOOLS` in tests).
- 72 targeted tests pass (`src/cli-server-tools.test.ts`, `src/mcp/jobs/`, `src/mcp/tools/list-jobs-tool.test.ts`); `tsc` + `eslint` clean.

## What's still open under the umbrella

- **`cancel_job` MCP tool** — Stage 1b under #3042. Reserved status enum (`cancelled`) and dispatcher cancellation paths are already in place from Stages 1 + 4. Just needs the tool wrapper.
- **`idempotencyKey` + sha256 replay-safe re-invocation** — Stage 1c under #3042.
- **Sidecar→Stage 2 schema migration** — separate small PR. Migrates the 3 writers (orchestrate / run_workflow / consensus_vote) from `mcp/jobs/job-result-store.ts` to `appendResult` / `appendCancellation` from #3061. Deprecates the sidecar.
- **execute_expert sidecar evaluation** — #3065 (deferred unless real use case shows up; SDK Tasks primitive already covers async there).

## A/B-measurement reminder

After this PR + Stages 3-4 ship in v2.85.0, re-run `scripts/analyze-timeout-mismatch.ts`. Async-mode invocations of `run_workflow` / `consensus_vote` / `orchestrate` should NOT show up in the timeout-shaped-error column. If the rate doesn't drop materially over 1-2 weeks, the design didn't address the root cause and the epic should re-vote (per the #3041 decision-binding clause).
