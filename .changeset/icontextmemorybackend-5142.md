---
'nexus-agents': minor
---

Rename this package's context-store contract from `IMemoryBackend` to `IContextMemoryBackend`, keeping `IMemoryBackend` as a `@deprecated` alias (#5142).

Two unrelated exported interfaces shared the name `IMemoryBackend` with zero overlapping members: `nexus-memory`'s registry contract (`domain/read/write/query/delete/stats/close`) and this package's context store (`store/retrieve/search/prune`). Inside nexus-agents, `implements IMemoryBackend` meant one of two disjoint contracts depending on the import line.

**Nothing breaks.** `IMemoryBackend` is still exported from `nexus-agents`, as an empty interface extending `IContextMemoryBackend` — the same structural type, assignable both ways, and still augmentable (a `type` alias would not have been). Existing imports compile and mean what they meant; editors show a deprecation notice. Removal is tracked for the next major in #5452.

Internal code now uses `IContextMemoryBackend`; an ESLint `no-restricted-imports` entry keeps the old name from creeping back in-tree. `nexus-memory`'s `IMemoryBackend` is unchanged.
