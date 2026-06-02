---
"nexus-agents": patch
---

chore: remove orphaned mapPartToContentBlock helper (vestigial cleanup)

`mapPartToContentBlock` in `adapters/gemini-types.ts` was exported but had zero
importers anywhere (not in any public barrel, not tested) — a refactor leftover.
Removed it and its now-unused imports (`ContentBlock`, `getTimeProvider`,
`getRandomProvider`). Gemini adapter behavior unchanged; 51 gemini tests pass.
