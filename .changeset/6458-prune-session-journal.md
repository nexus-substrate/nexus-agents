---
'nexus-agents': patch
---

Prune unreferenced `SessionJournal` flight recorder module and types superseded by `StructuredTaskState` (#6458). Removes unused `session-journal.ts`, `session-journal-types.ts`, and internal re-exports from `src/context/index.ts`.
