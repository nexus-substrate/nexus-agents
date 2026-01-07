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
  CliName,
} from './types.js';

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
    cli: 'claude' as CliName,
    retryable: false,
    constraint,
    limit,
    current,
    suggestion,
  };
}
