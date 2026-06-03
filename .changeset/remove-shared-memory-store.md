---
'nexus-agents': patch
---

Remove the unused public `SharedMemoryStore` export (plus the `SharedMemoryEntry` / `SharedMemoryTag` types). It was a #1737 Phase-4 cross-stage-memory scaffold whose pipeline read-integration was de-integrated to a write-only husk in #2937 and whose sibling scaffolds were deleted in #2939. It had zero production consumers — only barrel re-exports and direct-use timing/edge tests instantiated it. Recoverable via git history if cross-stage memory is ever revived (epic #3313).
