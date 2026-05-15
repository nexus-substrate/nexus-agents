---
'nexus-agents': patch
---

`TechniqueStatus` in `cli/research-types.ts` is now sourced from the canonical Zod enum (`TechniqueStatusSchema` in `research-index-base-types.ts`) instead of a hand-maintained 5-value union (#2720 umbrella, same shape as the #2717 `PaperImplementationStatus` fix).

Pre-fix both definitions named the same 5 values, so the surface and the schema agreed _right now_ — but nothing forced them to agree the next time someone added a value. The union was redundant code that the next contributor could trivially make wrong. The CLI now reads `import('...').TechniqueStatus`, the same single-source pattern `PaperImplementationStatus` uses.
