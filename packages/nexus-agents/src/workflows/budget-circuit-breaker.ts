/**
 * nexus-agents/workflows - Budget Circuit Breaker
 *
 * Implements circuit breaker pattern for budget enforcement during workflow
 * execution. Opens the circuit when budget is exceeded, blocking operations
 * until recovery conditions are met.
 *
 * (Source: Issue #349 - Implement budget enforcement circuit breaker)
 */

import type { ILogger } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import {
  DEFAULT_BUDGET_CIRCUIT_CONFIG,
  type BudgetCircuitState,
  type BudgetCircuitBreakerConfig,
  type BudgetCircuitSnapshot,
  type BudgetCircuitStateChangeEvent,
  type BudgetCircuitStateChangeListener,
  type BudgetEnforcementResult,
  type BudgetUsageSnapshot,
  type IBudgetCircuitBreaker,
  type StepBudgetAllocation,
} from './budget-circuit-breaker-types.js';

// Re-export types (direct re-export avoids unused import warnings)
export {
  BudgetCircuitError,
  BudgetCircuitErrorCode,
  BudgetCircuitBreakerConfigSchema,
  DEFAULT_BUDGET_CIRCUIT_CONFIG,
  type BudgetCircuitState,
  type BudgetCircuitBreakerConfig,
  type BudgetCircuitSnapshot,
  type BudgetCircuitStateChangeEvent,
  type BudgetCircuitStateChangeListener,
  type BudgetEnforcementResult,
  type BudgetUsageSnapshot,
  type IBudgetCircuitBreaker,
  type StepBudgetAllocation,
} from './budget-circuit-breaker-types.js';

// Re-export helpers
export { checkBudgetResult, allocateStepBudgetResult } from './budget-circuit-breaker-helpers.js';

// ============================================================================
// Budget Circuit Breaker Implementation
// ============================================================================

/**
 * Budget circuit breaker for workflow execution.
 *
 * Tracks budget usage and blocks operations when critical threshold is
 * exceeded. Supports configurable warning thresholds, recovery probes,
 * and per-step budget allocation.
 */
export class BudgetCircuitBreaker implements IBudgetCircuitBreaker {
  private state: BudgetCircuitState = 'closed';
  private lastStateChange: number;
  private violationCount = 0;
  private recoveryProbeCount = 0;
  private lastUsage: BudgetUsageSnapshot | null = null;
  private currentTokens = 0;
  private readonly listeners: Set<BudgetCircuitStateChangeListener> = new Set();
  private readonly logger: ILogger;
  private readonly config: BudgetCircuitBreakerConfig;

  constructor(
    private readonly maxTokens: number,
    config?: Partial<BudgetCircuitBreakerConfig>,
    logger?: ILogger
  ) {
    this.config = { ...DEFAULT_BUDGET_CIRCUIT_CONFIG, ...config };
    this.lastStateChange = getTimeProvider().now();
    this.logger = logger ?? createLogger({ component: 'budget-circuit-breaker' });
  }

  checkBudget(estimatedTokens: number): BudgetEnforcementResult {
    this.checkCooldown();
    const usage = this.createUsageSnapshot();
    const projectedUsage = this.calculateProjectedUsage(estimatedTokens);

    // Handle open circuit
    if (this.state === 'open') {
      return this.createBlockedResult(usage, 'Circuit is open - budget exceeded');
    }

    // Handle half-open state (allow probe)
    if (this.state === 'half-open') {
      return this.handleHalfOpenCheck(estimatedTokens, usage, projectedUsage);
    }

    // Closed state - normal budget check
    return this.handleClosedCheck(estimatedTokens, usage, projectedUsage);
  }

  recordUsage(actualTokens: number): void {
    this.currentTokens += actualTokens;
    this.lastUsage = this.createUsageSnapshot();

    this.logger.debug('Budget usage recorded', {
      actualTokens,
      totalUsed: this.currentTokens,
      maxTokens: this.maxTokens,
      usagePercent: this.lastUsage.usagePercent,
    });

    // Check if we should open the circuit after recording
    if (this.state === 'closed' && this.lastUsage.usagePercent >= this.config.criticalThreshold) {
      this.transitionTo('open', 'Usage exceeded critical threshold after recording');
    }
  }

  allocateForStep(stepId: string, remainingSteps: number): StepBudgetAllocation {
    const available = Math.max(0, this.maxTokens - this.currentTokens);
    const reserveForOthers = remainingSteps > 1 ? this.config.stepReserve * available : 0;
    const allocatable = available - reserveForOthers;
    const perStepAllocation = Math.floor(allocatable / Math.max(1, remainingSteps));

    this.logger.debug('Step budget allocated', {
      stepId,
      remainingSteps,
      available,
      allocated: perStepAllocation,
      reserveForOthers: Math.floor(reserveForOthers),
    });

    return {
      stepId,
      allocatedTokens: perStepAllocation,
      remainingForOtherSteps: available - perStepAllocation,
      remainingStepCount: remainingSteps - 1,
    };
  }

  getState(): BudgetCircuitState {
    this.checkCooldown();
    return this.state;
  }

  getSnapshot(): BudgetCircuitSnapshot {
    this.checkCooldown();
    return {
      state: this.state,
      lastStateChange: this.lastStateChange,
      violationCount: this.violationCount,
      recoveryProbeCount: this.recoveryProbeCount,
      lastUsage: this.lastUsage,
      config: this.config,
    };
  }

