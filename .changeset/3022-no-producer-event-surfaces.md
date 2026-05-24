---
'nexus-agents': patch
---

**refactor:** delete 2 producer-less surfaces — learning-events + tool-output validation (closes #3022).

Second audit pass after the #2937/#2938/#2939/#2940/#3018 sweep — same activation-or-delete shape, this time in `orchestration/outcomes` and `mcp/middleware`.

### 1. `emitThresholdUpdate` + `emitTrendDetected` (Issue #901 Phase 4 scaffolding)

`packages/nexus-agents/src/orchestration/outcomes/learning-events.ts`. Both emit `learning.threshold_updated` / `learning.trend_detected` EventBus events and were exported through three barrels (`outcomes/index.ts`, `orchestration/index.ts`, `exports/orchestration.ts`). The adaptive-threshold computation in `adaptive-thresholds.ts` computes the threshold updates but never broadcasts them via these helpers — **and nothing in the codebase subscribed for these event types either.** Pure producer-less + subscriber-less scaffolding.

Removed:

- `orchestration/outcomes/learning-events.ts` (69 LOC) + its 143-LOC test file.
- `LearningThresholdUpdatedEvent` + `LearningTrendDetectedEvent` interfaces in `pipeline/event-types.ts` + their literal entries in `PIPELINE_EVENT_TYPES` + the union members in the `PipelineEvent` discriminated union.
- Re-exports through 3 barrel files.
- `'exports learning event emitters'` test in `export-contracts.test.ts`.

### 2. `validateToolOutput` + `createOutputValidator` (Issue #547 sibling)

`packages/nexus-agents/src/mcp/middleware/validation.ts:121, 159`. The output-validation siblings of `validateToolInput` (which IS used everywhere). Exported through `mcp/middleware/index.ts` and tested in `validation.test.ts`, but no MCP tool ever called them — every tool returns its result without schema-validating first.

Removed:

- Both functions from `validation.ts` (~75 LOC).
- Both test describes from `validation.test.ts` (~53 LOC across the two blocks).
- Re-exports from `mcp/middleware/index.ts`.

### Preserved

- `validateToolInput` + `createValidator` (Issue #547's input-validation half) — actively used by every MCP tool; tests untouched.
- `computeAdaptiveThresholds` + `detectTrend` — both have real consumers and stay exported.

If learning-event broadcasting or per-tool output validation come back as real production requirements, reintroduce alongside the consumer/producer in the same PR — that's the recurring lesson from the entire #2937–#3022 sweep.

73 affected tests pass (`validation.test.ts` + `export-contracts.test.ts`). `tsc` clean.
