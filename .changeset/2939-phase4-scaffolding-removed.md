---
'nexus-agents': patch
---

**cleanup(pipeline):** delete the two unwired #1737 Phase-4 scaffolds.

`pipeline/incomplete-result.ts` (85 LOC) and `pipeline/dynamic-expert.ts` (123 LOC) were exported in #1737 Phase 4 as partial-completion plumbing and bounded runtime-expert plumbing respectively. Both were exported on `pipeline/index.ts` and `exports/pipeline.ts` and exercised by `phase4.test.ts` (273 LOC) — but tree-wide grep found zero non-test, non-barrel callers. No stage ever returned an `IncompleteResult`; nothing gated on `canPipelineProceed`; the PM/Orchestrator path that the `DynamicExpertManager` docstring described was never built.

YAGNI call: adopt or delete. Deleted. Closes #2939.

Removed:

- `packages/nexus-agents/src/pipeline/incomplete-result.ts` (and exports: `IncompleteResult`, `IncompleteSeverity`, `isIncompleteResult`, `createIncompleteResult`, `canPipelineProceed`, `filterBySeverity`).
- `packages/nexus-agents/src/pipeline/dynamic-expert.ts` (and exports: `DynamicExpertManager`, `MAX_DYNAMIC_EXPERTS`, `DynamicExpertSpec`, `DynamicExpert`).
- `packages/nexus-agents/src/pipeline/phase4.test.ts` (only tested the two deleted scaffolds).
- Re-exports through `pipeline/index.ts` and `exports/pipeline.ts`. `SharedMemoryStore` (the only #1737 Phase-4 scaffold with actual standalone value) is kept — see the sibling #2937 cleanup.

If the use cases come back (typed partial-completion, dynamic runtime experts), reintroduce with both producer AND consumer in the same PR — the lesson #2937, #2938, #2921, and this issue all surface.
