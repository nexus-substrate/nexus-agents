---
'nexus-agents': patch
---

**Phase 6 of #2766** — OutcomeStore discoverable via the unified MemoryRegistry. Closes #2771 (minimum-viable scope; full JSONL→SQLite migration filed as Phase 6.1 follow-up).

`getOutcomeStore()` now attaches the singleton to the unified registry on first call. `getMemoryRegistry().get('outcomes')` returns an `IMemoryBackend` view backed by the existing OutcomeStore — `stats()` reports the live row count and timestamp bounds; `query({ where, limit })` translates to `OutcomeStore.query`. Writes still go through `store.append()` directly (the adapter rejects with an explanatory error).

The 10+ writer call sites are unchanged — this PR ships the architectural piece (registry discoverability + telemetry-ready) without the JSONL→SQLite blast radius. Phase 6.1 (separate follow-up) does the deeper migration.

9 new tests in `outcome-store-adapter.test.ts` cover the cli filter, limit, timestamp bounds, and the no-op CRUD semantics.
