---
'nexus-agents': minor
---

**feat(run_workflow):** async-mode dispatch + per-tool concurrency caps (Stage 3 of #2631).

Stage 3 of 5 in the async-mode build (epic #2631). This is the **payoff PR** — `run_workflow` is the gate-firing tool that drove the epic: per #2703 telemetry, `28.6% of run_workflow's errors were timeout-shaped` against a 900_000ms server budget while clients use the MCP-SDK 60_000ms default. Async-mode sidesteps the mismatch entirely.

## Surface

`run_workflow` gains the same `mode?: 'sync' | 'async'` param that landed on `orchestrate` in #3048. Default sync (backward-compat invariant — schema deliberately omits `.default('sync')` so the inferred type stays optional). When `mode: 'async'` + non-dry-run:

- Returns `{ status: 'pending', jobId, pollTool: 'get_job_result', note }` immediately (well under any client timeout).
- Pipeline runs on a background promise; result lands in the existing Stage-1 sidecar (`$NEXUS_DATA_DIR/jobs/result-<jobId>.json`).
- `dryRun: true` stays synchronous regardless of mode — no point backgrounding a sub-second validation.
- `timeoutMs` (#3017 per-phase override) still applies inside the background dispatch.

## Concurrency cap (per Contrarian vote flag from #3041)

New `mcp/jobs/job-concurrency.ts` primitive — in-process per-tool cap with env override. The Contrarian voter's 0.78-confidence approval was specifically gated on "caps must land before async-mode expands past orchestrate." This PR delivers that, AND retrofits orchestrate to the same primitive so both tools share the safety net.

Defaults (starting points; re-tune after observing real workloads):

- `orchestrate: 3`
- `run_workflow: 3`
- `consensus_vote: 2` (Stage 4)
- `execute_expert: 4` (Stage 4)

Env override: `NEXUS_JOB_MAX_CONCURRENT_<TOOL_UPPER>`. A value of `0` disables async-mode for that tool entirely. Invalid (non-numeric) values fall back to the default with a logged warning. Over-cap acquisitions return `{ status: 'busy', retryAfterMs }` synchronously — no jobId created.

`suggestRetryAfterMs` scales linearly with fullness, clamped to [5s, 60s].

## A/B-measurement setup

After this PR ships in the next release, re-run `scripts/analyze-timeout-mismatch.ts`. Async-mode `run_workflow` invocations should NOT show up in the timeout-shaped-error column — they finish via polling, not transport. If the timeout-shaped error rate on `run_workflow` doesn't drop materially over the following weeks, the design didn't address the root cause and Stage 4 should re-vote.

## Out of scope (deferred to a follow-up PR)

**Migrating the sidecar writers to Stage 2's `appendResult` / `appendCancellation`.** Both `orchestrate` and `run_workflow` async-mode still write to the `mcp/jobs/job-result-store.ts` sidecar shipped with #3048. Stage 2 (#3061 → v2.85.0) added the `result` / `cancellation` fields on `StructuredTaskState` that these writers can migrate to — but doing the migration in THIS PR would have doubled the surface area for review. The migration is bounded (3 call sites in orchestrate, 3 in run_workflow), has zero behavior change for polling clients (the get_job_result tool will fall through to query_task_state once migrated), and gets its own PR.

## Tests

- 12 new `job-concurrency.test.ts` cases: default cap returned, env override honored, cap=0 disables, non-numeric env falls back with warning, unknown tools get global default, acquire/release lifecycle, per-tool isolation, release-with-no-inflight is logged not crashed, suggestRetryAfterMs returns 0 for disabled tools / scales with load.
- 4 new `run-workflow.test.ts` schema cases: accepts `'async'`, accepts `'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode value.
- 90 targeted tests pass (`src/mcp/jobs/`, `src/mcp/tools/run-workflow.test.ts`, `src/mcp/tools/orchestrate.test.ts`); `tsc` + `eslint` clean.

## Lifecycle invariants

1. **`mode: 'sync'` stays default forever** (same as #3048).
2. **`tryAcquire` returning true requires exactly one matching `release`** in a `finally` — both orchestrate (#3048-retrofit) and run_workflow (new) follow this. Release-without-acquire logs a caller-bug warning, doesn't crash, doesn't underflow.
3. **`busy` response carries `retryAfterMs`** — clients implementing backoff should honor it (linear scaling, clamped to [5s, 60s]).

## What's next

**Stage 4, #3045** — `consensus_vote` and `execute_expert` async-mode. Inherits the same cap primitive + sidecar; cancellation semantics (mid-vote / mid-execution) are the new design surface.

**Migration PR** — sidecar writers → Stage 2 schema. Drops `mcp/jobs/job-result-store.ts` once both consumers are migrated.
