/**
 * Budget error creation utilities.
 *
 * @module cli-adapters/budget-errors
 * (Source: Issue #102, arXiv:2508.21141 - EMNLP 2025)
 */

import type {
  BudgetConstraint,
  SessionBudget,
  BudgetExceededError,
  BudgetRoutingResult,
} from './types.js';
import { DEFAULT_CLI } from '../config/model-capabilities-types.js';
import { DEFAULT_COST_MODELS } from './budget-router-types.js';

/**
 * Latency of the fastest model in the cost table, reported as `current` on a
 * latency violation (#4907) — the best any candidate could have done.
 */
function fastestCandidateLatencyMs(): number {
  const values = Object.values(DEFAULT_COST_MODELS).map((m) => m.avgLatencyMs);
  // Named empty case: an empty cost table means nothing to compare, and
  // `Math.min()` of nothing is `Infinity`, which would read as "unboundedly
  // slow" rather than "unknown".
  return values.length === 0 ? 0 : Math.min(...values);
}

/**
 * The latency arm of {@link determineExceededConstraint} (#4907).
 *
 * `'latency'` was a declared member of the constraint union with no producer,
 * so a consumer switching on it had an arm that could never run. It fires only
 * when a latency budget was set AND no adapter was selectable, which is the
 * one state where latency — rather than the session totals — is the reason.
 */
function latencyExceeded(
  budget: BudgetConstraint,
  result: BudgetRoutingResult
): { constraint: 'latency'; limit: number; current: number; suggestion: string } | undefined {
  if (budget.maxLatencyMs === undefined) return undefined;
  if (result.adapter !== null || result.estimatedLatencyMs !== undefined) return undefined;
  return {
    constraint: 'latency',
    limit: budget.maxLatencyMs,
    current: fastestCandidateLatencyMs(),
    suggestion: 'Raise the latency budget or add a faster model',
  };
}

/**
 * Determine which constraint was exceeded.
 */
export function determineExceededConstraint(
  budget: BudgetConstraint,
  result: BudgetRoutingResult,
  currentBudget: SessionBudget
): {
  constraint: 'tokens' | 'cost' | 'latency';
  limit: number;
  current: number;
  suggestion: string;
} {
  if (budget.maxTokens !== undefined && result.estimatedTokens > budget.maxTokens) {
    return {
      constraint: 'tokens',
      limit: budget.maxTokens,
      current: result.estimatedTokens,
      suggestion: 'Reduce task complexity or increase token budget',
    };
  }
  if (budget.maxCostUsd !== undefined && result.estimatedCostUsd > budget.maxCostUsd) {
    return {
      constraint: 'cost',
      limit: budget.maxCostUsd,
      current: result.estimatedCostUsd,
      suggestion: 'Use a cheaper model or increase cost budget',
    };
  }
  // #4907: `'latency'` was a declared member of this union with no producer,
  // so a consumer switching on `constraint` had an arm that could never run.
  // Reported before the session-budget arms because a latency rejection means
  // no adapter was selectable at all — the session totals are not why.
  const latencyViolation = latencyExceeded(budget, result);
  if (latencyViolation !== undefined) return latencyViolation;
  if (currentBudget.tokensRemaining < result.estimatedTokens) {
    return {
      constraint: 'tokens',
      limit: currentBudget.tokenBudget,
      current: currentBudget.tokensUsed + result.estimatedTokens,
      suggestion: 'Wait for budget reset or increase session budget',
    };
  }
  return {
    constraint: 'cost',
    limit: currentBudget.costBudgetUsd,
    current: currentBudget.costSpentUsd + result.estimatedCostUsd,
    suggestion: 'Wait for budget reset or increase session budget',
  };
}

/**
 * Create a budget exceeded error.
 */
export function createBudgetExceededError(
  budget: BudgetConstraint,
  result: BudgetRoutingResult,
  currentBudget: SessionBudget
): BudgetExceededError {
  const { constraint, limit, current, suggestion } = determineExceededConstraint(
    budget,
    result,
    currentBudget
  );
  return {
    code: 'BUDGET_EXCEEDED',
    message: `Budget constraint exceeded: ${constraint}`,
    cli: DEFAULT_CLI,
    retryable: false,
    constraint,
    limit,
    current,
    suggestion,
  };
}
