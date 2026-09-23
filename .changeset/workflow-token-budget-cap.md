---
'nexus-agents': minor
---

`run_workflow` can now cap a run's total token spend under `NEXUS_BUDGET_ENFORCE`, the flag that already governs `run_pipeline` (#4754). Before this, a workflow run had no spend cap at all.

- **New optional `maxTokens` input.** This is the only way a workflow gets a cap: the run is capped only when the flag is on AND `maxTokens` is set. Unlike `run_pipeline`, there is no estimated default. The estimate is built from the inputs (about 1.2k tokens per step), and real workflow steps use 2.6k–10k, so an estimated cap would stop ordinary workflows after their first phase. When the flag is on without `maxTokens`, or `maxTokens` is set while the flag is off, the run is not capped and the result says `budget: { status: 'not_enforced', reason }`. The same happens when a custom engine ignores the requested cap.
- **Where the cap is checked:** after each phase, so the next phase never starts once the cap is reached, and again just before each step is dispatched, so a step still waiting behind `maxConcurrency` does not start. Steps that are already running are **not** stopped. Spend can go over the ceiling by whatever those in-flight steps use.
- **What the result says:** a run stopped by the cap fails with a non-retryable `business` error that states spent tokens against the ceiling. The error carries a `budget` object and the `stepResults` of the phases that completed before the stop. A step skipped by its condition made no model call and counts as zero tokens; a retried step counts only the successful attempt's tokens. A run that completes carries `budget.status`:
  - `within_budget`: every step's usage was counted, and the total stayed under the ceiling.
  - `exhausted`: counted spend crossed the ceiling.
  - `unmeasured`: a step that ran reported no token usage, or no step ran at all, so the spend shown is a lower bound.
- **Also fixed:** `run_pipeline`'s budget guard stopped enforcing about 5 seconds after it tripped. It sat on a circuit breaker that half-opens after its cooldown and never re-opens, so one slow model call was enough to resume spending. Once tripped, the guard now stays tripped for the rest of the run.
- Public types: `IWorkflowEngine.execute` accepts `options.budget`, `WorkflowResult` gains an optional `budget: WorkflowBudgetOutcome`, and the engine's `ExecutionOptions` gains an optional `budget` (`StepBudgetGate`). All of these are additive.
