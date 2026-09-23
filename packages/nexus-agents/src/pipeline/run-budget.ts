/**
 * Run-budget resolution behind `NEXUS_BUDGET_ENFORCE` (#3262, #4754).
 *
 * One place reads the `NEXUS_BUDGET_ENFORCE` gate, so `run_pipeline` and
 * `run_workflow` cannot drift apart on flag semantics. The estimate-relative
 * ceiling is run_pipeline's only: run_workflow caps on a caller `maxTokens`
 * alone, because an input-derived estimate sits far below real workflow step
 * spend (#4754). Enforcement itself is {@link createBudgetGuard}.
 *
 * @module pipeline/run-budget
 */
import { parseBoolEnv } from '../config/defaults-env.js';
import type { ILogger } from '../core/index.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import type { AgentBudgetConfig } from './budget-guard.js';
import { estimateRelativeBudget, resolveBudgetTolerance } from './budget-guard.js';

/** Typical LLM output:input token ratio (matches `buildDryRunReport`). */
const OUTPUT_TOKEN_RATIO = 0.6;

/** What a caller knows about the run it wants capped. */
export interface RunBudgetRequest {
  /** Text the per-call token estimate is derived from (task, goal or inputs). */
  readonly estimateText: string;
  /** Number of model calls the run is expected to make (stages or steps). */
  readonly callCount: number;
  readonly logger: ILogger;
  /** Extra fields for the enforcement log line (template, workflow, ...). */
  readonly logContext?: Record<string, unknown>;
}

/** Whether `NEXUS_BUDGET_ENFORCE` is on (`true`/`1`; default off — #5155). */
export function isBudgetEnforcementEnabled(): boolean {
  return parseBoolEnv('NEXUS_BUDGET_ENFORCE', false);
}

/**
 * Resolve a run's token ceiling. Returns `undefined` (→ the no-op guard, so the
 * run is byte-for-byte unchanged) when enforcement is off. With it on, the run
 * is approximated as `perCallTokens × callCount` and capped at `× NEXUS_BUDGET_TOLERANCE`.
 * Token-based — never dollars — so it holds under `NEXUS_BILLING_MODE=plan`.
 * A run with no usable estimate (including zero calls) fails OPEN, and says so.
 */
export function resolveEnforcedRunBudget(req: RunBudgetRequest): AgentBudgetConfig | undefined {
  if (!isBudgetEnforcementEnabled()) return undefined;
  const { logger, logContext } = req;
  const perCall = Math.round(
    createSharedTaskAnalyzer().estimateTokens(req.estimateText) * (1 + OUTPUT_TOKEN_RATIO)
  );
  const budget = estimateRelativeBudget(perCall * req.callCount, resolveBudgetTolerance());
  if (budget === undefined) {
    logger.warn('Budget enforcement on but no usable token estimate — running unguarded (#3262)', {
      ...logContext,
      perCall,
      callCount: req.callCount,
    });
    return undefined;
  }
  logger.info('Estimate-relative token budget enforced (#3262)', {
    ...logContext,
    callCount: req.callCount,
    maxTokens: budget.maxTokens,
  });
  return budget;
}
