---
'nexus-agents': patch
---

Persist self-eval results to the OutcomeStore so the eval -> log -> tune loop closes.

`nexus-agents evaluate` now maps each aggregated component evaluation to a `TaskOutcome` (via the new `aggregatedResultToOutcome` adapter) and appends it to `getOutcomeStore()`, so self-eval output feeds `improvement_review` / tuning instead of being discarded. Outcomes use a stable `self-eval-<component-path>` id (re-runs upsert rather than pile up), carry the recommendation in `qualitySignals`, and map `retain` -> `success: true`. Persistence is guarded: a store failure is logged and skipped, never crashing the eval run.

Closes #3219, #3235, #3241.
