/**
 * nexus-agents/context - Token Budget Tracker
 *
 * Implements token budget tracking with exponential moving average (EMA).
 * Based on Issue #304 from Agent Improvement Epic #301.
 *
 * EMA Formula: tokenEMA = alpha * currentTokens + (1 - alpha) * tokenEMA
 *
 * @module context/token-budget-tracker
 */

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/logger.js';
import type {
  ITokenBudgetTracker,
  TokenBudgetConfig,
  TokenUsageRecord,
  BudgetCheckResult,
  BudgetStats,
} from './token-budget-types.js';
import { DEFAULT_TOKEN_BUDGET_CONFIG } from './token-budget-types.js';
import {
  collectBudgetWarnings,
  createHardModeResult,
  logBudgetWarning,
  logWarnModeExceeded,
} from './token-budget-helpers.js';

// Re-export types for convenience
export type {
  ITokenBudgetTracker,
  TokenBudgetConfig,
  TokenUsageRecord,
  BudgetCheckResult,
  BudgetStats,
  BudgetWarning,
  BudgetWarningLevel,
} from './token-budget-types.js';
export { TokenBudgetError, DEFAULT_TOKEN_BUDGET_CONFIG } from './token-budget-types.js';

// Re-export helper functions
export {
  generateBudgetWarning,
  logBudgetWarning,
  collectBudgetWarnings,
  createHardModeResult,
  logWarnModeExceeded,
} from './token-budget-helpers.js';
export type {
  WarningThresholds,
  BudgetState,
  HardModeParams,
  WarnModeParams,
} from './token-budget-helpers.js';

/**
 * Token budget tracker with EMA-based prediction.
 *
 * Tracks token usage across operations with exponential moving average
 * for predicting future usage. Provides configurable warnings and
 * enforcement modes (warn vs hard-stop).
 *
 * @example
 * ```typescript
 * const tracker = new TokenBudgetTracker({
 *   maxTokensPerTask: 50000,
 *   emaAlpha: 0.3,
 *   enforcementMode: 'warn', // Default: warn only
 * });
 *
 * // Check budget before operation
 * const check = tracker.checkBudget(estimatedTokens);
 * if (check.warnings.length > 0) {
 *   console.log('Budget warnings:', check.warnings);
 * }
 *
 * // Record actual usage after operation
 * tracker.recordUsage({
 *   timestamp: Date.now(),
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   totalTokens: 1500,
 * });
 *
 * // Get predicted usage for next operation
 * const predicted = tracker.predictNextTokens();
 * ```
 */
export class TokenBudgetTracker implements ITokenBudgetTracker {
  private config: Required<TokenBudgetConfig>;
  private readonly logger: ILogger;

  // Session-level tracking
  private sessionTokensUsed = 0;
  private sessionOperationCount = 0;

  // Task-level tracking
  private taskTokensUsed = 0;
  private taskOperationCount = 0;
  private currentTaskId: string | undefined = undefined;

  // EMA tracking
  private tokenUsageEma = 0;
  private hasEmaInitialized = false;

