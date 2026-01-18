/**
 * nexus-agents/workflows - Budget Circuit Breaker Types
 *
 * Type definitions, Zod schemas, and error classes for budget enforcement
 * circuit breaker pattern.
 *
 * (Source: Issue #349 - Implement budget enforcement circuit breaker)
 */

import { z } from 'zod';
import { NexusError, ErrorCode } from '../core/index.js';

// ============================================================================
// Circuit Breaker States
// ============================================================================

/**
 * Budget circuit breaker states.
 *
 * - closed: Normal operation, budget tracking active
 * - open: Budget exceeded, operations blocked
 * - half-open: Testing if budget has been freed (e.g., after pruning)
 */
export type BudgetCircuitState = 'closed' | 'open' | 'half-open';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Zod schema for budget circuit breaker configuration.
 */
export const BudgetCircuitBreakerConfigSchema = z.object({
  /** Warning threshold as percentage (0-1) of budget (default: 0.8) */
  warningThreshold: z.number().min(0).max(1).default(0.8),
  /** Critical threshold as percentage (0-1) that opens circuit (default: 0.95) */
  criticalThreshold: z.number().min(0).max(1).default(0.95),
  /** Time in ms to wait before allowing half-open probes (default: 5000) */
  cooldownMs: z.number().positive().default(5000),
  /** Number of successful low-usage probes to close circuit (default: 2) */
  recoveryProbes: z.number().int().positive().default(2),
  /** Whether to enforce hard stops (default: true) */
  hardStop: z.boolean().default(true),
  /** Reserve percentage for step completion (default: 0.1) */
  stepReserve: z.number().min(0).max(0.5).default(0.1),
});

export type BudgetCircuitBreakerConfig = z.infer<typeof BudgetCircuitBreakerConfigSchema>;

/**
 * Default configuration for budget circuit breaker.
 */
export const DEFAULT_BUDGET_CIRCUIT_CONFIG: BudgetCircuitBreakerConfig = {
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  cooldownMs: 5000,
  recoveryProbes: 2,
  hardStop: true,
  stepReserve: 0.1,
};

// ============================================================================
// Budget Check Types
// ============================================================================

/**
 * Budget usage snapshot at a point in time.
 */
export interface BudgetUsageSnapshot {
  /** Total tokens currently used */
  readonly currentTokens: number;
  /** Maximum allowed tokens */
  readonly maxTokens: number;
  /** Usage as a percentage (0-1) */
  readonly usagePercent: number;
  /** Tokens available for new operations */
  readonly availableTokens: number;
  /** Timestamp of the snapshot */
  readonly timestamp: number;
}

/**
 * Result of a budget enforcement check.
 */
export interface BudgetEnforcementResult {
  /** Whether the operation is allowed to proceed */
  readonly allowed: boolean;
  /** Reason for the decision */
  readonly reason: string;
  /** Current budget usage */
  readonly usage: BudgetUsageSnapshot;
  /** Current circuit state */
  readonly circuitState: BudgetCircuitState;
  /** Tokens allocated for this operation (if allowed) */
  readonly allocatedTokens?: number;
  /** Warning message (if approaching threshold) */
  readonly warning?: string;
}

/**
 * Per-step budget allocation.
 */
export interface StepBudgetAllocation {
  /** Step ID */
  readonly stepId: string;
  /** Allocated tokens for this step */
  readonly allocatedTokens: number;
  /** Tokens remaining for subsequent steps */
  readonly remainingForOtherSteps: number;
  /** Number of remaining steps */
  readonly remainingStepCount: number;
}

// ============================================================================
// Circuit State Types
// ============================================================================

/**
 * Budget circuit breaker state snapshot.
 */
