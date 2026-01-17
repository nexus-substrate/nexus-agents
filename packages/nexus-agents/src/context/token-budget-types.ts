/**
 * nexus-agents/context - Token Budget Types
 *
 * Type definitions for token budget tracking with EMA.
 * Based on Issue #304 from Agent Improvement Epic #301.
 *
 * @module context/token-budget-types
 */

import { NexusError, ErrorCode } from '../core/index.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error when token budget is exceeded.
 */
export class TokenBudgetError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.RATE_LIMIT_ERROR, ...options });
    this.name = 'TokenBudgetError';
  }
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Token budget enforcement mode.
 * - 'warn': Log warning but continue (default per DevEx amendment)
 * - 'hard': Reject request when budget exceeded
 */
export type BudgetEnforcementMode = 'warn' | 'hard';

/**
 * Configuration for token budget tracking.
 */
export interface TokenBudgetConfig {
  /** Maximum tokens per task (default: 100000) */
  maxTokensPerTask?: number;
  /** Maximum total tokens per session (default: 1000000) */
  maxTokensPerSession?: number;
  /** EMA alpha for smoothing (0-1, default: 0.3) */
  emaAlpha?: number;
  /** Warning threshold as percentage of budget (default: 75) */
  warningThreshold?: number;
  /** Critical threshold as percentage of budget (default: 90) */
  criticalThreshold?: number;
  /** Enforcement mode (default: 'warn') */
  enforcementMode?: BudgetEnforcementMode;
}

/**
 * Default token budget configuration.
 */
export const DEFAULT_TOKEN_BUDGET_CONFIG: Required<TokenBudgetConfig> = {
  maxTokensPerTask: 100000,
  maxTokensPerSession: 1000000,
  emaAlpha: 0.3,
  warningThreshold: 75,
  criticalThreshold: 90,
  enforcementMode: 'warn',
};

// ============================================================================
// Tracking Types
// ============================================================================

/**
 * Token usage record for a single operation.
 */
export interface TokenUsageRecord {
  /** Timestamp of the operation */
  timestamp: number;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens used */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Task or operation identifier */
  taskId?: string;
}

/**
 * Budget warning levels.
 */
export type BudgetWarningLevel = 'info' | 'warning' | 'critical';

/**
 * Budget warning event.
 */
export interface BudgetWarning {
  /** Warning level */
  level: BudgetWarningLevel;
  /** Warning message */
  message: string;
  /** Current usage percentage */
  usagePercent: number;
  /** Tokens used */
  tokensUsed: number;
  /** Budget limit */
  budgetLimit: number;
  /** Whether this is a session or task warning */
  scope: 'task' | 'session';
}

/**
 * Budget check result.
 */
export interface BudgetCheckResult {
  /** Whether the operation is allowed to proceed */
  allowed: boolean;
  /** Estimated tokens for the operation */
  estimatedTokens: number;
  /** Remaining session budget */
  remainingSessionBudget: number;
  /** Remaining task budget */
  remainingTaskBudget: number;
  /** Any warnings generated */
  warnings: readonly BudgetWarning[];
  /** Error if blocked (only when enforcementMode is 'hard') */
  error?: TokenBudgetError;
}

/**
 * Budget statistics with EMA.
 */
export interface BudgetStats {
  /** Total tokens used in session */
  sessionTokensUsed: number;
  /** Current task tokens used */
  taskTokensUsed: number;
  /** EMA of token usage per operation */
  tokenUsageEma: number;
  /** Number of operations tracked */
  operationCount: number;
  /** Session utilization percentage */
  sessionUtilizationPercent: number;
  /** Task utilization percentage */
  taskUtilizationPercent: number;
  /** Predicted tokens for next operation (based on EMA) */
  predictedNextTokens: number;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for token budget tracking operations.
 */
export interface ITokenBudgetTracker {
  /**
   * Check if an operation is within budget.
   * @param estimatedTokens - Estimated tokens for the operation
   * @returns Budget check result with warnings and allowed status
   */
  checkBudget(estimatedTokens: number): BudgetCheckResult;

  /**
   * Record actual token usage after an operation.
   * Updates EMA and session/task totals.
   * @param usage - Token usage record
   */
  recordUsage(usage: TokenUsageRecord): void;

  /**
   * Start a new task context.
   * Resets task-level budget tracking.
   * @param taskId - Optional task identifier
   */
  startTask(taskId?: string): void;

  /**
   * End the current task context.
   * @returns Task-level statistics
   */
  endTask(): BudgetStats;

  /**
   * Reset session budget (e.g., on session timeout).
   */
  resetSession(): void;

  /**
   * Get current budget statistics.
   */
  getStats(): BudgetStats;

  /**
   * Get the predicted tokens for the next operation based on EMA.
   */
  predictNextTokens(): number;

  /**
   * Update configuration dynamically.
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<TokenBudgetConfig>): void;
}
