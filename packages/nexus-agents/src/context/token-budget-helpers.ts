/**
 * nexus-agents/context - Token Budget Helpers
 *
 * Helper functions for token budget warning generation and logging.
 * Extracted from token-budget-tracker.ts to maintain file size limits.
 *
 * @module context/token-budget-helpers
 * (Source: Issue #339)
 */

import type { ILogger } from '../core/index.js';
import type { BudgetWarning, BudgetWarningLevel, TokenBudgetConfig } from './token-budget-types.js';
import { TokenBudgetError } from './token-budget-types.js';

// ============================================================================
// Warning Generation
// ============================================================================

/**
 * Warning threshold configuration for budget checks.
 */
export interface WarningThresholds {
  readonly criticalThreshold: number;
  readonly warningThreshold: number;
}

/**
 * Generate a warning based on utilization level.
 *
 * @param utilizationPercent - Current utilization as percentage (0-100+)
 * @param tokensUsed - Number of tokens used
 * @param budgetLimit - Maximum budget limit
 * @param scope - Whether this is a task or session budget
 * @param thresholds - Warning thresholds configuration
 * @returns Warning object if threshold exceeded, undefined otherwise
 */
export function generateBudgetWarning(
  utilizationPercent: number,
  tokensUsed: number,
  budgetLimit: number,
  scope: 'task' | 'session',
  thresholds: WarningThresholds
): BudgetWarning | undefined {
  let level: BudgetWarningLevel | undefined;

  if (utilizationPercent >= thresholds.criticalThreshold) {
    level = 'critical';
  } else if (utilizationPercent >= thresholds.warningThreshold) {
    level = 'warning';
  } else if (utilizationPercent >= 50) {
    level = 'info';
  }

  if (level === undefined) {
    return undefined;
  }

  const remaining = Math.max(0, budgetLimit - tokensUsed);
  return {
    level,
    message:
      `${scope.charAt(0).toUpperCase() + scope.slice(1)} token budget at ` +
      `${String(Math.round(utilizationPercent))}% (${String(remaining)} tokens remaining)`,
    usagePercent: utilizationPercent,
    tokensUsed,
    budgetLimit,
    scope,
  };
}

/**
 * Log a warning at the appropriate level.
 *
 * @param warning - The budget warning to log
 * @param logger - Logger instance to use
 */
export function logBudgetWarning(warning: BudgetWarning, logger: ILogger): void {
  const context = {
    scope: warning.scope,
    usagePercent: Math.round(warning.usagePercent),
    tokensUsed: warning.tokensUsed,
    budgetLimit: warning.budgetLimit,
  };

  switch (warning.level) {
    case 'critical':
      logger.warn(warning.message, context);
      break;
    case 'warning':
      logger.warn(warning.message, context);
      break;
    case 'info':
      logger.info(warning.message, context);
      break;
  }
}

// ============================================================================
// Warning Collection
// ============================================================================

/**
 * Budget state for warning collection.
 */
export interface BudgetState {
  readonly sessionTokensUsed: number;
  readonly taskTokensUsed: number;
}

/**
 * Collect budget warnings for session and task.
 *
 * @param estimatedTokens - Estimated tokens for the operation
 * @param state - Current budget state
 * @param config - Budget configuration with limits and thresholds
 * @returns Array of budget warnings
 */
export function collectBudgetWarnings(
  estimatedTokens: number,
  state: BudgetState,
  config: Required<TokenBudgetConfig>
): BudgetWarning[] {
  const warnings: BudgetWarning[] = [];
  const projectedSessionUsage = state.sessionTokensUsed + estimatedTokens;
  const projectedTaskUsage = state.taskTokensUsed + estimatedTokens;

  const sessionUtilization = (projectedSessionUsage / config.maxTokensPerSession) * 100;
  const sessionWarning = generateBudgetWarning(
    sessionUtilization,
    projectedSessionUsage,
    config.maxTokensPerSession,
    'session',
    { criticalThreshold: config.criticalThreshold, warningThreshold: config.warningThreshold }
  );
  if (sessionWarning !== undefined) {
    warnings.push(sessionWarning);
  }

  const taskUtilization = (projectedTaskUsage / config.maxTokensPerTask) * 100;
  const taskWarning = generateBudgetWarning(
    taskUtilization,
    projectedTaskUsage,
    config.maxTokensPerTask,
    'task',
    { criticalThreshold: config.criticalThreshold, warningThreshold: config.warningThreshold }
  );
  if (taskWarning !== undefined) {
    warnings.push(taskWarning);
  }

  return warnings;
}

// ============================================================================
// Hard Mode Result
// ============================================================================

/**
 * Parameters for creating a hard mode budget exceeded result.
 */
export interface HardModeParams {
  readonly estimatedTokens: number;
  readonly exceedsSession: boolean;
  readonly remainingSessionBudget: number;
  readonly remainingTaskBudget: number;
  readonly warnings: readonly BudgetWarning[];
  readonly sessionTokensUsed: number;
  readonly taskTokensUsed: number;
  readonly maxTokensPerSession: number;
  readonly maxTokensPerTask: number;
}

/**
 * Create a budget check result for hard mode budget exceeded.
 *
 * @param params - Parameters for the result
 * @returns Budget check result with error
 */
export function createHardModeResult(params: HardModeParams): {
  allowed: false;
  estimatedTokens: number;
  remainingSessionBudget: number;
  remainingTaskBudget: number;
  warnings: readonly BudgetWarning[];
  error: TokenBudgetError;
} {
  const scope = params.exceedsSession ? 'session' : 'task';
  const limit = params.exceedsSession ? params.maxTokensPerSession : params.maxTokensPerTask;
  const used = params.exceedsSession ? params.sessionTokensUsed : params.taskTokensUsed;

  return {
    allowed: false,
    estimatedTokens: params.estimatedTokens,
    remainingSessionBudget: params.remainingSessionBudget,
    remainingTaskBudget: params.remainingTaskBudget,
    warnings: params.warnings,
    error: new TokenBudgetError(
      `Token budget exceeded: ${scope} limit of ${String(limit)} tokens would be exceeded ` +
        `(current: ${String(used)}, estimated: ${String(params.estimatedTokens)})`,
      {
        context: {
          scope,
          limit,
          currentUsage: used,
          estimatedTokens: params.estimatedTokens,
          wouldUse: used + params.estimatedTokens,
        },
      }
    ),
  };
}

// ============================================================================
// Warn Mode Logging
// ============================================================================

/**
 * Parameters for warn mode exceeded logging.
 */
export interface WarnModeParams {
  readonly exceedsSession: boolean;
  readonly exceedsTask: boolean;
  readonly estimatedTokens: number;
  readonly sessionUsed: number;
  readonly taskUsed: number;
}

/**
 * Log warn mode exceeded message.
 *
 * @param params - Warn mode parameters
 * @param logger - Logger instance
 */
export function logWarnModeExceeded(params: WarnModeParams, logger: ILogger): void {
  logger.warn('Token budget would be exceeded (warn mode - continuing)', {
    exceedsSession: params.exceedsSession,
    exceedsTask: params.exceedsTask,
    estimatedTokens: params.estimatedTokens,
    sessionUsed: params.sessionUsed,
    taskUsed: params.taskUsed,
  });
}
