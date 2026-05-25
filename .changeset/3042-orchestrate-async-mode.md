---
'nexus-agents': minor
---

**feat(orchestrate): async-mode dispatch + `get_job_result` MCP tool (Stage 1 of #2631).**

First implementation slice of epic #2631 (job-style invocation for long-running MCP tools). The async-mode design vote — `consensus_vote higher_order`, **approved 7-0 on 2026-05-25** — locked the staging order: orchestrate first, schema additions second, run_workflow third. This PR delivers Stage 1.

## What changed

- **`orchestrate` tool** gains an optional `mode: 'sync' | 'async'` param. Default behavior is unchanged — every existing sync caller sees zero difference. With `mode: 'async'`, the handler returns `{ status: 'pending', jobId }` immediately and runs the pipeline on a background promise.
- **New MCP tool `get_job_result(jobId)`** returns the structured job-result record. Status lifecycle: `pending → complete | failed | cancelled` (cancellation comes in Stage 1b under the same Stage-1 umbrella). On `complete` the record carries the same payload sync mode would have returned inline; on `failed` it carries an error message.
- **New `jobs/` subdir** in `nexusDataPath` (added to `PER_REPO_SUBDIRS` — a job dispatched on repo A shouldn't be pollable on repo B). Records serialize to `<NEXUS_DATA_DIR>/jobs/result-<jobId>.json` via a tiny `job-result-store.ts` module. Stage 2 (#3043) migrates the result inline to `StructuredTaskState`; sidecar files become legacy that the next cleanup sweep removes.
- Tool registered through every dispatch surface: `cli-server-tools.ts` STANDALONE_TOOLS, `mcp/tools/index.ts` REGISTERED_TOOLS + EXPECTED_TOOL_NAMES, both tool-annotation tables, the security `RISKY_TOOLS_ALLOWLIST` (read-only), and `scripts/tool-descriptions-data.ts` (long + README forms). Governance and repo-index regen: tool count moves 38 → 39.

## What's deferred to Stage 1b/1c (under #3042)

- `cancel_job(jobId)` MCP tool. Rides on the `AbortSignal` plumbing from #3035/#3038. Lands next; lifecycle states already reserve the `cancelled` enum so this is a non-breaking add.
- `idempotencyKey` param + sha256 lookup index. Replay-safe re-invocation returns the existing jobId rather than re-dispatching.
- `inlineDeadlineMs` short-circuit (Ilya's design constraint 3): if the work finishes inside the deadline, return the inline result instead of a jobId. Performance polish; not blocking the contract.

## Why staged this way

Per the vote's binding staging order, the polling protocol gets validated end-to-end on a tool that already writes state (`orchestrate` writes `StructuredTaskState` via `recordTaskStateInit` already) BEFORE the gate-firing tool (`run_workflow`, with 28.6% timeout-shaped errors per the #2703 telemetry) migrates. Schema additions to `StructuredTaskState` (Stage 2, #3043) follow once the wire protocol is proven; that's the path that lets us drop the sidecar files entirely.

## Lifecycle invariants the next contributor inherits

From the vote's Scope Steward flag: once shipped, two contracts that can't be relaxed without breaking polling clients:

1. **`mode: 'sync'` stays the default forever** — backward-compat invariant. The schema deliberately omits `.default('sync')` so the inferred type stays optional and existing test fixtures don't need to add `mode: 'sync'`; the handler treats `undefined` as `'sync'`.
2. **JobResult schema is versioned (`v: 1`)** — readers tolerate future versions by returning `null` (treated as "unknown jobId") so an older nexus-agents process polling against a record written by a newer process doesn't crash.

## Tests

- 8 new `job-result-store.test.ts` cases: pending/complete/failed lifecycle, createdAt preservation across writeJobComplete, idempotent re-write of pending, future-schema graceful handling, corrupt-JSON graceful handling.
- 4 new schema-level cases on `orchestrate.test.ts`: accepts `'async'`/`'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode value.
- `EXPECTED_TOOL_COUNT` and `TOOL_ANNOTATIONS` count bumped 38 → 39 to match the new `get_job_result`.

136 targeted tests pass; `tsc` + `eslint` clean.
