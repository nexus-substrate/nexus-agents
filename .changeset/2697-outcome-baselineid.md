---
'nexus-agents': minor
---

**Closes #2697.** Add optional `baselineId` field to `TaskOutcomeSchema` for fork-session branch correlation.

Follows the established additive-optional-field pattern (`wasRetried`/`triageAction` #1506, `routingStage`/`retryCount` #1785, `vendor`/`family` #2548, `voterRole` #2662) — backward-compatible, no migration.

- `TaskOutcomeSchema.baselineId: z.string().min(1).max(64).optional()` — set on outcomes recorded inside a fork-then-merge graph branch. Free-form, caller-assigned (typically the parent node's `executionId` or `taskId`).
- `OutcomeQuerySchema.baselineId` filter added — `query({ baselineId: 'B' })` returns every outcome that forked from baseline B as a cohort.
- `applyFilters` predicate-builder picks up the new filter.
- `OutcomeStoreAdapter.query` (Phase 6 of #2766) threads `baselineId` through `where`.

Closes the correlation gap surfaced by the #2665 fork-session spike. The orchestration shape already works today via `GraphBuilder`; this PR closes the remaining "let me later compare branches as a cohort" gap so the telemetry is queryable.

Three test groups added: `OutcomeQuerySchema` length bounds, `TaskOutcomeSchema` accept/reject cases, `OutcomeStore` round-trip + filter composition + JSONL persistence round-trip.

Part of Epic F (#2667). A `fork-comparison` graph template (spike recommendation 2) is intentionally out of scope here — file separately if a concrete tool needs it.
