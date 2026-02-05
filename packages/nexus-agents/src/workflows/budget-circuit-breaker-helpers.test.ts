/**
 * Tests for Budget Circuit Breaker Helpers
 * @module workflows/budget-circuit-breaker-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  IBudgetCircuitBreaker,
  BudgetEnforcementResult,
  BudgetUsageSnapshot,
  BudgetCircuitSnapshot,
  StepBudgetAllocation,
} from './budget-circuit-breaker-types.js';
import { BudgetCircuitError, BudgetCircuitErrorCode } from './budget-circuit-breaker-types.js';
import { checkBudgetResult, allocateStepBudgetResult } from './budget-circuit-breaker-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeUsage(overrides: Partial<BudgetUsageSnapshot> = {}): BudgetUsageSnapshot {
  return {
    currentTokens: 500,
    maxTokens: 1000,
    usagePercent: 0.5,
    availableTokens: 500,
    timestamp: 1700000000000,
    ...overrides,
  };
}

function makeBreaker(overrides: Partial<IBudgetCircuitBreaker> = {}): IBudgetCircuitBreaker {
  return {
    checkBudget: vi.fn(() => ({
      allowed: true,
      reason: 'Budget available',
      usage: makeUsage(),
      circuitState: 'closed' as const,
    })),
    recordUsage: vi.fn(),
    allocateForStep: vi.fn(
      (stepId: string, remainingSteps: number): StepBudgetAllocation => ({
        stepId,
        allocatedTokens: 200,
        remainingForOtherSteps: 300,
        remainingStepCount: remainingSteps - 1,
      })
    ),
    getState: vi.fn(() => 'closed' as const),
    getSnapshot: vi.fn(
      (): BudgetCircuitSnapshot => ({
        state: 'closed',
        lastStateChange: 1700000000000,
        violationCount: 0,
        recoveryProbeCount: 0,
        lastUsage: makeUsage(),
        config: {
          warningThreshold: 0.8,
          criticalThreshold: 0.95,
          cooldownMs: 5000,
          recoveryProbes: 2,
          hardStop: true,
          stepReserve: 0.1,
        },
      })
    ),
    reset: vi.fn(),
    forceOpen: vi.fn(),
    addStateChangeListener: vi.fn(),
    removeStateChangeListener: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// checkBudgetResult
// ============================================================================

describe('checkBudgetResult', () => {
  it('returns ok when budget is allowed', () => {
    const breaker = makeBreaker();
    const result = checkBudgetResult(breaker, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
    }
  });

  it('returns err with BUDGET_EXCEEDED when disallowed and circuit closed', () => {
    const disallowedResult: BudgetEnforcementResult = {
      allowed: false,
      reason: 'Over budget',
      usage: makeUsage({ usagePercent: 0.99 }),
      circuitState: 'closed',
    };
    const breaker = makeBreaker({
      checkBudget: vi.fn(() => disallowedResult),
    });
    const result = checkBudgetResult(breaker, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(BudgetCircuitError);
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.BUDGET_EXCEEDED);
    }
  });

  it('returns err with CIRCUIT_OPEN when disallowed and circuit open', () => {
    const disallowedResult: BudgetEnforcementResult = {
      allowed: false,
      reason: 'Circuit is open',
      usage: makeUsage(),
      circuitState: 'open',
    };
    const breaker = makeBreaker({
      checkBudget: vi.fn(() => disallowedResult),
    });
    const result = checkBudgetResult(breaker, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.CIRCUIT_OPEN);
    }
  });

  it('passes estimatedTokens to breaker', () => {
    const breaker = makeBreaker();
    checkBudgetResult(breaker, 500);
    expect(breaker.checkBudget).toHaveBeenCalledWith(500);
  });
});

// ============================================================================
// allocateStepBudgetResult
// ============================================================================

describe('allocateStepBudgetResult', () => {
  it('returns ok with allocation when circuit closed', () => {
    const breaker = makeBreaker();
    const result = allocateStepBudgetResult(breaker, 'step-1', 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stepId).toBe('step-1');
      expect(result.value.allocatedTokens).toBe(200);
    }
  });

  it('returns err when circuit is open', () => {
    const breaker = makeBreaker({
      getState: vi.fn(() => 'open' as const),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.CIRCUIT_OPEN);
      expect(result.error.circuitState).toBe('open');
    }
  });

  it('returns err when allocation is zero', () => {
    const breaker = makeBreaker({
      allocateForStep: vi.fn(
        (stepId: string): StepBudgetAllocation => ({
          stepId,
          allocatedTokens: 0,
          remainingForOtherSteps: 0,
          remainingStepCount: 0,
        })
      ),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.INSUFFICIENT_ALLOCATION);
    }
  });

  it('returns err when allocation is negative', () => {
    const breaker = makeBreaker({
      allocateForStep: vi.fn(
        (stepId: string): StepBudgetAllocation => ({
          stepId,
          allocatedTokens: -10,
          remainingForOtherSteps: 0,
          remainingStepCount: 0,
        })
      ),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 1);
    expect(result.ok).toBe(false);
  });

  it('uses snapshot lastUsage for error when circuit open', () => {
    const usage = makeUsage({ currentTokens: 999, maxTokens: 1000 });
    const breaker = makeBreaker({
      getState: vi.fn(() => 'open' as const),
      getSnapshot: vi.fn(
        (): BudgetCircuitSnapshot => ({
          state: 'open',
          lastStateChange: 1700000000000,
          violationCount: 3,
          recoveryProbeCount: 0,
          lastUsage: usage,
          config: {
            warningThreshold: 0.8,
            criticalThreshold: 0.95,
            cooldownMs: 5000,
            recoveryProbes: 2,
            hardStop: true,
            stepReserve: 0.1,
          },
        })
      ),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.usage.currentTokens).toBe(999);
    }
  });

  it('uses default usage when snapshot lastUsage is null and circuit open', () => {
    const breaker = makeBreaker({
      getState: vi.fn(() => 'open' as const),
      getSnapshot: vi.fn(
        (): BudgetCircuitSnapshot => ({
          state: 'open',
          lastStateChange: 1700000000000,
          violationCount: 0,
          recoveryProbeCount: 0,
          lastUsage: null,
          config: {
            warningThreshold: 0.8,
            criticalThreshold: 0.95,
            cooldownMs: 5000,
            recoveryProbes: 2,
            hardStop: true,
            stepReserve: 0.1,
          },
        })
      ),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.usage.currentTokens).toBe(0);
      expect(result.error.usage.maxTokens).toBe(0);
    }
  });

  it('allows half-open state to proceed', () => {
    const breaker = makeBreaker({
      getState: vi.fn(() => 'half-open' as const),
    });
    const result = allocateStepBudgetResult(breaker, 'step-1', 2);
    expect(result.ok).toBe(true);
  });
});
