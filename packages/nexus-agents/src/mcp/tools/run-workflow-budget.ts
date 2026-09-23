/**
 * run_workflow token-ceiling resolution (#4754).
 *
 * The tool half of workflow budget enforcement: decide the ceiling (through
 * the SAME `NEXUS_BUDGET_ENFORCE` gate and estimator as run_pipeline) and tell
 * the caller when a requested ceiling was not enforced. The engine
 * (`workflows/workflow-budget.ts`) does the enforcing.
 *
 * @module mcp/tools/run-workflow-budget
 */
import { createLogger } from '../../core/index.js';
import type { WorkflowDefinition } from '../../core/index.js';
import { isBudgetEnforcementEnabled, resolveEnforcedRunBudget } from '../../pipeline/run-budget.js';
import type {
  RunWorkflowDeps,
  WorkflowBudgetReport,
  WorkflowToolResult,
} from './run-workflow-types.js';

/** The ceiling for the engine, and/or what to tell the caller about it. */
interface ResolvedWorkflowBudget {
  readonly budget?: { readonly maxTokens: number };
  readonly notice?: WorkflowBudgetReport;
}

/**
 * Resolve a run's token ceiling. Flag off → uncapped, and the engine is called
 * exactly as before; an explicit `maxTokens` is then reported as
 * `not_enforced` rather than silently dropped. Flag on → `maxTokens`, else an
 * estimate-relative ceiling of one model call per workflow step over the
 * serialized inputs.
 */
export function resolveWorkflowBudget(
  deps: RunWorkflowDeps,
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>,
  maxTokens: number | undefined
): ResolvedWorkflowBudget {
  if (!isBudgetEnforcementEnabled()) {
    if (maxTokens === undefined) return {};
    const reason = 'NEXUS_BUDGET_ENFORCE is off; the run was not capped';
    return { notice: { status: 'not_enforced', requestedMaxTokens: maxTokens, reason } };
  }
  const budget = resolveEnforcedRunBudget({
    estimateText: JSON.stringify(inputs),
    callCount: workflow.steps.length,
    maxTokens,
    logger: deps.logger ?? createLogger({ tool: 'run_workflow' }),
    logContext: { workflow: workflow.name },
  });
  return budget === undefined ? {} : { budget };
}

/** Attach a `not_enforced` notice to a result; the engine's own outcome otherwise stands. */
export function withBudgetNotice(
  result: WorkflowToolResult,
  notice: WorkflowBudgetReport | undefined
): WorkflowToolResult {
  return notice === undefined ? result : { ...result, budget: notice };
}
