---
'nexus-agents': patch
---

Internal: drop the surplus `export` keyword from 86 value declarations (functions, consts, Zod schemas, one class) across 48 source files that are used only inside their declaring file and referenced by no other file (#6425). Nothing published changed — none of the names appear in `api-surface.txt`, and the public entry points are untouched; the edit only shrinks the advisory noise of the producer-without-consumer ratchet.
