---
'nexus-agents': minor
---

feat(pipeline): estimate-relative token budget for run_pipeline (#3262)

Activates the existing `BudgetGuard`/`BudgetCircuitBreaker` (#3395) with a budget
seeded from the task's token estimate, so a `run_pipeline` run that overruns its
plan estimate is short-circuited (fail-closed, with an observable
`budget_exceeded` event) instead of spending unboundedly. New pure helpers
`estimateRelativeBudget` + `resolveBudgetTolerance` (`NEXUS_BUDGET_TOLERANCE`,
default 1.5×; token-based so it holds under `NEXUS_BILLING_MODE=plan`). Gated
behind `NEXUS_BUDGET_ENFORCE=1` (default-off — no behavior change until enabled);
the whole-run estimate is approximated as `perCall × stageCount`.
