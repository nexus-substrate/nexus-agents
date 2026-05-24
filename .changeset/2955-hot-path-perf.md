---
'nexus-agents': patch
---

**perf:** three hot-path inefficiencies from #2955. Site 4 (RoutingMemory reverse-index) is deferred — needs a larger reverse-index design.

- **Site 1 — `OutcomeStore.query()` full-array filter per executeTask.** The composite-router calls this inside `computeQualityReward()` on every single executeTask with `{ cli, limit: 20 }`. Pre-fix did `entries.filter(...).slice(-limit)` — a full O(N) scan of all ~10 000 entries even when only 20 matches were needed. At default cap × 30-stage workflow that was ~300 000 unnecessary predicate evaluations per workflow. Added `tailScan(entries, filter, limit)` that walks from the tail backward and stops once `limit` matches accumulate, then reverses for chronological order. Preserves "last N matching" semantics; the limit-undefined path still uses `applyFilters` to keep that surface unchanged.
- **Site 2 — `OutcomeStore.queryByModelWithFamilyFallback()` walked entries twice.** Pre-fix called `applyFilters(this.entries, base)` for the literal-id matches, then again for the same-vendor/same-family matches. 2× O(N) for a single-pass partition. Extracted `partitionByLiteralAndFamily` helper that collects both buckets in one walk. Family bucket includes literal-id matches — the family-broadened result remains a superset of literal, matching pre-fix semantics.
- **Site 3 — `tool-wrapper.appendTimeoutMismatchEvent` sync FS I/O per mismatched call.** Pre-fix did `existsSync` + `mkdirSync` + `appendFileSync` on every MCP call to a long-running tool that lacked `progressToken` (most MCP clients don't send progress tokens by default), blocking the event loop on disk I/O on the MCP server's hot path. Switched to `fs.promises.appendFile` (already best-effort/swallowed-on-failure, so fire-and-forget is safe) plus an `ensuredDirs` Set so the existsSync runs at most once per dir per process.

80 tests pass across `outcome-store.test.ts` (63) and `tool-wrapper.test.ts` (17); tsc + eslint clean.

Site 4 (`RoutingMemory.getPreferences` iterates CLI_NAMES with per-CLI MobiMem lookup per recommendation) deferred — needs a reverse-index keyed by `preferenceKey → CliName[]` populated on `storePreference`, larger scope than this PR is taking.
