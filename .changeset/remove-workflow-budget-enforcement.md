---
'nexus-agents': minor
---

fix(workflows): remove unreachable budget enforcement, and make usage accounting actually run

The workflow engine's budget enforcement could not block a step. The circuit
breaker was built only when `enableBudgetEnforcement` was true AND a
`contextManagerConfig` was supplied, and no production caller set either — the
only non-test references were the two type declarations and the `false` default.
So `enforceStepBudgets` was structurally incapable of returning `err`,
`budgetEvents` was permanently `[]`, and `getBudgetEvents` returned that empty
list to nobody.

Removed: `enableBudgetEnforcement`, `contextManagerConfig`,
`budgetCircuitBreakerConfig`, `applyBudgetEnforcement`, `enforceStepBudgets`,
`getBudgetEvents`, `getBudgetCircuitBreaker`, and `ExecutionContext.budgetEvents`
/ `.budgetCircuitBreaker`.

**`BudgetCircuitBreaker` itself is untouched** — `pipeline/budget-guard.ts`
wraps it as "the single budget authority" for `agent-executor`, and that path
still enforces. Only the workflow engine's dormant copy is gone.

Usage ACCOUNTING is kept and decoupled. `recordPhaseUsage` took an
`ExecutionContext` purely to reach the breaker, and returned zeros whenever the
breaker was absent — which was every production run. Counting never needed a
breaker; only `recordUsage` did. It now takes just the step results and runs on
every phase, so `reportUsageCoverage` can genuinely warn that a phase's recorded
spend is a lower bound. This is the first time the #4744 unmeasured-step work
has any production effect.

Panel chose removal 6-1 over wiring it, on the capability-bias bar: no named
consumer wants per-step workflow budget caps, and git history preserves the
machinery if one appears.

Workflows now have no budget enforcement — which was already true, and is now
visible rather than implied. Tracked in #4754.
