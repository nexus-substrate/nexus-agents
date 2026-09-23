/**
 * Per-run token ceiling for workflow execution (#4754).
 *
 * One tracker per workflow run. It wraps the pipeline's {@link BudgetGuard} —
 * the single budget authority — and adds what a phased, parallel run needs:
 *
 * - **Two check points.** The engine calls {@link WorkflowBudgetTracker.settlePhase}
 *   after each phase settles (so the next phase never starts on an exhausted
 *   budget), and {@link gateStepExecutor} checks before each step is DISPATCHED
 *   within a phase (so a step still queued behind `maxConcurrency` is not
 *   started once an earlier step overspent).
 * - **In-flight steps are not halted.** A step whose model call is already
 *   running when the ceiling is crossed runs to completion and its usage is
 *   recorded. A cap stops new spend; it cannot recall spend already committed.
 *   With `maxConcurrency` N, a run can overshoot by up to N concurrent steps.
 * - **Honest ledger.** A step that reports no usage is counted as unmeasured,
 *   never as zero, and makes the outcome `unmeasured` rather than
 *   `within_budget` (see `WorkflowBudgetOutcome`).
 *
 * @module workflows/workflow-budget
 */
import { WorkflowError } from '../core/index.js';
import type { StepResult, WorkflowBudgetOutcome } from '../core/index.js';
import { createBudgetGuard } from '../pipeline/budget-guard.js';
import type { BudgetGuard } from '../pipeline/budget-guard.js';
import type { StepBudgetGate } from './workflow-engine-helpers.js';

/** Error text on a step refused because the ceiling was already reached. */
const BUDGET_SKIP_REASON = 'Not started: workflow token budget exhausted (#4754)';

/** Token ceiling + ledger for a single workflow run. */
export class WorkflowBudgetTracker implements StepBudgetGate {
  private readonly guard: BudgetGuard;
  private readonly seen = new Set<string>();
  private readonly skipped: string[] = [];
  private spentTokens = 0;
  private measuredSteps = 0;
  private unmeasuredSteps = 0;

  constructor(private readonly ceilingTokens: number) {
    this.guard = createBudgetGuard({ maxTokens: ceilingTokens });
  }

  /** True once reported spend crossed the ceiling; stays true for the run. */
  isExhausted(): boolean {
    return this.guard.isExhausted();
  }

  /** Dispatch check: `false` (and the step is recorded as skipped) once exhausted. */
  admit(stepId: string): boolean {
    if (!this.isExhausted()) return true;
    this.skipped.push(stepId);
    this.seen.add(stepId);
    return false;
  }

  /**
   * Record one settled step's usage. Idempotent per step id. A `skipped` step
   * with no usage (a false `condition`, or the mock executor) made no model
   * call, so it is measured ZERO. Any other step without usage is unmeasured.
   * Budget-refused steps were recorded by {@link admit} and are ignored here;
   * they stay in `skippedStepIds`, which is what forces {@link haltError}.
   */
  record(result: StepResult): void {
    if (this.seen.has(result.stepId)) return;
    this.seen.add(result.stepId);
    const tokens = result.tokensUsed ?? (result.status === 'skipped' ? 0 : undefined);
    if (tokens === undefined) {
      this.unmeasuredSteps += 1;
      return;
    }
    this.measuredSteps += 1;
    this.spentTokens += tokens;
    this.guard.record(tokens);
  }

  /** Record a settled phase — steps the dispatch gate already saw are skipped. */
  recordAll(results: readonly StepResult[]): void {
    for (const result of results) this.record(result);
  }

  /**
   * Engine hook after a phase settles: record it (steps the dispatch gate saw
   * are already recorded; this catches an executePhase that bypasses the gate)
   * and return the error that stops the run, if any.
   */
  settlePhase(
    results: readonly StepResult[],
    hasMorePhases: boolean,
    completedSteps: readonly StepResult[]
  ): WorkflowError | undefined {
    this.recordAll(results);
    const halt = this.haltError(hasMorePhases);
    if (halt === undefined) return undefined;
    // The results of every phase that ran travel with the halt, so the caller
    // sees the work it paid for rather than an empty `stepResults`.
    return new WorkflowError(halt.message, {
      context: { ...halt.context, completedSteps: [...completedSteps] },
    });
  }

  outcome(): WorkflowBudgetOutcome {
    return {
      status: this.status(),
      ceilingTokens: this.ceilingTokens,
      spentTokens: this.spentTokens,
      measuredSteps: this.measuredSteps,
      unmeasuredSteps: this.unmeasuredSteps,
      skippedStepIds: [...this.skipped],
    };
  }

  /**
   * The error that stops the run, or `undefined` to continue. An exhausted
   * budget halts when there is work left to refuse — a later phase, or steps
   * of this phase that were never dispatched. A final phase that overran with
   * every step already run completes, and its outcome says `exhausted`.
   */
  haltError(hasMorePhases: boolean): WorkflowError | undefined {
    if (!this.isExhausted()) return undefined;
    if (!hasMorePhases && this.skipped.length === 0) return undefined;
    const budget = this.outcome();
    const bound = budget.unmeasuredSteps > 0 ? 'at least ' : '';
    return new WorkflowError(
      `Workflow token budget exhausted: spent ${bound}${String(budget.spentTokens)} of a ` +
        `${String(budget.ceilingTokens)}-token ceiling; stopped before further steps ran`,
      { context: { budget } }
    );
  }

  private status(): WorkflowBudgetOutcome['status'] {
    if (this.isExhausted()) return 'exhausted';
    // Name the empty case: no measured step means nothing was measured.
    if (this.unmeasuredSteps > 0 || this.measuredSteps === 0) return 'unmeasured';
    return 'within_budget';
  }
}

/**
 * Wrap a step executor with the dispatch-time budget check. A step refused
 * here is returned as `skipped` without calling the executor; a step that
 * runs has its usage recorded the moment it settles, so a later queued step
 * in the same phase sees the updated spend.
 */
export function gateStepExecutor<TStep extends { id: string }, TContext>(
  executor: (step: TStep, context: TContext) => Promise<StepResult>,
  gate: StepBudgetGate
): (step: TStep, context: TContext) => Promise<StepResult> {
  return async (step, context) => {
    if (!gate.admit(step.id)) {
      return {
        stepId: step.id,
        output: null,
        durationMs: 0,
        status: 'skipped',
        error: BUDGET_SKIP_REASON,
      };
    }
    const result = await executor(step, context);
    gate.record(result);
    return result;
  };
}
