/**
 * run_workflow token-ceiling resolution and reporting (#4754).
 *
 * The tool half of workflow budget enforcement: decide whether the run gets a
 * ceiling (the SAME `NEXUS_BUDGET_ENFORCE` gate as run_pipeline), tell the
 * caller whenever a run was not capped, and shape a budget halt for the
 * failure envelope. The engine (`workflows/workflow-budget.ts`) enforces.
 *
 * Only a caller-supplied `maxTokens` caps a workflow. run_pipeline's
 * estimate-relative fallback is deliberately NOT used here: it estimates from
 * the serialized inputs (~1.2k tokens per step), while real workflow steps
 * spend 2.6k (p25) to 10k (median) in local telemetry — an estimated ceiling
 * would fail ordinary workflows after their first phase.
 *
 * @module mcp/tools/run-workflow-budget
 */
import { createLogger } from '../../core/index.js';
import type { StepResult, WorkflowBudgetOutcome } from '../../core/index.js';
import { isBudgetEnforcementEnabled } from '../../pipeline/run-budget.js';
import type {
  RunWorkflowDeps,
  StepResultSummary,
  WorkflowBudgetReport,
  WorkflowToolResult,
} from './run-workflow-types.js';
import { toStepResultSummary } from './run-workflow-helpers.js';

/** The ceiling for the engine, and/or what to tell the caller about it. */
interface ResolvedWorkflowBudget {
  readonly budget?: { readonly maxTokens: number };
  readonly notice?: WorkflowBudgetReport;
}

/**
 * Resolve a run's token ceiling. A ceiling is passed to the engine only when
 * `NEXUS_BUDGET_ENFORCE` is on AND the caller set `maxTokens`. Every other
 * case is uncapped (the engine is called exactly as before) and, unless
 * neither the flag nor `maxTokens` is set, reports `not_enforced` with why.
 */
export function resolveWorkflowBudget(
  deps: RunWorkflowDeps,
  workflowName: string,
  maxTokens: number | undefined
): ResolvedWorkflowBudget {
  if (!isBudgetEnforcementEnabled()) {
    if (maxTokens === undefined) return {};
    const reason = 'NEXUS_BUDGET_ENFORCE is off; the run was not capped';
    return { notice: { status: 'not_enforced', requestedMaxTokens: maxTokens, reason } };
  }
  if (maxTokens === undefined) {
    return { notice: { status: 'not_enforced', reason: 'no caller ceiling (maxTokens)' } };
  }
  (deps.logger ?? createLogger({ tool: 'run_workflow' })).info(
    'Caller-supplied workflow token budget enforced (#4754)',
    { workflow: workflowName, maxTokens }
  );
  return { budget: { maxTokens } };
}

/**
 * The budget report for a completed run. An engine that was handed a ceiling
 * but reports no outcome (a DI engine that ignores `options.budget`) did not
 * enforce it — say so rather than let absence read as "within budget".
 */
export function reportedBudget(
  requested: { readonly maxTokens: number } | undefined,
  reported: WorkflowBudgetOutcome | undefined
): WorkflowBudgetReport | undefined {
  if (reported !== undefined) return reported;
  if (requested === undefined) return undefined;
  return {
    status: 'not_enforced',
    requestedMaxTokens: requested.maxTokens,
    reason: 'engine did not report budget',
  };
}

/** Attach a `not_enforced` notice to a result; the engine's own outcome otherwise stands. */
export function withBudgetNotice(
  result: WorkflowToolResult,
  notice: WorkflowBudgetReport | undefined
): WorkflowToolResult {
  return notice === undefined ? result : { ...result, budget: notice };
}

function isStepResult(value: unknown): value is StepResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['stepId'] === 'string' && typeof v['status'] === 'string';
}

/** Failure-envelope fields for a budget halt (#4754). */
interface BudgetHaltFailure {
  readonly budget?: unknown;
  readonly stepResults?: StepResultSummary[];
  readonly errorCategory?: 'business';
}

/**
 * Failure-envelope fields for a budget halt, or none when the failure was not
 * one. A halt is a policy refusal — `business`, not the `internal` bug class —
 * and the phases that completed before it are reported, not dropped. The
 * engine puts `budget` and `completedSteps` on the WorkflowError context
 * (`WorkflowBudgetTracker.settlePhase`).
 */
export function budgetHaltFailure(context: Record<string, unknown> | undefined): BudgetHaltFailure {
  const budget = context?.['budget'];
  if (budget === undefined) return {};
  const steps = context?.['completedSteps'];
  const completed = Array.isArray(steps) ? steps.filter(isStepResult) : [];
  return { budget, stepResults: completed.map(toStepResultSummary), errorCategory: 'business' };
}
