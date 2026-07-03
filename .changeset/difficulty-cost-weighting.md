---
'nexus-agents': minor
---

feat(routing): difficulty-conditional cost weighting + per-class cost ceiling (#4196)

Under `NEXUS_BILLING_MODE=api`, the TOPSIS stage now conditions its
quality/cost weight split on the canonical SharedTaskAnalyzer complexity
(TaskProfile `reasoningComplexity`, 0-10 — no new difficulty estimator):
hard tasks (>7, the existing ×1.2 boost threshold) shift 0.15 weight from
cost to quality (0.5/0.3/0.2 → 0.65/0.15/0.2, tolerating frontier $/1M for
hard work); easy tasks (<4) shift the other way (→ 0.35/0.45/0.2); the
mid-band keeps the exact current criteria (same reference — byte-identical
default path). The shift is clamped so no weight goes negative and composes
with the per-category criteria (#1491).

BudgetRouter gains per-task-class cost ceilings
(`taskClassCostCeilings` / composite `budgetConstraints.taskClassMaxCostUsd`,
keyed by `detectTaskCategory` class, default OFF/unlimited). Candidate cost
is estimated from canonical registry pricing (ModelEntry.pricing, the #4165
path — not the legacy TOKEN_COSTS table). BINDING fail direction: a
candidate with missing registry pricing FAILS a configured ceiling
(fail-closed), never the return-all-candidates fallback pattern. Ceilings
are enforced only under api billing.

Plan mode (the default) leaves both features as no-ops but now emits an
explicit routing-decision annotation — 'cost weighting disabled: plan mode'
— in the decision reason/trace (BINDING: never silent), and
`adaptRoutingConfig` resolves the composite router's billing mode from
`NEXUS_BILLING_MODE` so api mode is reachable outside tests.
