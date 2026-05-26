---
'nexus-agents': minor
---

**feat(jobs):** `idempotencyKey` for async-mode dispatch (#3042 Stage 1c / epic #2631).

Final piece of #3042. The three async-mode-enabled tools (`orchestrate`, `run_workflow`, `consensus_vote`) now accept an optional `idempotencyKey?: string` (max 256 chars). Lets a caller re-invoke the same logical operation safely across process restarts / session reconnects without double-dispatching.

## Contract

- Same `(tool, idempotencyKey, inputs)` → `{ status: 'replay', jobId }` pointing at the existing job. Caller polls `get_job_result(jobId)` exactly as if it had dispatched fresh and gets whatever state the job is in (pending / complete / failed / cancelled).
- Same `(tool, idempotencyKey)` + DIFFERENT inputs → fails closed with a validation error referencing the existing jobId. Reusing a key with different inputs is almost certainly a caller bug; silent merge would either hide a typo or leak the first call's result into a second logical operation.
- No `idempotencyKey` → caller falls back to a fresh `randomUUID()` jobId (existing behavior; no schema impact).

## Storage

One file per `(tool, key)` tuple at `<NEXUS_DATA_DIR>/jobs/key-<sha256(tool + ':' + key)>.json`:

```json
{
  "v": 1,
  "tool": "orchestrate",
  "key": "<user-key>",
  "inputsHash": "<sha256>",
  "jobId": "job-orchestrate-<16-hex>",
  "createdAt": "<iso>"
}
```

The filename is hashed so a directory listing doesn't leak user-supplied keys. The on-disk record retains the cleartext key for debugging — same trust boundary as the result sidecar.

## Determinism guarantees

- JobId for a keyed dispatch is derived as `job-<tool>-<sha256(tool:key:inputsHash)[:16]>`. Two concurrent dispatches with the same `(tool, key, inputs)` converge on the same id even if both miss the index-lookup race.
- Input hashing uses a canonical JSON serializer that sorts object keys recursively, so `{a:1,b:2}` and `{b:2,a:1}` produce identical hashes. Array order is significant. `undefined` values are dropped (JSON semantics).

## Security tests (per #3041 vote flag)

- Replay across sessions: same (tool, key, inputs) from different processes returns the same jobId.
- Replay survives input-object key reordering.
- Collision: same key + different inputs returns the `collision` envelope with both hashes.
- Concurrent dispatch race: `registerIdempotentJob` is idempotent and never overwrites an existing entry with a different jobId.

## Caller hot-path order

`shortCircuitOrFreshJobId` runs BEFORE `tryAcquire('<tool>')`. A replay or collision must not burn a concurrency slot the live caller could use.

## Out of scope

- Cross-process index locking. The current design relies on filesystem write-then-rename semantics + the deterministic jobId derivation; under heavy contention two concurrent dispatches may both write `pending` records, but they converge on the same jobId so the polling client sees one record either way. Adding `flock` is tracked separately if telemetry shows duplicate dispatches.
- `cancel_job` interaction. A replayed job that's already cancelled returns its cancelled record via `get_job_result` — caller can decide whether to re-dispatch with a fresh key or surface the cancellation. No special replay-of-cancelled semantic was requested in the vote.

## Tests

16 new cases in `mcp/jobs/job-idempotency.test.ts` covering hash determinism, fresh/replay/collision outcomes per tool, key-reorder canonicalization, and idempotent register behavior.

Lint + typecheck clean. `mcp/jobs/job-idempotency.test.ts` (16) + `orchestrate.test.ts` (42) + `run-workflow.test.ts` (~70) + `consensus-vote.test.ts` (~22) — 150 tests pass, no regressions.

## Closes

Closes #3042 (the parent issue tracking Stage 1's three pieces — async-mode, cancel_job, idempotencyKey). Stage 1 is complete. Stages 2–5 are merged or in flight separately.
