---
'nexus-agents': minor
---

Scaffold the `nexus-memory` workspace package (Phase 3 of #2766). Closes #2769.

New package at `packages/nexus-memory/` with:

- **`IMemoryBackend<TKey, TValue>` contract** — every concept-space implements `read`, `write`, `query`, `delete`, `stats`, `close`. Async surface; sync `better-sqlite3` inside.
- **`MemoryRegistry`** — singleton via `getMemoryRegistry()`, test-injectable via `setMemoryRegistry()`. Backends share one SQLite connection. `createInMemoryMemoryRegistry()` for tests.
- **`SqliteBackend`** + **`InMemoryBackend`** — both implement the same contract; the contract test in `backends/contract.test.ts` runs against both with identical assertions.
- **Telemetry** — aggregated counters (default) + opt-in full-audit mode via `NEXUS_MEMORY_AUDIT_MODE=audit` (Phase 2 vote ballot 2: C with 6/7 supermajority). `recordMemoryEvent` / `subscribeToMemoryEvents` / `getMemoryEventCounters`. Audit-mode summaries truncated to 120/240 chars (catfish-mitigation: per-event payload capture, not just counters).
- **Cold-archive Zod validation** (Phase 2 vote mitigation #1, security dissent) — any backend constructed with `schema` rejects invalid writes via `MemoryValidationError` before they hit storage.
- **Importer skeleton** — `registerImporter` / `runImporters` with marker-file gating. Phase 4+ migrations plug in concrete importers (MobiMem JSON, OutcomeStore JSONL, agentic.db, etc.). `backupSourceFile` helper renames source to `.bak.<timestamp>` after a successful import.

57 tests across 4 files. Contract test ensures both backends behave identically; telemetry tests pin both default-mode and audit-mode behaviors; importer tests cover idempotency + error isolation.

No nexus-agents migrations yet — that starts in Phase 4 (#2770).
