---
'nexus-agents': minor
---

**Follow-ups to Phases 5, 7, and 9 of epic #2766** (memory unification). Closes review findings from the post-merge code review.

- **Phase 9 cleanup is now actually invoked.** `runBeliefCleanup` is wired into `ToolMemoryManager`'s constructor and runs once on first startup (marker-file gated). Previously the cleanup logic existed and was fully tested but had zero production callers, so polluted arXiv rows never got removed.
- **`memory_stats` reads the unified `MemoryRegistry`.** Adds a `registry` array to the response with one entry per attached domain (`belief`, `agentic`, `adaptive`, `typed`, `mobimem`, `outcomes`). This delivers the Phase 5 architectural goal — discoverability through one canonical fan-out — that the per-backend `is*Available()` calls left undone.
- **Real counts on `agentic` + `adaptive`.** Both now expose `count()` (delegating to the shared `HybridMemoryBackend`) and the registry attachments report actual row totals instead of the hardcoded `0` placeholder.
- **`HindsightBeliefMemory.forget(id)` is a public API.** Removes a single belief and cleans up index entries; used by the cleanup driver and available for future tooling.
- Polish: drift-gate probes use boundary-aware regex (`new Database(?!\w)` etc.) so `new DatabaseAdapter(...)` and `new MobiMemAdapter(...)` no longer false-positive. `RunBeliefCleanupOptions` callbacks are async-only — production wiring always returns promises, and the tighter contract surfaces sync-vs-async confusion at type-check time.
