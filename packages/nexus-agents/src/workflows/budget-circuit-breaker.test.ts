/**
 * nexus-agents/workflows - Budget Circuit Breaker Tests
 *
 * Unit tests for budget enforcement circuit breaker pattern.
 *
 * (Source: Issue #349 - Implement budget enforcement circuit breaker)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BudgetCircuitBreaker,
  BudgetCircuitError,
  BudgetCircuitErrorCode,
  createBudgetCircuitBreaker,
  checkBudgetResult,
  allocateStepBudgetResult,
  type BudgetCircuitBreakerConfig,
  type BudgetCircuitStateChangeEvent,
} from './budget-circuit-breaker.js';

describe('BudgetCircuitBreaker', () => {
  const maxTokens = 10000;
  let breaker: BudgetCircuitBreaker;

  beforeEach(() => {
    breaker = new BudgetCircuitBreaker(maxTokens);
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should have zero usage initially', () => {
      const snapshot = breaker.getSnapshot();
      expect(snapshot.violationCount).toBe(0);
      expect(snapshot.recoveryProbeCount).toBe(0);
      expect(snapshot.lastUsage).toBeNull();
    });
  });

  describe('checkBudget', () => {
    it('should allow operations within budget', () => {
      const result = breaker.checkBudget(1000);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Within budget');
      expect(result.circuitState).toBe('closed');
      expect(result.allocatedTokens).toBe(1000);
    });

    it('should include warning when approaching threshold', () => {
      // Record usage to get close to warning threshold (80%)
      breaker.recordUsage(7500); // 75%

      const result = breaker.checkBudget(1000); // Would be 85%

      expect(result.allowed).toBe(true);
      expect(result.warning).toContain('85%');
    });

    it('should open circuit when critical threshold exceeded', () => {
      // Record usage close to critical threshold (95%)
      breaker.recordUsage(9000); // 90%

      const result = breaker.checkBudget(1000); // Would be 100%

      expect(result.allowed).toBe(false);
      expect(result.circuitState).toBe('open');
      expect(result.reason).toContain('exceeded');
    });

    it('should block operations when circuit is open', () => {
      // Force circuit open
      breaker.forceOpen('Test');

      const result = breaker.checkBudget(100);

      expect(result.allowed).toBe(false);
      expect(result.circuitState).toBe('open');
      expect(result.reason).toContain('Circuit is open');
    });
  });

  describe('recordUsage', () => {
    it('should track token usage', () => {
      breaker.recordUsage(1000);
      breaker.recordUsage(2000);

      const snapshot = breaker.getSnapshot();
      expect(snapshot.lastUsage?.currentTokens).toBe(3000);
      expect(snapshot.lastUsage?.usagePercent).toBeCloseTo(0.3);
    });

    it('should open circuit when recording exceeds threshold', () => {
      breaker.recordUsage(9600); // 96% > 95%

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('allocateForStep', () => {
    it('should allocate budget for single remaining step', () => {
      const allocation = breaker.allocateForStep('step-1', 1);

      expect(allocation.stepId).toBe('step-1');
      expect(allocation.allocatedTokens).toBe(maxTokens);
      expect(allocation.remainingStepCount).toBe(0);
    });

    it('should reserve budget for subsequent steps', () => {
      const allocation = breaker.allocateForStep('step-1', 5);

      expect(allocation.stepId).toBe('step-1');
      // With 10% reserve and 5 steps: available = 10000, reserve = 1000
      // allocatable = 9000, per step = 1800
      expect(allocation.allocatedTokens).toBeLessThan((maxTokens / 5) * 1.5);
      expect(allocation.remainingStepCount).toBe(4);
    });

    it('should account for already used tokens', () => {
      breaker.recordUsage(5000); // 50% used

      const allocation = breaker.allocateForStep('step-1', 2);

      expect(allocation.allocatedTokens).toBeLessThanOrEqual(5000);
    });
  });

  describe('state transitions', () => {
    it('should transition to half-open after cooldown', async () => {
      const config: BudgetCircuitBreakerConfig = {
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
        cooldownMs: 50, // Short cooldown for testing
        recoveryProbes: 2,
        hardStop: true,
        stepReserve: 0.1,
      };
      const testBreaker = new BudgetCircuitBreaker(maxTokens, config);

      testBreaker.forceOpen('Test');
      expect(testBreaker.getState()).toBe('open');

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(testBreaker.getState()).toBe('half-open');
    });

    it('should close circuit after successful recovery probes', async () => {
      const config: BudgetCircuitBreakerConfig = {
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
        cooldownMs: 10,
        recoveryProbes: 2,
        hardStop: true,
        stepReserve: 0.1,
      };
      const testBreaker = new BudgetCircuitBreaker(maxTokens, config);

      testBreaker.forceOpen('Test');
      await new Promise((resolve) => setTimeout(resolve, 20));

      // First probe - below warning threshold
      let result = testBreaker.checkBudget(100);
      expect(result.allowed).toBe(true);
      expect(testBreaker.getState()).toBe('half-open');

      // Second probe - closes circuit
      result = testBreaker.checkBudget(100);
      expect(result.allowed).toBe(true);
      expect(testBreaker.getState()).toBe('closed');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      breaker.recordUsage(5000);
      breaker.forceOpen('Test');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      const snapshot = breaker.getSnapshot();
      expect(snapshot.violationCount).toBe(0);
      expect(snapshot.lastUsage).toBeNull();
    });
  });

  describe('state change listeners', () => {
    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      breaker.addStateChangeListener(listener);

      breaker.forceOpen('Test');

      expect(listener).toHaveBeenCalledTimes(1);
      const event: BudgetCircuitStateChangeEvent = listener.mock.calls[0]?.[0];
      expect(event.previousState).toBe('closed');
      expect(event.newState).toBe('open');
      expect(event.reason).toContain('Test');
    });

    it('should allow removing listeners', () => {
      const listener = vi.fn();
      breaker.addStateChangeListener(listener);
      breaker.removeStateChangeListener(listener);

      breaker.forceOpen('Test');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('createBudgetCircuitBreaker', () => {
  it('should create breaker with default config', () => {
    const breaker = createBudgetCircuitBreaker(10000);
    expect(breaker.getState()).toBe('closed');
  });

  it('should create breaker with custom config', () => {
    const breaker = createBudgetCircuitBreaker(10000, {
      warningThreshold: 0.5,
    });

    const snapshot = breaker.getSnapshot();
    expect(snapshot.config.warningThreshold).toBe(0.5);
  });
});

describe('checkBudgetResult', () => {
  it('should return ok result when allowed', () => {
    const breaker = createBudgetCircuitBreaker(10000);

    const result = checkBudgetResult(breaker, 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
    }
  });

  it('should return error result when blocked', () => {
    const breaker = createBudgetCircuitBreaker(10000);
    breaker.forceOpen('Test');

    const result = checkBudgetResult(breaker, 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(BudgetCircuitError);
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.CIRCUIT_OPEN);
    }
  });
});

describe('allocateStepBudgetResult', () => {
  it('should return ok result when circuit is closed', () => {
    const breaker = createBudgetCircuitBreaker(10000);

    const result = allocateStepBudgetResult(breaker, 'step-1', 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stepId).toBe('step-1');
      expect(result.value.allocatedTokens).toBeGreaterThan(0);
    }
  });

  it('should return error when circuit is open', () => {
    const breaker = createBudgetCircuitBreaker(10000);
    breaker.forceOpen('Test');

    const result = allocateStepBudgetResult(breaker, 'step-1', 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.CIRCUIT_OPEN);
    }
  });

  it('should return error when no budget available', () => {
    // Using all budget (100%) exceeds critical threshold (95%) and opens circuit
    const breaker = createBudgetCircuitBreaker(100);
    breaker.recordUsage(100); // Use all budget - opens circuit

    // Circuit is now open, so allocation fails with CIRCUIT_OPEN
    const result = allocateStepBudgetResult(breaker, 'step-1', 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.CIRCUIT_OPEN);
    }
  });

  it('should return error when allocation is zero', () => {
    // Use 94% of budget (below critical 95%) with only 6 tokens remaining
    const breaker = createBudgetCircuitBreaker(100, { hardStop: false });
    breaker.recordUsage(94); // 94% used, 6 tokens remaining

    // With step reserve (10% of 6 = 0.6 ~ 0) and 100 steps, allocation rounds to 0
    // availble = 6, reserve = 0.6, allocatable = 5.4, per step = 0
    const result = allocateStepBudgetResult(breaker, 'step-1', 100);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.budgetErrorCode).toBe(BudgetCircuitErrorCode.INSUFFICIENT_ALLOCATION);
    }
  });
});

describe('BudgetCircuitError', () => {
  it('should include all properties', () => {
    const usage = {
      currentTokens: 9500,
      maxTokens: 10000,
      usagePercent: 0.95,
      availableTokens: 500,
      timestamp: Date.now(),
    };

    const error = new BudgetCircuitError('Budget exceeded', {
      budgetErrorCode: BudgetCircuitErrorCode.BUDGET_EXCEEDED,
      circuitState: 'open',
      usage,
    });

    expect(error.name).toBe('BudgetCircuitError');
    expect(error.budgetErrorCode).toBe(BudgetCircuitErrorCode.BUDGET_EXCEEDED);
    expect(error.circuitState).toBe('open');
    expect(error.usage).toEqual(usage);
    expect(error.message).toBe('Budget exceeded');
  });
});
