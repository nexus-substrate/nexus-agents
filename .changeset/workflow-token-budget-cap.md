---
'nexus-agents': minor
---

`run_workflow` now honours `NEXUS_BUDGET_ENFORCE`, the token cap `run_pipeline` already had (#4754). Before this, a workflow run had no spend cap at all.

- **New optional `maxTokens` input** on `run_workflow` sets the run's ceiling. With the flag on and `maxTokens` omitted, the ceiling is estimated from the inputs and step count, the same way `run_pipeline` estimates it (`NEXUS_BUDGET_TOLERANCE` applies). With the flag off the run is not capped. A `maxTokens` passed while the flag is off comes back as `budget: { status: 'not_enforced' }` instead of being dropped without a word.
- **Where the cap is checked:** after each phase, so the next phase never starts once the cap is reached, and again just before each step is dispatched, so a step still waiting behind `maxConcurrency` does not start. Steps that are already running are **not** stopped. Spend can go over the ceiling by whatever those in-flight steps use.
- **What the result says:** a run stopped by the cap fails with an error that states spent tokens against the ceiling. The failure envelope carries a `budget` object with the same numbers. A run that completes carries `budget.status`: `within_budget`, `exhausted`, or `unmeasured`. `unmeasured` means at least one step reported no token usage, or no step ran, so the spend shown is a lower bound and cannot count as "within budget".
- **Also fixed:** `run_pipeline`'s budget guard stopped enforcing about 5 seconds after it tripped. It sat on a circuit breaker that half-opens after its cooldown and never re-opens, so one slow model call was enough to resume spending. Once tripped, the guard now stays tripped for the rest of the run.
- Public types: `IWorkflowEngine.execute` accepts `options.budget`, `WorkflowResult` gains an optional `budget: WorkflowBudgetOutcome`, and the engine's `ExecutionOptions` gains an optional `budget` (`StepBudgetGate`). All of these are additive.