export interface BudgetCircuitSnapshot {
  /** Current circuit state */
  readonly state: BudgetCircuitState;
  /** When the state last changed */
  readonly lastStateChange: number;
  /** Number of consecutive violations */
  readonly violationCount: number;
  /** Number of successful recovery probes */
  readonly recoveryProbeCount: number;
  /** Last budget usage snapshot */
  readonly lastUsage: BudgetUsageSnapshot | null;
  /** Configuration used */
  readonly config: BudgetCircuitBreakerConfig;
}

/**
 * Event emitted on budget circuit state changes.
 */
export interface BudgetCircuitStateChangeEvent {
  /** Previous state */
  readonly previousState: BudgetCircuitState;
  /** New state */
  readonly newState: BudgetCircuitState;
  /** Timestamp of change */
  readonly timestamp: number;
  /** Reason for state change */
  readonly reason: string;
  /** Budget usage at time of change */
  readonly usage: BudgetUsageSnapshot;
}

/**
 * Listener for circuit state changes.
 */
export type BudgetCircuitStateChangeListener = (event: BudgetCircuitStateChangeEvent) => void;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to budget circuit breaker.
 */
export const BudgetCircuitErrorCode = {
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  INSUFFICIENT_ALLOCATION: 'INSUFFICIENT_ALLOCATION',
} as const;

export type BudgetCircuitErrorCode =
  (typeof BudgetCircuitErrorCode)[keyof typeof BudgetCircuitErrorCode];

/**
 * Error thrown when budget circuit breaker blocks an operation.
 */
export class BudgetCircuitError extends NexusError {
  readonly budgetErrorCode: BudgetCircuitErrorCode;
  readonly circuitState: BudgetCircuitState;
  readonly usage: BudgetUsageSnapshot;

  constructor(
    message: string,
    options: {
      budgetErrorCode: BudgetCircuitErrorCode;
      circuitState: BudgetCircuitState;
      usage: BudgetUsageSnapshot;
      cause?: Error;
    }
  ) {
    const baseOptions: {
      code: typeof ErrorCode.RATE_LIMIT_ERROR;
      cause?: Error;
      context: Record<string, unknown>;
    } = {
      code: ErrorCode.RATE_LIMIT_ERROR,
      context: {
        budgetErrorCode: options.budgetErrorCode,
        circuitState: options.circuitState,
        currentTokens: options.usage.currentTokens,
        maxTokens: options.usage.maxTokens,
        usagePercent: options.usage.usagePercent,
      },
    };
    if (options.cause !== undefined) {
      baseOptions.cause = options.cause;
    }
    super(message, baseOptions);
    this.name = 'BudgetCircuitError';
    this.budgetErrorCode = options.budgetErrorCode;
    this.circuitState = options.circuitState;
    this.usage = options.usage;
  }
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for budget circuit breaker operations.
 */
export interface IBudgetCircuitBreaker {
  /**
   * Check if an operation is allowed within budget.
   * @param estimatedTokens - Estimated tokens for the operation
   * @returns Budget enforcement result
   */
  checkBudget(estimatedTokens: number): BudgetEnforcementResult;

  /**
   * Record token usage after an operation completes.
   * @param actualTokens - Actual tokens consumed
   */
  recordUsage(actualTokens: number): void;

  /**
   * Allocate budget for a specific step with reservation for remaining steps.
   * @param stepId - Step identifier
   * @param remainingSteps - Number of remaining steps including this one
   * @returns Step budget allocation
   */
  allocateForStep(stepId: string, remainingSteps: number): StepBudgetAllocation;

  /**
   * Get current circuit state.
   */
  getState(): BudgetCircuitState;

  /**
   * Get full circuit snapshot.
   */
  getSnapshot(): BudgetCircuitSnapshot;

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void;

  /**
   * Force circuit to open state (for external triggers).
   * @param reason - Reason for forcing open
   */
  forceOpen(reason: string): void;

  /**
   * Add a listener for state changes.
   */
  addStateChangeListener(listener: BudgetCircuitStateChangeListener): void;

  /**
   * Remove a state change listener.
   */
  removeStateChangeListener(listener: BudgetCircuitStateChangeListener): void;
}
