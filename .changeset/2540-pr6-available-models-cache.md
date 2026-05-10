---
'nexus-agents': minor
---

`AvailableModelsCache` — harness-driven view of routable models (#2540 PR 6 of 8).

PR 5 added `listModels()` on direct-API and CLI adapters. This PR stitches those probes into one queryable surface so `CompositeRouter` (PR 7) can gate scoring on what's actually routable right now.

Design invariants:

- **Sources are the source of truth.** If a harness drops a model, the registry never decides it's still routable. `ModelRegistry` answers "how should this model behave"; `AvailableModelsCache` answers "is this model routable at all."
- **Stale-while-revalidate.** Fresh < 5 min. Stale-but-usable < 25 min (returns cached, kicks background refresh). Beyond → blocks. Defaults configurable per call site.
- **Bad sources don't poison the union.** A failing `listModels` logs and is excluded from the next snapshot; remaining sources stay queryable.
- **No persistence.** Process-local; operators restart and get a fresh probe.

API: `new AvailableModelsCache({ sources, ttlMs?, staleTtlMs?, now? })` → `getAll()`, `byProvider(name)`, `has(modelId)`, `refresh()`. Sources adapt themselves to the minimal `AvailableModelsSource` interface (one `listModels()` method) so both `IModelAdapter` and `ICliAdapter` can be wrapped without entangling the cache with either contract.