  /**
   * Creates a new TokenBudgetTracker instance.
   *
   * @param config - Token budget configuration
   * @param logger - Optional logger instance
   */
  constructor(config: TokenBudgetConfig = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_TOKEN_BUDGET_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'token-budget-tracker' });
  }

  /**
   * Check if an operation is within budget.
   */
  checkBudget(estimatedTokens: number): BudgetCheckResult {
    const warnings = collectBudgetWarnings(
      estimatedTokens,
      { sessionTokensUsed: this.sessionTokensUsed, taskTokensUsed: this.taskTokensUsed },
      this.config
    );
    const remainingSessionBudget = this.config.maxTokensPerSession - this.sessionTokensUsed;
    const remainingTaskBudget = this.config.maxTokensPerTask - this.taskTokensUsed;

    const projectedSessionUsage = this.sessionTokensUsed + estimatedTokens;
    const projectedTaskUsage = this.taskTokensUsed + estimatedTokens;
    const exceedsSessionBudget = projectedSessionUsage > this.config.maxTokensPerSession;
    const exceedsTaskBudget = projectedTaskUsage > this.config.maxTokensPerTask;
    const exceeds = exceedsSessionBudget || exceedsTaskBudget;

    for (const warning of warnings) {
      logBudgetWarning(warning, this.logger);
    }

    if (exceeds && this.config.enforcementMode === 'hard') {
      return createHardModeResult({
        estimatedTokens,
        exceedsSession: exceedsSessionBudget,
        remainingSessionBudget,
        remainingTaskBudget,
        warnings,
        sessionTokensUsed: this.sessionTokensUsed,
        taskTokensUsed: this.taskTokensUsed,
        maxTokensPerSession: this.config.maxTokensPerSession,
        maxTokensPerTask: this.config.maxTokensPerTask,
      });
    }

    if (exceeds && this.config.enforcementMode === 'warn') {
      logWarnModeExceeded(
        {
          exceedsSession: exceedsSessionBudget,
          exceedsTask: exceedsTaskBudget,
          estimatedTokens,
          sessionUsed: this.sessionTokensUsed,
          taskUsed: this.taskTokensUsed,
        },
        this.logger
      );
    }

    return {
      allowed: true,
      estimatedTokens,
      remainingSessionBudget: Math.max(0, remainingSessionBudget),
      remainingTaskBudget: Math.max(0, remainingTaskBudget),
      warnings,
    };
  }

  /**
   * Record actual token usage after an operation.
   */
  recordUsage(usage: TokenUsageRecord): void {
    // Update session totals
    this.sessionTokensUsed += usage.totalTokens;
    this.sessionOperationCount++;

    // Update task totals
    this.taskTokensUsed += usage.totalTokens;
    this.taskOperationCount++;

    // Update EMA: tokenEMA = alpha * currentTokens + (1 - alpha) * tokenEMA
    if (!this.hasEmaInitialized) {
      // Initialize EMA with first observation
      this.tokenUsageEma = usage.totalTokens;
      this.hasEmaInitialized = true;
    } else {
      this.tokenUsageEma =
        this.config.emaAlpha * usage.totalTokens + (1 - this.config.emaAlpha) * this.tokenUsageEma;
    }

    this.logger.debug('Token usage recorded', {
      taskId: usage.taskId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      sessionTotal: this.sessionTokensUsed,
      taskTotal: this.taskTokensUsed,
      ema: Math.round(this.tokenUsageEma),
    });
  }

  /**
   * Start a new task context.
   */
  startTask(taskId?: string): void {
    this.taskTokensUsed = 0;
    this.taskOperationCount = 0;
    this.currentTaskId = taskId;

    this.logger.debug('Task started', {
      taskId,
      sessionTokensUsed: this.sessionTokensUsed,
    });
  }

  /**
   * End the current task context.
   */
  endTask(): BudgetStats {
    const stats = this.getStats();

    this.logger.debug('Task ended', {
      taskId: this.currentTaskId,
      taskTokensUsed: this.taskTokensUsed,
      taskOperations: this.taskOperationCount,
    });

    // Reset task-level tracking
    this.taskTokensUsed = 0;
    this.taskOperationCount = 0;
    this.currentTaskId = undefined;

    return stats;
  }

  /**
   * Reset session budget.
   */
  resetSession(): void {
    this.sessionTokensUsed = 0;
    this.sessionOperationCount = 0;
    this.taskTokensUsed = 0;
    this.taskOperationCount = 0;
    // Keep EMA for continuity across sessions

    this.logger.info('Session budget reset', {
      previousEma: Math.round(this.tokenUsageEma),
    });
  }

  /**
   * Get current budget statistics.
   */
  getStats(): BudgetStats {
    const sessionUtilization =
      this.config.maxTokensPerSession > 0
        ? (this.sessionTokensUsed / this.config.maxTokensPerSession) * 100
        : 0;

    const taskUtilization =
      this.config.maxTokensPerTask > 0
        ? (this.taskTokensUsed / this.config.maxTokensPerTask) * 100
        : 0;

    return {
      sessionTokensUsed: this.sessionTokensUsed,
      taskTokensUsed: this.taskTokensUsed,
      tokenUsageEma: Math.round(this.tokenUsageEma),
      operationCount: this.sessionOperationCount,
      sessionUtilizationPercent: Math.round(sessionUtilization * 100) / 100,
      taskUtilizationPercent: Math.round(taskUtilization * 100) / 100,
      predictedNextTokens: this.predictNextTokens(),
    };
  }

  /**
   * Get the predicted tokens for the next operation based on EMA.
   */
  predictNextTokens(): number {
    if (!this.hasEmaInitialized) {
      // No data yet, return a conservative estimate
      return Math.round(this.config.maxTokensPerTask * 0.1);
    }
    return Math.round(this.tokenUsageEma);
  }

  /**
   * Update configuration dynamically.
   */
  updateConfig(config: Partial<TokenBudgetConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug('Config updated', { newConfig: this.config });
  }
}

/**
 * Creates a TokenBudgetTracker instance with the specified configuration.
 *
 * @param config - Token budget configuration
 * @param logger - Optional logger instance
 * @returns Configured TokenBudgetTracker instance
 *
 * @example
 * ```typescript
 * const tracker = createTokenBudgetTracker({
 *   maxTokensPerTask: 50000,
 *   enforcementMode: 'warn',
 * });
 * ```
 */
export function createTokenBudgetTracker(
  config: TokenBudgetConfig = {},
  logger?: ILogger
): TokenBudgetTracker {
  return new TokenBudgetTracker(config, logger);
}
