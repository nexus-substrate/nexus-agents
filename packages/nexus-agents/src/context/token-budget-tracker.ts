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
  BudgetWarning,
  BudgetWarningLevel,
} from './token-budget-types.js';
import { TokenBudgetError, DEFAULT_TOKEN_BUDGET_CONFIG } from './token-budget-types.js';

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
    const warnings = this.collectWarnings(estimatedTokens);
    const remainingSessionBudget = this.config.maxTokensPerSession - this.sessionTokensUsed;
    const remainingTaskBudget = this.config.maxTokensPerTask - this.taskTokensUsed;

    const projectedSessionUsage = this.sessionTokensUsed + estimatedTokens;
    const projectedTaskUsage = this.taskTokensUsed + estimatedTokens;
    const exceedsSessionBudget = projectedSessionUsage > this.config.maxTokensPerSession;
    const exceedsTaskBudget = projectedTaskUsage > this.config.maxTokensPerTask;
    const exceeds = exceedsSessionBudget || exceedsTaskBudget;

    for (const warning of warnings) {
      this.logWarning(warning);
    }

    if (exceeds && this.config.enforcementMode === 'hard') {
      return this.createHardModeResult(
        estimatedTokens,
        exceedsSessionBudget,
        remainingSessionBudget,
        remainingTaskBudget,
        warnings
      );
    }

    if (exceeds && this.config.enforcementMode === 'warn') {
      this.logWarnModeExceeded(exceedsSessionBudget, exceedsTaskBudget, estimatedTokens);
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
   * Collect budget warnings for session and task.
   */
  private collectWarnings(estimatedTokens: number): BudgetWarning[] {
    const warnings: BudgetWarning[] = [];
    const projectedSessionUsage = this.sessionTokensUsed + estimatedTokens;
    const projectedTaskUsage = this.taskTokensUsed + estimatedTokens;

    const sessionUtilization = (projectedSessionUsage / this.config.maxTokensPerSession) * 100;
    const sessionWarning = this.generateWarning(
      sessionUtilization,
      projectedSessionUsage,
      this.config.maxTokensPerSession,
      'session'
    );
    if (sessionWarning !== undefined) {
      warnings.push(sessionWarning);
    }

    const taskUtilization = (projectedTaskUsage / this.config.maxTokensPerTask) * 100;
    const taskWarning = this.generateWarning(
      taskUtilization,
      projectedTaskUsage,
      this.config.maxTokensPerTask,
      'task'
    );
    if (taskWarning !== undefined) {
      warnings.push(taskWarning);
    }

    return warnings;
  }

  /**
   * Create a result for hard mode budget exceeded.
   */
  private createHardModeResult(
    estimatedTokens: number,
    exceedsSession: boolean,
    remainingSessionBudget: number,
    remainingTaskBudget: number,
    warnings: BudgetWarning[]
  ): BudgetCheckResult {
    const scope = exceedsSession ? 'session' : 'task';
    const limit = exceedsSession ? this.config.maxTokensPerSession : this.config.maxTokensPerTask;
    const used = exceedsSession ? this.sessionTokensUsed : this.taskTokensUsed;

    return {
      allowed: false,
      estimatedTokens,
      remainingSessionBudget,
      remainingTaskBudget,
      warnings,
      error: new TokenBudgetError(
        `Token budget exceeded: ${scope} limit of ${String(limit)} tokens would be exceeded ` +
          `(current: ${String(used)}, estimated: ${String(estimatedTokens)})`,
        {
          context: {
            scope,
            limit,
            currentUsage: used,
            estimatedTokens,
            wouldUse: used + estimatedTokens,
          },
        }
      ),
    };
  }

  /**
   * Log warn mode exceeded message.
   */
  private logWarnModeExceeded(
    exceedsSession: boolean,
    exceedsTask: boolean,
    estimatedTokens: number
  ): void {
    this.logger.warn('Token budget would be exceeded (warn mode - continuing)', {
      exceedsSession,
      exceedsTask,
      estimatedTokens,
      sessionUsed: this.sessionTokensUsed,
      taskUsed: this.taskTokensUsed,
    });
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

  /**
   * Generate a warning based on utilization level.
   */
  private generateWarning(
    utilizationPercent: number,
    tokensUsed: number,
    budgetLimit: number,
    scope: 'task' | 'session'
  ): BudgetWarning | undefined {
    let level: BudgetWarningLevel | undefined;

    if (utilizationPercent >= this.config.criticalThreshold) {
      level = 'critical';
    } else if (utilizationPercent >= this.config.warningThreshold) {
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
   */
  private logWarning(warning: BudgetWarning): void {
    const context = {
      scope: warning.scope,
      usagePercent: Math.round(warning.usagePercent),
      tokensUsed: warning.tokensUsed,
      budgetLimit: warning.budgetLimit,
    };

    switch (warning.level) {
      case 'critical':
        this.logger.warn(warning.message, context);
        break;
      case 'warning':
        this.logger.warn(warning.message, context);
        break;
      case 'info':
        this.logger.info(warning.message, context);
        break;
    }
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
