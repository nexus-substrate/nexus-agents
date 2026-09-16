---
'nexus-agents': patch
---

Internal cleanup (#6425): delete 30 exported functions, constants and Zod schemas that had zero references anywhere in the tree — no production importer, no test, no docs, and none on the published API surface (`api-surface.txt` is unchanged). Among them: the `createWorkflowEngine` stub that only threw, the never-called `compactCorrelationData` (the correlation-persistence module doc now says the legacy `correlations.json` is read on every load and left in place), the `executeSearch`/`getAllMemories` scaffold leftovers, and twenty `*Schema` constants nothing parsed with or inferred from. Nothing published is removed and no behaviour changes.
