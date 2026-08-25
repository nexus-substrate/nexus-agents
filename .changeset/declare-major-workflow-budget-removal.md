---
'nexus-agents': major
---

BREAKING: the workflow engine's budget-enforcement types are no longer exported

#4755 removed the workflow engine's dormant budget enforcement. That removal took
ten types off the package's public surface, and shipped declared as `minor`. This
changeset corrects the version level; it adds no further code change.

Removed from the public API:

- `IBudgetCircuitBreaker`
- `BudgetCircuitBreakerConfig`
- `BudgetCircuitSnapshot`
- `BudgetCircuitState`
- `BudgetCircuitStateChangeEvent`
- `BudgetCircuitStateChangeListener`
- `BudgetEnforcementEvent`
- `BudgetEnforcementResult`
- `BudgetUsageSnapshot`
- `StepBudgetAllocation`

plus the `ExecutionContext.budgetCircuitBreaker` and `.budgetEvents` fields.

None was exported by name from `exports/workflows.ts` — they were reachable only
_through_ `ExecutionContext`, which is why a name-based grep reported the change
as internal. The AST surface gate added in #4749 caught it on its first real run,
before publication.

**Migration.** If you imported any of these, they still exist internally and the
`BudgetCircuitBreaker` class itself is unchanged and still used by
`pipeline/budget-guard.ts` — the pipeline's budget enforcement is unaffected.
What is gone is the workflow engine's copy, which could never fire: it required
`enableBudgetEnforcement` plus a `contextManagerConfig`, and no caller set either.
Workflow runs had no budget enforcement before this change and have none after
(#4754).

Chosen over re-exporting the ten types to preserve the surface. Re-exporting
would keep the version at `minor`, but it would commit the project to a public
API that exists only by accident of type reachability, and export symbols with
no consumer — which the export ratchet (#3024) exists to discourage.

Resolves #4759.
