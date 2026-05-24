---
'nexus-agents': patch
---

**cleanup(pipeline):** remove the write-only `SharedMemoryStore` integration with `PipelineContext`.

Six pipeline stages (`research`, `plan`, `implement` × 2, `analyze`, `scan`) wrote to `ctx.sharedMemory` with comments like _"for downstream stages"_. Tree-wide grep finds zero `.read()` / `.readFromStage()` callers. The `SharedMemoryStore` was instantiated in `graph-pipeline-runner.ts:107` and threaded through `PipelineContext.sharedMemory`, but no consumer ever closed the loop. Same activate-or-delete YAGNI call as #2921 and #2938 (`createFeedbackSubscriber` advertised-not-wired).

**Removed (the dead integration):**

- `PipelineContext.sharedMemory` field (stage-types.ts) and the `SHARED_MEMORY` entry from `PIPELINE_STATE_KEYS`.
- All 6 `ctx.sharedMemory.write(...)` calls in `stage-wrappers.ts`.
- The `extractSymbolsForTask` helper — its only consumer was the now-removed implement-stage write, and the function had no other side effects.
- `classifyImplementationTrust` — same story; was solely a sharedMemory writer.
- `SharedMemoryStore` instantiation in `pipeline-graph.ts:createNodeHandler` and `graph-pipeline-runner.ts:runGraphPipeline`.
- The corresponding test sections in `pipeline-eval-stages.test.ts`, `pipeline-eval.test.ts`, `pipeline-integration.test.ts`, `stage-wrappers.test.ts` that exercised propagation through `PipelineContext.sharedMemory`.

**Preserved (the standalone utility):**

- `SharedMemoryStore` class itself + its `pipeline/index.ts` and `exports/pipeline.ts` exports. It's a small tagged in-memory store that's useful on its own; future cross-stage handoff should route through `PipelineContext.state` with a documented `PIPELINE_STATE_KEYS` entry.
- Direct-class coverage in `phase4.test.ts` (17 tests) and `pipeline-eval-edge.test.ts` (44 tests) untouched.
- The `Pipeline Eval — SharedMemoryStore Performance` block in `pipeline-eval.test.ts` (now exercises the standalone class only).

122 tests across the 6 affected test files still pass. Closes #2937.
