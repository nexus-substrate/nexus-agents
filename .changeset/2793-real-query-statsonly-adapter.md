---
'nexus-agents': minor
---

**Closes #2793. Phase 1 of #2792 (cross-cutting memory access).**

`StatsOnlyAdapter.query()` now delegates to the underlying backend's native search instead of returning `[]`. This unblocks the registry-level fan-out that the rest of #2792 builds on.

- `CountableBackend` grows an optional `search(query, limit): Promise<readonly unknown[]>` callback.
- `StatsOnlyAdapter.query()` reads the free-text term from the conventional `filter.where.text`, dispatches to `backend.search()`, falls back to `[]` on missing callback / missing text / search failure (the consumer relies on `query()` never throwing).
- `tool-memory.ts` attaches each backend's idiomatic search call to its registry entry:
  - `belief` → `recallBySubject(text, limit)`
  - `agentic` → `searchAgentic(text, limit)` (A-MEM attribute-rich entries)
  - `adaptive` → `retrieveByPriority({ query, limit })` (priority-scored)
  - `typed` → underlying `HybridMemoryBackend.search(query, limit)`
  - `mobimem` → `experience.findPatterns(query, limit)`

`OutcomeStoreAdapter.query()` is unchanged — it already supports structured `where` (cli, category, success, baselineId) which is the appropriate API for that domain.

Verified end-to-end: `scripts/e2e-memory-validation.ts` exercises the new fan-out and confirms `registry.get('belief').query({ where: { text: '...' } })` returns matching beliefs from a real `HindsightBeliefMemory`.

Next: #2794 (`ContextRetriever.getContextForTask()`) builds on this.
