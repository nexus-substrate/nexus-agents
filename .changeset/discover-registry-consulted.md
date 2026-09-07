---
'nexus-agents': minor
---

`research_discover` now reports `registryConsulted`, so a caller can tell an
empty papers registry from one that could not be read. `getExistingArxivIds`
swallowed a failed `loadPapersRegistry` into an empty Set, which made every
discovered item look new — `alreadyInRegistry: 0`, `newItems: <all>` —
byte-identical to a clean read that matched nothing. A caller feeding those into
`research_add` re-added papers that were already catalogued.
