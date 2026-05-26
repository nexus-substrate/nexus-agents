---
'nexus-agents': minor
---

**feat(consensus_vote):** async-mode dispatch (Stage 4 of #2631).

Stage 4 of 5 in the async-mode build (epic #2631). `consensus_vote` joins `orchestrate` (Stage 1, #3048) and `run_workflow` (Stage 3, #3063) on the unified async-mode protocol.

## Surface

`consensus_vote` gains `mode?: 'sync' | 'async'` matching the Stage 1 + Stage 3 shape. Default sync — backward-compat invariant; schema omits `.default('sync')` so the inferred type stays optional and existing fixtures don't churn.

- `mode: 'async'` returns `{ status: 'pending', jobId, pollTool: 'get_job_result' }` immediately.
- Background dispatch runs the existing `handleConsensusVote` end-to-end — 7-voter fan-out, error policy, correlation persistence all unchanged.
- Result written to the Stage-1 sidecar (`mcp/jobs/job-result-store.ts`).
- Per-tool cap via `NEXUS_JOB_MAX_CONCURRENT_CONSENSUS_VOTE` (default **2**, lower than orchestrate's 3 because voting is 7-fan-out and concurrent jobs multiply adapter load fast).
- Over-cap returns `{ status: 'busy', retryAfterMs }` synchronously.

## What's covered + what's deferred

**In this PR:** `consensus_vote` async-mode.

**Not in this PR (intentional):** `execute_expert` async-mode. Investigation showed it ALREADY has async via MCP SDK Tasks primitive (SEP-1686) — registered via `server.experimental.tasks.registerToolTask` with `taskSupport: 'optional'`. The sidecar pattern this epic ships is for explicit-polling clients; the SDK Tasks primitive is for auto-polling clients. Both serve valid use cases and coexist. Forcing a third pattern (`mode: 'async'` via sidecar) onto `execute_expert` would create overlapping facilities with no functional gain. Filing as #3064 follow-up if a use case demonstrates the need.

## Cancellation semantics (#3041 vote deferred this to Stage 4)

When `cancel_job` lands while a vote is in-flight, the existing `collectRealVotes` collector unwinds via the AbortSignal plumbing from #3038 (per-voter signals). The dispatcher writes whatever partial vote set landed before the abort as the job result — preserves audit visibility into who voted before the cancel happened. The full `cancel_job` MCP tool is still part of the deferred Stage 1b under #3042; once that lands, this dispatcher path picks it up without further changes.

## Refactor note

`createConsensusVoteHandler` was extracted into a 3-piece structure: validation → branch on mode → dispatch helper. The sync path moved into `runSyncConsensusVote` to keep both branches readable + within the per-function size cap as the handler grew.

## Tests

4 new schema tests on `consensus-vote.test.ts`: accepts `'async'`/`'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode values.

- 60 wider consensus-vote tests pass (was 56 — 4 new).
- 84 targeted tests pass (`consensus-vote.test.ts`, `mcp/jobs/`); `tsc` + `eslint` clean.

## What's next

**Stage 5, #3046** — cross-tool concurrency cap + `list_jobs` MCP tool (per-session discovery). Final stage of the epic.

**Sidecar→Stage 2 schema migration** — separate small PR. Migrates the 3 writers (orchestrate, run_workflow, consensus_vote) from `mcp/jobs/job-result-store.ts` to `appendResult` / `appendCancellation` from #3061. Deprecates the sidecar.
