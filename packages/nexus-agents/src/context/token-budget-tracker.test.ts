/**
 * Tests for TokenBudgetTracker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TokenBudgetTracker,
  createTokenBudgetTracker,
  TokenBudgetError,
  DEFAULT_TOKEN_BUDGET_CONFIG,
} from './token-budget-tracker.js';
import type { TokenUsageRecord } from './token-budget-types.js';

describe('TokenBudgetTracker', () => {
  let tracker: TokenBudgetTracker;

  beforeEach(() => {
    tracker = new TokenBudgetTracker();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      const stats = tracker.getStats();
      expect(stats.sessionTokensUsed).toBe(0);
      expect(stats.taskTokensUsed).toBe(0);
    });

    it('should merge custom config with defaults', () => {
      const customTracker = new TokenBudgetTracker({
        maxTokensPerTask: 50000,
        emaAlpha: 0.5,
      });
      const check = customTracker.checkBudget(40000);
      expect(check.allowed).toBe(true);

      // Check that 50000 limit is enforced
      const checkOver = customTracker.checkBudget(60000);
      expect(checkOver.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('checkBudget', () => {
    it('should allow operations within budget', () => {
      const result = tracker.checkBudget(1000);
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.estimatedTokens).toBe(1000);
    });

    it('should generate warning at warning threshold', () => {
      // Use 75% of task budget
      const taskBudget = DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerTask;
      const tokensToUse = Math.floor(taskBudget * 0.76);

      const result = tracker.checkBudget(tokensToUse);
      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.level).toBe('warning');
    });

    it('should generate critical warning at critical threshold', () => {
      const taskBudget = DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerTask;
      const tokensToUse = Math.floor(taskBudget * 0.91);

      const result = tracker.checkBudget(tokensToUse);
      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.level).toBe('critical');
    });

    it('should allow exceeding budget in warn mode (default)', () => {
      const taskBudget = DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerTask;
      const result = tracker.checkBudget(taskBudget + 1000);
      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should block exceeding budget in hard mode', () => {
      const hardTracker = new TokenBudgetTracker({
        maxTokensPerTask: 10000,
        enforcementMode: 'hard',
      });

      const result = hardTracker.checkBudget(15000);
      expect(result.allowed).toBe(false);
      expect(result.error).toBeInstanceOf(TokenBudgetError);
      expect(result.error?.message).toContain('budget exceeded');
    });

    it('should track session budget accumulation', () => {
      // Record some usage
      tracker.recordUsage(createUsage(5000));
      tracker.recordUsage(createUsage(5000));

      const sessionBudget = DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerSession;
      const remaining = sessionBudget - 10000;

      const result = tracker.checkBudget(1000);
      expect(result.remainingSessionBudget).toBe(remaining);
    });

    it('should calculate remaining budgets correctly', () => {
      tracker.startTask('test-task');
      tracker.recordUsage(createUsage(1000));

      const result = tracker.checkBudget(500);
      expect(result.remainingSessionBudget).toBe(
        DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerSession - 1000
      );
      expect(result.remainingTaskBudget).toBe(DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerTask - 1000);
    });
  });

  describe('recordUsage', () => {
    it('should track session tokens', () => {
      tracker.recordUsage(createUsage(1000));
      tracker.recordUsage(createUsage(2000));

      const stats = tracker.getStats();
      expect(stats.sessionTokensUsed).toBe(3000);
    });

    it('should track task tokens', () => {
      tracker.startTask('test');
      tracker.recordUsage(createUsage(500));
      tracker.recordUsage(createUsage(700));

      const stats = tracker.getStats();
      expect(stats.taskTokensUsed).toBe(1200);
    });

    it('should update EMA correctly', () => {
      // First observation initializes EMA
      tracker.recordUsage(createUsage(1000));
      expect(tracker.predictNextTokens()).toBe(1000);

      // Second observation applies EMA formula
      // EMA = 0.3 * 2000 + 0.7 * 1000 = 600 + 700 = 1300
      tracker.recordUsage(createUsage(2000));
      expect(tracker.predictNextTokens()).toBe(1300);

      // Third observation
      // EMA = 0.3 * 1000 + 0.7 * 1300 = 300 + 910 = 1210
      tracker.recordUsage(createUsage(1000));
      expect(tracker.predictNextTokens()).toBe(1210);
    });

    it('should increment operation count', () => {
      tracker.recordUsage(createUsage(100));
      tracker.recordUsage(createUsage(200));
      tracker.recordUsage(createUsage(300));

      const stats = tracker.getStats();
      expect(stats.operationCount).toBe(3);
    });
  });

  describe('startTask', () => {
    it('should reset task-level tracking', () => {
      tracker.recordUsage(createUsage(5000));

      tracker.startTask('new-task');
      const stats = tracker.getStats();

      expect(stats.taskTokensUsed).toBe(0);
      expect(stats.sessionTokensUsed).toBe(5000);
    });

    it('should accept optional taskId', () => {
      tracker.startTask('my-task-id');
      tracker.recordUsage(createUsage(100));

      const stats = tracker.getStats();
      expect(stats.taskTokensUsed).toBe(100);
    });
  });

  describe('endTask', () => {
    it('should return task statistics', () => {
      tracker.startTask('test');
      tracker.recordUsage(createUsage(1000));
      tracker.recordUsage(createUsage(2000));

      const stats = tracker.endTask();
      expect(stats.taskTokensUsed).toBe(3000);
      expect(stats.sessionTokensUsed).toBe(3000);
    });

    it('should reset task tracking after end', () => {
      tracker.startTask('test');
      tracker.recordUsage(createUsage(1000));
      tracker.endTask();

      const stats = tracker.getStats();
      expect(stats.taskTokensUsed).toBe(0);
      expect(stats.sessionTokensUsed).toBe(1000);
    });
  });

  describe('resetSession', () => {
    it('should reset session and task tokens', () => {
      tracker.recordUsage(createUsage(5000));
      tracker.startTask('test');
      tracker.recordUsage(createUsage(1000));

      tracker.resetSession();
      const stats = tracker.getStats();

      expect(stats.sessionTokensUsed).toBe(0);
      expect(stats.taskTokensUsed).toBe(0);
      expect(stats.operationCount).toBe(0);
    });

    it('should preserve EMA across reset', () => {
      tracker.recordUsage(createUsage(2000));
      const emaBefore = tracker.predictNextTokens();

      tracker.resetSession();
      const emaAfter = tracker.predictNextTokens();

      expect(emaAfter).toBe(emaBefore);
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', () => {
      tracker.startTask('test');
      tracker.recordUsage(createUsage(1000));

      const stats = tracker.getStats();

      expect(stats).toHaveProperty('sessionTokensUsed');
      expect(stats).toHaveProperty('taskTokensUsed');
      expect(stats).toHaveProperty('tokenUsageEma');
      expect(stats).toHaveProperty('operationCount');
      expect(stats).toHaveProperty('sessionUtilizationPercent');
      expect(stats).toHaveProperty('taskUtilizationPercent');
      expect(stats).toHaveProperty('predictedNextTokens');
    });

    it('should calculate utilization percentages', () => {
      const customTracker = new TokenBudgetTracker({
        maxTokensPerTask: 10000,
        maxTokensPerSession: 100000,
      });

      customTracker.startTask('test');
      customTracker.recordUsage(createUsage(5000));

      const stats = customTracker.getStats();
      expect(stats.taskUtilizationPercent).toBe(50);
      expect(stats.sessionUtilizationPercent).toBe(5);
    });
  });

  describe('predictNextTokens', () => {
    it('should return conservative estimate with no data', () => {
      const predicted = tracker.predictNextTokens();
      expect(predicted).toBeGreaterThan(0);
      expect(predicted).toBeLessThanOrEqual(DEFAULT_TOKEN_BUDGET_CONFIG.maxTokensPerTask);
    });

    it('should return EMA after observations', () => {
      tracker.recordUsage(createUsage(5000));
      const predicted = tracker.predictNextTokens();
      expect(predicted).toBe(5000);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration dynamically', () => {
      tracker.updateConfig({
        maxTokensPerTask: 5000,
        enforcementMode: 'hard',
      });

      // Now should block at 5000
      const result = tracker.checkBudget(6000);
      expect(result.allowed).toBe(false);
    });

    it('should preserve non-updated config values', () => {
      const originalEma = DEFAULT_TOKEN_BUDGET_CONFIG.emaAlpha;
      tracker.updateConfig({ maxTokensPerTask: 5000 });

      // EMA should still work with original alpha
      tracker.recordUsage(createUsage(1000));
      tracker.recordUsage(createUsage(2000));
      const expected = originalEma * 2000 + (1 - originalEma) * 1000;
      expect(tracker.predictNextTokens()).toBe(Math.round(expected));
    });
  });

  describe('warning generation', () => {
    it('should not generate warnings below 50%', () => {
      const customTracker = new TokenBudgetTracker({
        maxTokensPerTask: 10000,
      });

      const result = customTracker.checkBudget(4000);
      expect(result.warnings).toHaveLength(0);
    });

    it('should generate info warning at 50%+', () => {
      const customTracker = new TokenBudgetTracker({
        maxTokensPerTask: 10000,
        warningThreshold: 75,
      });

      const result = customTracker.checkBudget(5500);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.level).toBe('info');
    });

    it('should generate warnings for both session and task', () => {
      const customTracker = new TokenBudgetTracker({
        maxTokensPerTask: 10000,
        maxTokensPerSession: 10000,
      });

      const result = customTracker.checkBudget(8000);
      // Should have warnings for both scopes since limits are the same
      expect(result.warnings.length).toBe(2);
    });
  });

  describe('createTokenBudgetTracker', () => {
    it('should create tracker with factory function', () => {
      const factoryTracker = createTokenBudgetTracker({
        maxTokensPerTask: 5000,
      });

      expect(factoryTracker).toBeInstanceOf(TokenBudgetTracker);
      const result = factoryTracker.checkBudget(6000);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should accept custom logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        child: vi.fn().mockReturnThis(),
        isLevelEnabled: vi.fn().mockReturnValue(true),
        setLevel: vi.fn(),
      };

      const factoryTracker = createTokenBudgetTracker({}, mockLogger);
      factoryTracker.recordUsage(createUsage(1000));

      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });
});

/**
 * Helper to create a token usage record.
 */
function createUsage(totalTokens: number, taskId?: string): TokenUsageRecord {
  const inputTokens = Math.floor(totalTokens * 0.7);
  const outputTokens = totalTokens - inputTokens;
  const record: TokenUsageRecord = {
    timestamp: Date.now(),
    inputTokens,
    outputTokens,
    totalTokens,
  };
  if (taskId !== undefined) {
    record.taskId = taskId;
  }
  return record;
}
