---
'nexus-agents': major
---

Remove the deprecated `IMemoryBackend` context-store interface and its public re-exports. Import and implement `IContextMemoryBackend` instead. The separate generic `IMemoryBackend` contract exported by `nexus-memory` remains available.
