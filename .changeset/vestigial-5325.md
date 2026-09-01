---
'nexus-agents': patch
---

chore: remove two vestigial units (#5325)

Two of the four items #5325 listed. The other two — `getSicaAgentFromOrchestrator`
and the write-only OSV module state — were already removed by #5327 and need no
further action.

**`agents/base-agent-memory-helpers.ts`** (and its test). No importer outside its
own test, which imports the file under test rather than injecting it, so it is
not a DI seam. Absent from `agents/index.ts`, from every `src/exports/*.ts`, and
from `api-surface.txt`. The live chain runs through
`base-agent-memory-accessors.ts`, which takes `MemoryOperationContext` from
`base-agent-memory-ops.ts` — never from this file.

**`config/product-matrix/index.ts` and `product-matrix.yaml`.** Nothing imports
either. `types.ts` in the same directory **is** load-bearing — three
`core/task-analysis/*` files import `ProductType` from it directly, and
`ProductType` is published API — so it stays, and no import needed rewriting.
Corroborating evidence that the loader was never live: the yaml is not in
`package.json#files`, so `loadProductMatrix`'s default path could not resolve in
a published package.

Neither removal changes `api-surface.txt`, so neither is breaking.

`docs/architecture/redundancy-analysis.md` counted the memory-helpers file as
one of five overlapping persistence systems. It now lists four, and records that
one arm of the overlap it identified had never been reachable.
