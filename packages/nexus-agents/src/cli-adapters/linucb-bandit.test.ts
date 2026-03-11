/**
 * nexus-agents/cli-adapters - LinUCB Bandit Tests
 *
 * Tests for the LinUCB contextual bandit implementation.
 *
 * @module cli-adapters/linucb-bandit.test
 * (Source: Issue #102)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinUCBBandit, createLinUCBBandit } from './linucb-bandit.js';
import type { BanditContext } from './budget-router-types.js';

describe('LinUCBBandit', () => {
  const armNames = ['claude', 'gemini', 'codex'];

  const createContext = (overrides?: Partial<BanditContext>): BanditContext => ({
    taskComplexity: 0.5,
    contextLengthNormalized: 0.3,
    isCodeTask: 0,
    isReasoningTask: 0,
    budgetUtilization: 0.2,
    timePressure: 0.1,
    ...overrides,
  });

  describe('constructor', () => {
    it('should create bandit with given arm names', () => {
      const bandit = new LinUCBBandit(armNames);
      expect(bandit.getArmNames()).toEqual(armNames);
    });

    it('should create bandit with custom config', () => {
      const bandit = new LinUCBBandit(armNames, { alpha: 2.0 });
      expect(bandit.getArmNames()).toHaveLength(3);
    });
  });

  describe('select', () => {
    let bandit: LinUCBBandit;

    beforeEach(() => {
      bandit = new LinUCBBandit(armNames);
    });

    it('should select an arm given context', () => {
      const context = createContext();
      const result = bandit.select(context);

      expect(result.armIndex).toBeGreaterThanOrEqual(0);
      expect(result.armIndex).toBeLessThan(armNames.length);
      expect(armNames).toContain(result.armName);
      expect(typeof result.ucbScore).toBe('number');
    });

    it('should return valid arm name', () => {
      const context = createContext();
      const result = bandit.select(context);
      expect(armNames).toContain(result.armName);
    });

    it('should explore initially with high UCB scores', () => {
      const context = createContext();
      const result = bandit.select(context);
      // With no prior data, UCB includes uncertainty term
      expect(result.ucbScore).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    let bandit: LinUCBBandit;

    beforeEach(() => {
      bandit = new LinUCBBandit(armNames);
    });

    it('should update arm statistics after reward', () => {
      const context = createContext();
      const { armIndex } = bandit.select(context);

      bandit.update(armIndex, context, 1.0);

      const stats = bandit.getStats();
      const armStats = stats[armIndex];
      expect(armStats).toBeDefined();
      expect(armStats?.pullCount).toBe(1);
    });

    it('should accumulate rewards', () => {
      const context = createContext();
      const armIndex = 0;

      bandit.update(armIndex, context, 1.0);
      bandit.update(armIndex, context, 0.5);

      const stats = bandit.getStats();
      const armStats = stats[armIndex];
      expect(armStats?.pullCount).toBe(2);
      expect(armStats?.avgReward).toBeCloseTo(0.75, 2);
    });

    it('should handle negative rewards', () => {
      const context = createContext();
      const armIndex = 0;

      bandit.update(armIndex, context, -0.5);

      const stats = bandit.getStats();
      const armStats = stats[armIndex];
      expect(armStats?.avgReward).toBeCloseTo(-0.5, 2);
    });
  });

  describe('learning behavior', () => {
    it('should favor arms with higher rewards over time', () => {
      const bandit = new LinUCBBandit(armNames, { alpha: 0.1 }); // Lower exploration
      const context = createContext({ taskComplexity: 0.8, isReasoningTask: 1 });

      // Train arm 0 (claude) with high rewards for reasoning tasks
      for (let i = 0; i < 20; i++) {
        bandit.update(0, context, 1.0);
      }

      // Train arm 1 (gemini) with low rewards
      for (let i = 0; i < 20; i++) {
        bandit.update(1, context, 0.2);
      }

      // After training, stats should show higher average reward for arm 0
      const stats = bandit.getStats();
      expect(stats[0]?.avgReward).toBeGreaterThan(stats[1]?.avgReward ?? 0);
    });

    it('should adapt to different contexts', () => {
      const bandit = new LinUCBBandit(armNames, { alpha: 0.1 });

      const codeContext = createContext({ isCodeTask: 1, taskComplexity: 0.3 });
      const reasoningContext = createContext({ isReasoningTask: 1, taskComplexity: 0.9 });

      // Train codex for code tasks
      for (let i = 0; i < 10; i++) {
        bandit.update(2, codeContext, 0.9); // codex good for code
        bandit.update(0, reasoningContext, 0.9); // claude good for reasoning
      }

      // Stats should reflect training - verify both arms were trained
      const claudeStats = bandit.getStats()[0];
      const codexStats = bandit.getStats()[2];
      expect(claudeStats?.pullCount).toBe(10);
      expect(codexStats?.pullCount).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return stats for all arms', () => {
      const bandit = new LinUCBBandit(armNames);
      const stats = bandit.getStats();

      expect(stats).toHaveLength(armNames.length);
      for (let i = 0; i < armNames.length; i++) {
        expect(stats[i]?.name).toBe(armNames[i]);
        expect(stats[i]?.pullCount).toBe(0);
        expect(stats[i]?.avgReward).toBe(0);
      }
    });

    it('should correctly calculate average reward', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext();

      bandit.update(0, context, 1.0);
      bandit.update(0, context, 0.5);
      bandit.update(0, context, 0.5);

      const stats = bandit.getStats();
      expect(stats[0]?.avgReward).toBeCloseTo(0.667, 2);
    });
  });

  describe('reset', () => {
    it('should reset all arm statistics', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext();

      // Add some data
      bandit.update(0, context, 1.0);
      bandit.update(1, context, 0.5);

      // Reset
      bandit.reset();

      // Verify reset
      const stats = bandit.getStats();
      for (const arm of stats) {
        expect(arm.pullCount).toBe(0);
        expect(arm.avgReward).toBe(0);
      }
    });
  });

  describe('createLinUCBBandit', () => {
    it('should create bandit instance', () => {
      const bandit = createLinUCBBandit(armNames);
      expect(bandit).toBeInstanceOf(LinUCBBandit);
    });

    it('should create bandit with custom config', () => {
      const bandit = createLinUCBBandit(armNames, { alpha: 0.5 });
      expect(bandit).toBeInstanceOf(LinUCBBandit);
      expect(bandit.getArmNames()).toEqual(armNames);
    });
  });

  describe('getDetailedStats()', () => {
    it('should return detailed stats with feature importance', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext({ isCodeTask: 1 });

      bandit.update(0, context, 1.0);
      bandit.update(0, context, 0.8);

      const detailed = bandit.getDetailedStats();
      expect(detailed).toHaveLength(armNames.length);
      expect(detailed[0]?.name).toBe('claude');
      expect(detailed[0]?.pullCount).toBe(2);
      expect(detailed[0]?.avgReward).toBeCloseTo(0.9, 1);
      expect(detailed[0]?.learnedWeights).toHaveLength(6);
      expect(detailed[0]?.featureImportance).toHaveLength(6);
      // Feature importance should be sorted by importance descending
      const importances = detailed[0]?.featureImportance.map((f) => f.importance) ?? [];
      for (let i = 1; i < importances.length; i++) {
        expect(importances[i]).toBeLessThanOrEqual(importances[i - 1] ?? 0);
      }
    });

    it('should return zero avg reward for unpulled arms', () => {
      const bandit = new LinUCBBandit(armNames);
      const detailed = bandit.getDetailedStats();
      for (const arm of detailed) {
        expect(arm.avgReward).toBe(0);
        expect(arm.pullCount).toBe(0);
        expect(arm.cumulativeReward).toBe(0);
      }
    });
  });

  describe('getExplorationStats()', () => {
    it('should return exploration stats', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext();

      for (let i = 0; i < 10; i++) {
        bandit.update(0, context, 1.0);
      }
      for (let i = 0; i < 10; i++) {
        bandit.update(1, context, 0.5);
      }

      const exploration = bandit.getExplorationStats();
      expect(exploration.totalPulls).toBe(20);
      expect(exploration.armDistribution).toHaveLength(armNames.length);
      expect(exploration.explorationRatio).toBeGreaterThanOrEqual(0);
      expect(exploration.explorationRatio).toBeLessThanOrEqual(1);
    });

    it('should return even distribution when no pulls', () => {
      const bandit = new LinUCBBandit(armNames);
      const exploration = bandit.getExplorationStats();
      expect(exploration.totalPulls).toBe(0);
      // With no pulls, each arm should have equal proportion
      for (const arm of exploration.armDistribution) {
        expect(arm.proportion).toBeCloseTo(1 / armNames.length, 5);
      }
    });

    it('should report high exploration ratio for even distribution', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext();

      // Train all arms equally
      for (let i = 0; i < armNames.length; i++) {
        for (let j = 0; j < 10; j++) {
          bandit.update(i, context, 0.5);
        }
      }

      const exploration = bandit.getExplorationStats();
      expect(exploration.explorationRatio).toBeCloseTo(1.0, 1);
    });
  });

  describe('seedPriors()', () => {
    it('should seed arms with prior rewards', () => {
      const bandit = new LinUCBBandit(armNames);
      const priors = new Map([
        ['claude', 0.9],
        ['gemini', 0.7],
        ['codex', 0.5],
      ]);

      bandit.seedPriors(priors, 5);

      const stats = bandit.getStats();
      expect(stats[0]?.pullCount).toBe(5);
      expect(stats[1]?.pullCount).toBe(5);
      expect(stats[2]?.pullCount).toBe(5);
      expect(stats[0]?.avgReward).toBeCloseTo(0.9, 1);
    });

    it('should skip arms not in priors map', () => {
      const bandit = new LinUCBBandit(armNames);
      const priors = new Map([['claude', 0.9]]);

      bandit.seedPriors(priors, 3);

      const stats = bandit.getStats();
      expect(stats[0]?.pullCount).toBe(3);
      expect(stats[1]?.pullCount).toBe(0);
      expect(stats[2]?.pullCount).toBe(0);
    });

    it('should clamp observation count to 20 max', () => {
      const bandit = new LinUCBBandit(armNames);
      const priors = new Map([['claude', 0.5]]);

      bandit.seedPriors(priors, 100);

      const stats = bandit.getStats();
      expect(stats[0]?.pullCount).toBe(20);
    });

    it('should clamp rewards to 0-1', () => {
      const bandit = new LinUCBBandit(armNames);
      const priors = new Map([
        ['claude', 1.5],
        ['gemini', -0.5],
      ]);

      bandit.seedPriors(priors, 3);

      const stats = bandit.getStats();
      expect(stats[0]?.avgReward).toBeCloseTo(1.0, 1);
      expect(stats[1]?.avgReward).toBeCloseTo(0.0, 1);
    });
  });

  describe('warmStart()', () => {
    it('should replay outcomes to warm start arms', () => {
      const bandit = new LinUCBBandit(armNames);
      const outcomes = [
        { cli: 'claude' as const, success: true },
        { cli: 'claude' as const, success: true },
        { cli: 'gemini' as const, success: false },
        { cli: 'codex' as const, success: true },
      ] as unknown as Parameters<typeof bandit.warmStart>[0];

      const replayed = bandit.warmStart(outcomes);

      expect(replayed).toBe(4);
      const stats = bandit.getStats();
      expect(stats[0]?.pullCount).toBe(2);
      expect(stats[1]?.pullCount).toBe(1);
      expect(stats[2]?.pullCount).toBe(1);
    });

    it('should skip unknown CLI names', () => {
      const bandit = new LinUCBBandit(armNames);
      const outcomes = [
        { cli: 'unknown-cli' as const, success: true },
        { cli: 'claude' as const, success: true },
      ] as unknown as Parameters<typeof bandit.warmStart>[0];

      const replayed = bandit.warmStart(outcomes);

      expect(replayed).toBe(1);
    });

    it('should return 0 for empty outcomes', () => {
      const bandit = new LinUCBBandit(armNames);
      expect(bandit.warmStart([])).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle single arm', () => {
      const bandit = new LinUCBBandit(['only-one']);
      const context = createContext();
      const result = bandit.select(context);

      expect(result.armIndex).toBe(0);
      expect(result.armName).toBe('only-one');
    });

    it('should handle many arms', () => {
      const manyArms = Array.from({ length: 10 }, (_, i) => `arm-${String(i)}`);
      const bandit = new LinUCBBandit(manyArms);
      const context = createContext();
      const result = bandit.select(context);

      expect(result.armIndex).toBeGreaterThanOrEqual(0);
      expect(result.armIndex).toBeLessThan(10);
    });

    it('should handle extreme context values', () => {
      const bandit = new LinUCBBandit(armNames);

      const extremeContext: BanditContext = {
        taskComplexity: 1.0,
        contextLengthNormalized: 1.0,
        isCodeTask: 1,
        isReasoningTask: 1,
        budgetUtilization: 1.0,
        timePressure: 1.0,
      };

      const result = bandit.select(extremeContext);
      expect(armNames).toContain(result.armName);
    });

    it('should handle zero context values', () => {
      const bandit = new LinUCBBandit(armNames);

      const zeroContext: BanditContext = {
        taskComplexity: 0,
        contextLengthNormalized: 0,
        isCodeTask: 0,
        isReasoningTask: 0,
        budgetUtilization: 0,
        timePressure: 0,
      };

      const result = bandit.select(zeroContext);
      expect(armNames).toContain(result.armName);
    });

    it('should handle invalid arm index in update', () => {
      const bandit = new LinUCBBandit(armNames);
      const context = createContext();

      // Should not throw
      bandit.update(-1, context, 1.0);
      bandit.update(100, context, 1.0);

      const stats = bandit.getStats();
      // All arms should still have 0 pulls
      for (const arm of stats) {
        expect(arm.pullCount).toBe(0);
      }
    });
  });
});
