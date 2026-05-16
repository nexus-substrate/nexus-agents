---
'nexus-agents': patch
---

**Phase 5 of #2766** — tool-memory backends now discoverable through the unified `MemoryRegistry`. Closes #2772 (minimum-viable scope; full storage-migration is filed as Phase 5.1 follow-up).

Each tool-memory backend (agentic, adaptive, typed, belief, mobimem) is attached to the shared registry via a thin `StatsOnlyAdapter` after its initialization. Callers can now reach every domain via `getMemoryRegistry().get(domain)` for discovery + telemetry, while the underlying CRUD still flows through the existing typed surfaces (`HybridMemoryBackend`, `AgenticMemoryBackend`, etc.).

Adds:

- `MemoryRegistry.attach(domain, backend)` in `nexus-memory` — new entry point for externally-managed backends that own their own storage.
- `StatsOnlyAdapter` in `mcp/tools/tool-memory-registry-adapters.ts` — wraps any `{ count(): unknown }` into a contract-compliant `IMemoryBackend`. Tolerates plain `number`, `Promise<number>`, and `Result<number, _>` return shapes.
- Wiring in `tool-memory.ts.initAgenticMemory / initAdaptiveMemory / initTypedMemory / initMobiMem` and the BeliefMemory constructor.
- 10 regression tests for `StatsOnlyAdapter` (count shapes, no-op CRUD, close delegation).

Deferred: fully folding each backend's storage into `nexus-memory`'s `SqliteBackend`. That's a substantial refactor (changes the persistence layout under `~/.nexus-agents/memory/`) and warrants its own scoped PR. The registry attachment ships the architectural piece (every backend is contract-compliant and discoverable) without the rewrite blast radius.
