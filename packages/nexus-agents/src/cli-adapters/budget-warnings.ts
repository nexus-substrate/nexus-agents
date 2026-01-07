/**
 * Budget warning generation utilities.
 *
 * @module cli-adapters/budget-warnings
 * (Source: Issue #102, arXiv:2508.21141 - EMNLP 2025)
 */

import type { BudgetWarning, SessionBudget } from './types.js';

/**
 * Warning thresholds configuration.
 */
export interface WarningThresholds {
  readonly info: number;
  readonly warning: number;
  readonly critical: number;
}

/**
 * Get warning level based on utilization and thresholds.
 */
export function getWarningLevel(
  utilization: number,
  thresholds: WarningThresholds
): BudgetWarning['level'] | null {
  if (utilization >= thresholds.critical) return 'critical';
  if (utilization >= thresholds.warning) return 'warning';
  if (utilization >= thresholds.info) return 'info';
  return null;
}

/**
 * Create a token budget warning.
 */
export function createTokenWarning(
  utilization: number,
  thresholds: WarningThresholds,
  remaining: number
): BudgetWarning | null {
  const level = getWarningLevel(utilization, thresholds);
  if (level === null) return null;

  const pct = String(Math.round(utilization));
  const message =
    level === 'critical'
      ? `Token budget ${pct}% utilized after this task`
      : level === 'warning'
        ? `Token budget approaching limit (${pct}%)`
        : `Token budget ${pct}% utilized`;

  return {
    level,
    message,
    constraint: 'tokens',
    utilizationPercent: utilization,
    estimatedRemaining: remaining,
  };
}

/**
 * Create a cost budget warning.
 */
export function createCostWarning(
  utilization: number,
  thresholds: WarningThresholds,
  remaining: number
): BudgetWarning | null {
  const level = getWarningLevel(utilization, thresholds);
  if (level === null || level === 'info') return null; // Only warning/critical for cost

  const pct = String(Math.round(utilization));
  const message =
    level === 'critical'
      ? `Cost budget ${pct}% utilized after this task`
      : `Cost budget approaching limit (${pct}%)`;

  return {
    level,
    message,
    constraint: 'cost',
    utilizationPercent: utilization,
    estimatedRemaining: remaining,
  };
}

/**
 * Generate all applicable warnings for a budget operation.
 */
export function generateBudgetWarnings(
  currentBudget: SessionBudget,
  estimatedTokens: number,
  estimatedCostUsd: number,
  rawThresholds: Partial<WarningThresholds>
): BudgetWarning[] {
  const thresholds: WarningThresholds = {
    info: rawThresholds.info ?? 50,
    warning: rawThresholds.warning ?? 75,
    critical: rawThresholds.critical ?? 90,
  };

  const warnings: BudgetWarning[] = [];

  // Token budget warnings
  const projectedTokenUtilization =
    ((currentBudget.tokensUsed + estimatedTokens) / currentBudget.tokenBudget) * 100;
  const tokenWarning = createTokenWarning(
    projectedTokenUtilization,
    thresholds,
    currentBudget.tokensRemaining - estimatedTokens
  );
  if (tokenWarning !== null) {
    warnings.push(tokenWarning);
  }

  // Cost budget warnings
  const projectedCostUtilization =
    ((currentBudget.costSpentUsd + estimatedCostUsd) / currentBudget.costBudgetUsd) * 100;
  const costWarning = createCostWarning(
    projectedCostUtilization,
    thresholds,
    currentBudget.costRemainingUsd - estimatedCostUsd
  );
  if (costWarning !== null) {
    warnings.push(costWarning);
  }

  return warnings;
}
