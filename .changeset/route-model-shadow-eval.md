---
'nexus-agents': minor
---

feat(routing): shadow-mode eval for tier model selection (#4197)

Builds the eval infrastructure for the `NEXUS_ROUTE_MODEL_SELECTION` flip
decision (epic #4175, #3552 shadow-eval precedent) — NOT the flip itself,
which stays a separate vote-gated increment.

Under `NEXUS_ROUTE_MODEL_SHADOW=1` (new env flag, default OFF, requires
learning persistence), the CompositeRouter computes — per routed decision
with a difficulty tier — the model `resolveModelForTier` WOULD have picked
next to the model actually used (the decision's model, or the CLI default
the adapter resolves late), and persists the comparison joined with its
outcome to a dedicated `learning/model-selection-shadow.jsonl` (mirroring
the #3593 meta-shadow persistence pattern: sanitized fields only, no task
text, schema-versioned lines validated on read; a dedicated log so the eval
never re-reads the OutcomeStore that weather + LinUCB warm-start already
replay). Tasks with a pinned `CliTask.model` are skipped — the adapter
executes the pinned model, not the default the comparison would assume, so
they carry no evidence about the tier selector. Shadow compute is
registry-only and exception-guarded with a failure counter — a shadow
failure never alters or breaks routing.

`evaluateModelSelectionReadiness(records, config?)` encodes the
PRE-DECLARED win metric as a fail-closed #4096 readiness envelope:
(1) volume — ≥50 outcome-joined decisions where shadow ≠ actual;
(2) success-delta — shadow-agreeing success rate minus shadow-diverging
must be ≥0.05 (either cohort empty ⇒ delta 0, incomparable stays blocked);
(3) cost-measured — ≥10 records with a measured costUsd (blocks by
construction until cost attribution reaches the routing outcome join).
The verdict is surfaced as a once-per-process log line at first
shadow-enabled decision (the #4161 `logMetaStrategyReadinessOnce` pattern)
— a logged signal only; no default changes, no MCP schema changes.

Also registers the pre-existing `NEXUS_ROUTE_MODEL_SELECTION` reader in the
env schema (it predated its schema entry) alongside the new
`NEXUS_ROUTE_MODEL_SHADOW`.
