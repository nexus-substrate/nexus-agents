---
'nexus-agents': minor
---

**Closes #2719**: MobiMem now persists to SQLite. Phase 4 of #2766.

Pre-Phase 4, MobiMem's `dbPath` config was a dead surface — the impl classes used pure `Map<string, Entry>` and `dbPath` was passed in but never opened. The result was a triple-disconnect:

1. `routing-memory.ts:179` `new MobiMem()` → in-memory only, died on process exit.
2. `pipeline/agent-executor.ts:163` `persistMobiMemState` → saved an empty MobiMem to `mobimem-state.json` (stats only, no data).
3. `tool-memory.ts:270` `new MobiMem({ dbPath })` → opened a SQLite file that nobody wrote to.

KnnRoutingStage (`composite-router.ts:282`) had nothing to retrieve and the opt-in `enableKnnRouting` feature literally couldn't work.

**Fix:**

- New `mobimem-persistence.ts` — tiny synchronous SQLite mirror keyed by domain (`mobimem_profile` / `mobimem_experience` / `mobimem_action`). When MobiMem is constructed with a real `dbPath`, every write to the in-memory Map is mirrored to SQLite; on construction the Map is hydrated from SQLite first.
- `mobimem.ts:MobiMem` ctor actually opens `dbPath` (when not `:memory:`) and threads the handle through the three impls.
- New `getSharedMobiMem()` singleton — process-wide instance backed by `~/.nexus-agents/memory/mobimem.db`. `RoutingMemory` ctor now defaults to it (was `new MobiMem()`). `tool-memory.ts` routes through it via `setSharedMobiMemDbPathResolver`.
- `agent-executor.ts:persistMobiMemState` deleted — SQLite mirror handles persistence inline.
- `MobiMem.save()` JSON path deleted — it only persisted stats, not data.

The architectural goal (`MobiMem` flowing through `nexus-memory`'s `IMemoryBackend`) is deferred to a future Phase 4.1. The async contract on `IMemoryBackend` would require an async ripple across `KnnRoutingStage` / `StrategyDistiller` / `routing-context-store-impl`; this synchronous side-channel closes #2719 with minimum blast radius and lets the routing pipeline see real cross-session learning today.

**Tests:**

- 6 new persistence regression tests in `mobimem-persistence.test.ts`. Pin the core invariant: writes through one MobiMem instance are visible to a fresh instance opened against the same `dbPath`. Date fields survive the JSON round-trip via `hydrateDates`.
- 1094 existing tests pass (40 test files in the broader `context/` + `pipeline/` sweep).