  reset(): void {
    const previousState = this.state;
    this.state = 'closed';
    this.violationCount = 0;
    this.recoveryProbeCount = 0;
    this.currentTokens = 0;
    this.lastStateChange = getTimeProvider().now();
    this.lastUsage = null;

    if (previousState !== 'closed') {
      this.emitStateChange(previousState, 'closed', 'Manual reset');
    }
    this.logger.info('Budget circuit breaker reset');
  }

  forceOpen(reason: string): void {
    if (this.state !== 'open') {
      this.transitionTo('open', `Forced open: ${reason}`);
    }
  }

  addStateChangeListener(listener: BudgetCircuitStateChangeListener): void {
    this.listeners.add(listener);
  }

  removeStateChangeListener(listener: BudgetCircuitStateChangeListener): void {
    this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Private Methods - State Transitions
  // -------------------------------------------------------------------------

  private checkCooldown(): void {
    if (this.state !== 'open') return;

    const elapsed = getTimeProvider().now() - this.lastStateChange;
    if (elapsed >= this.config.cooldownMs) {
      this.transitionTo('half-open', 'Cooldown elapsed');
    }
  }

  private transitionTo(newState: BudgetCircuitState, reason: string): void {
    const previousState = this.state;
    this.state = newState;
    this.lastStateChange = getTimeProvider().now();

    if (newState === 'closed') {
      this.violationCount = 0;
      this.recoveryProbeCount = 0;
    } else if (newState === 'half-open') {
      this.recoveryProbeCount = 0;
    }

    this.emitStateChange(previousState, newState, reason);
  }

  private emitStateChange(
    previousState: BudgetCircuitState,
    newState: BudgetCircuitState,
    reason: string
  ): void {
    const event: BudgetCircuitStateChangeEvent = {
      previousState,
      newState,
      timestamp: this.lastStateChange,
      reason,
      usage: this.lastUsage ?? this.createUsageSnapshot(),
    };

    this.logger.info('Budget circuit state changed', {
      previousState,
      newState,
      reason,
      usagePercent: event.usage.usagePercent,
    });

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods - Budget Checks
  // -------------------------------------------------------------------------

  private handleClosedCheck(
    estimatedTokens: number,
    usage: BudgetUsageSnapshot,
    projectedUsage: number
  ): BudgetEnforcementResult {
    // Check critical threshold
    if (projectedUsage >= this.config.criticalThreshold) {
      this.violationCount++;
      if (this.config.hardStop) {
        this.transitionTo('open', 'Projected usage exceeds critical threshold');
        return this.createBlockedResult(usage, 'Budget exceeded - circuit opened');
      }
    }

    // Check warning threshold
    const warning =
      projectedUsage >= this.config.warningThreshold
        ? this.createWarningMessage(projectedUsage)
        : undefined;

    return this.createAllowedResult(usage, estimatedTokens, warning);
  }

  private handleHalfOpenCheck(
    estimatedTokens: number,
    usage: BudgetUsageSnapshot,
    projectedUsage: number
  ): BudgetEnforcementResult {
    // In half-open, allow if projected usage is below warning threshold
    if (projectedUsage < this.config.warningThreshold) {
      this.recoveryProbeCount++;
      if (this.recoveryProbeCount >= this.config.recoveryProbes) {
        this.transitionTo('closed', 'Recovery probes successful');
      }
      return this.createAllowedResult(usage, estimatedTokens, 'Recovery probe allowed');
    }

    // Probe failed - back to open
    this.transitionTo('open', 'Recovery probe failed - usage still high');
    return this.createBlockedResult(usage, 'Recovery probe failed');
  }

  private calculateProjectedUsage(estimatedTokens: number): number {
    const projected = this.currentTokens + estimatedTokens;
    return this.maxTokens > 0 ? projected / this.maxTokens : 0;
  }

  private createUsageSnapshot(): BudgetUsageSnapshot {
    const usagePercent = this.maxTokens > 0 ? this.currentTokens / this.maxTokens : 0;
    return {
      currentTokens: this.currentTokens,
      maxTokens: this.maxTokens,
      usagePercent,
      availableTokens: Math.max(0, this.maxTokens - this.currentTokens),
      timestamp: getTimeProvider().now(),
    };
  }

  // -------------------------------------------------------------------------
  // Private Methods - Result Creation
  // -------------------------------------------------------------------------

  private createBlockedResult(usage: BudgetUsageSnapshot, reason: string): BudgetEnforcementResult {
    return {
      allowed: false,
      reason,
      usage,
      circuitState: this.state,
    };
  }

  private createAllowedResult(
    usage: BudgetUsageSnapshot,
    estimatedTokens: number,
    warning?: string
  ): BudgetEnforcementResult {
    const result: BudgetEnforcementResult = {
      allowed: true,
      reason: 'Within budget',
      usage,
      circuitState: this.state,
      allocatedTokens: estimatedTokens,
    };
    if (warning !== undefined) {
      return { ...result, warning };
    }
    return result;
  }

  private createWarningMessage(projectedUsage: number): string {
    const percentUsed = Math.round(projectedUsage * 100);
    return `Budget warning: ${String(percentUsed)}% of budget will be used`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a budget circuit breaker with the specified configuration.
 */
export function createBudgetCircuitBreaker(
  maxTokens: number,
  config?: Partial<BudgetCircuitBreakerConfig>,
  logger?: ILogger
): BudgetCircuitBreaker {
  const mergedConfig: BudgetCircuitBreakerConfig = {
    ...DEFAULT_BUDGET_CIRCUIT_CONFIG,
    ...config,
  };
  return new BudgetCircuitBreaker(maxTokens, mergedConfig, logger);
}
