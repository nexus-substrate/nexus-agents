/**
 * Budget constraint construction and the budget feature the LinUCB bandit uses.
 *
 * Its own module because the routing path and the outcome path must derive the
 * feature identically, and a shared formula living in either caller's file
 * reads as belonging to that caller (#4910).
 *
 * @module cli-adapters/composite-router-budget-feature
 */
import type { BudgetRouter } from './budget-router.js';
import type { CliTask, BudgetConstraint } from './types.js';
import type { CompositeRouterConfig } from './composite-router-types.js';

/** Narrows the router config's budget constraints to a {@link BudgetConstraint}. */
export function toBudgetConstraint(
  raw: CompositeRouterConfig['budgetConstraints']
): BudgetConstraint {
  const constraint: BudgetConstraint = {};
  if (raw?.maxTokens !== undefined) {
    (constraint as { maxTokens: number }).maxTokens = raw.maxTokens;
  }
  if (raw?.maxCostUsd !== undefined) {
    (constraint as { maxCostUsd: number }).maxCostUsd = raw.maxCostUsd;
  }
  if (raw?.maxLatencyMs !== undefined) {
    (constraint as { maxLatencyMs: number }).maxLatencyMs = raw.maxLatencyMs;
  }
  return constraint;
}

/**
 * The share of the cost ceiling a projected spend consumes, or undefined when
 * no ceiling is configured.
 *
 * Mirrors BudgetFilterStage's formula (budget-stage.ts:233), over the selected
 * adapter's projected cost rather than an average across candidates — this is
 * the spend actually being contemplated.
 *
 * Extracted so the routing path and the outcome path cannot drift: LinUCB fits
 * its weights against the feature vector handed to `update` and scores with the
 * one handed to `selectArm`, so the two computing this differently biases every
 * arm's estimate (#4910).
 */
export function budgetUtilizationOf(
  estimatedCostUsd: number,
  maxCostUsd: number | undefined
): number | undefined {
  if (maxCostUsd === undefined || maxCostUsd <= 0) return undefined;
  return Math.min(1, estimatedCostUsd / maxCostUsd);
}

/**
 * Recompute the routing-time budget utilization for a task after the fact.
 *
 * `checkBudget` is a pure function of the task and the constraint, so the
 * outcome path can reproduce the selection-time value exactly rather than
 * caching it across the request boundary.
 */
export function budgetUtilizationForTask(
  task: CliTask,
  budgetRouter: BudgetRouter | undefined,
  rawConstraints: CompositeRouterConfig['budgetConstraints']
): number | undefined {
  if (budgetRouter === undefined) return undefined;
  const constraint = toBudgetConstraint(rawConstraints);
  const result = budgetRouter.checkBudget(task, constraint);
  return budgetUtilizationOf(result.estimatedCostUsd, constraint.maxCostUsd);
}
