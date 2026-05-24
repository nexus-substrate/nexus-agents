---
'nexus-agents': patch
---

**fix(observability):** subprocess timing logs now carry a `requestId` for correlation (closes #2963 site 3).

`subprocess-adapter.ts:logTimingBreakdown` emits `'Subprocess timing'` at `info` level on every subprocess close, with the explicit goal (per JSDoc) of _"group by cli + provider + model and surface tail-latency outliers."_ Pre-fix the log had no per-call correlation key — multiple subprocesses for the same CLI run concurrently in pipelines and consensus votes, so the timing entries for the same CLI couldn't be disambiguated. Identifying which timing row belonged to which `executeTask` call was impossible from the logs alone.

The fix generates a per-`executeTask` `requestId = generateHyphenId('cli-req', 8)` and threads it through:

- `executeTask` → `spawnSubprocess` (initial attempt)
- `executeTask` → `retryTransient` → `spawnSubprocess` (every retry uses the same `requestId` so retries-of-the-same-call group together)
- `spawnSubprocess` → `setupChildProcessHandlers` (refactored to an opts-object to stay under the 5-param cap) → the `child.on('close')` handler
- `logTimingBreakdown(state, startTime, code, requestId)` — emits `requestId` alongside the existing `cli` / `totalMs` / `spawnLatencyMs` / etc.

`requestId` also appears in the `'Retrying transient error'` debug log so all log lines for a single call (initial attempt + retries + final timing) carry the same correlation key.

The ID is adapter-internal — it doesn't propagate up to MCP. CliTask's contract is unchanged.

37 existing tests pass; tsc + eslint clean. Added a `/* eslint-disable max-lines */` to the file header since the threading bumped the line count just past the 400-line cap (the file is one cohesive base-adapter class, governance allows 400-600 for cohesive files).

Closes #2963 site 3. (Sites 1, 2, 4 shipped in #3002.)
