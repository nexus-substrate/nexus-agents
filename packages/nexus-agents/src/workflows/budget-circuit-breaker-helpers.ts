/**
 * nexus-agents/workflows - Budget Circuit Breaker Helpers
 *
 * Result-based API helpers for budget circuit breaker operations.
 * These provide fallible operation wrappers for the core circuit breaker.
 *
 * (Source: Issue #349 - Implement budget enforcement circuit breaker)
 */

import type { Result } from '../core/index.js';
import { ok, err, getTimeProvider } from '../core/index.js';
import {
  BudgetCircuitError,
  BudgetCircuitErrorCode,
  type BudgetEnforcementResult,
  type IBudgetCircuitBreaker,
  type StepBudgetAllocation,
} from './budget-circuit-breaker-types.js';

// ============================================================================
// Result-Based API
// ============================================================================

/**
 * Check budget with Result type for fallible operations.
 */
export function checkBudgetResult(
  breaker: IBudgetCircuitBreaker,
  estimatedTokens: number
): Result<BudgetEnforcementResult, BudgetCircuitError> {
  const result = breaker.checkBudget(estimatedTokens);

  if (!result.allowed) {
    return err(
      new BudgetCircuitError(result.reason, {
        budgetErrorCode:
          result.circuitState === 'open'
            ? BudgetCircuitErrorCode.CIRCUIT_OPEN
            : BudgetCircuitErrorCode.BUDGET_EXCEEDED,
        circuitState: result.circuitState,
        usage: result.usage,
      })
    );
  }

  return ok(result);
}

/**
 * Allocate step budget with Result type.
 */
export function allocateStepBudgetResult(
  breaker: IBudgetCircuitBreaker,
  stepId: string,
  remainingSteps: number
): Result<StepBudgetAllocation, BudgetCircuitError> {
  const state = breaker.getState();
  if (state === 'open') {
    const snapshot = breaker.getSnapshot();
    return err(
      new BudgetCircuitError('Cannot allocate budget - circuit is open', {
        budgetErrorCode: BudgetCircuitErrorCode.CIRCUIT_OPEN,
        circuitState: state,
        usage: snapshot.lastUsage ?? {
          currentTokens: 0,
          maxTokens: 0,
          usagePercent: 0,
          availableTokens: 0,
          timestamp: getTimeProvider().now(),
        },
      })
    );
  }

  const allocation = breaker.allocateForStep(stepId, remainingSteps);

  if (allocation.allocatedTokens <= 0) {
    const snapshot = breaker.getSnapshot();
    return err(
      new BudgetCircuitError('Insufficient budget for step allocation', {
        budgetErrorCode: BudgetCircuitErrorCode.INSUFFICIENT_ALLOCATION,
        circuitState: state,
        usage: snapshot.lastUsage ?? {
          currentTokens: 0,
          maxTokens: 0,
          usagePercent: 0,
          availableTokens: 0,
          timestamp: getTimeProvider().now(),
        },
      })
    );
  }

  return ok(allocation);
}
