---
'nexus-agents': patch
---

**Closes #2796. Phase 4 of #2792 (cross-cutting memory access).**

Remove the dead `retrieveAdaptiveMemory` bridge from `pipeline/stage-wrappers.ts`. It was constructing a fresh `AdaptiveMemoryBackend` instance (not the shared one) and looking up `task.slice(0, 50)` as a literal key — writers use UUIDs, so the lookup never matched. Net effect: a false bottom that hid the cross-cutting gap.

Cross-cutting memory enrichment for the Research stage will return via `getContextForTask` (Phase 2 #2794) once Phase 3 (#2795) wires it into the pipeline entry points.
