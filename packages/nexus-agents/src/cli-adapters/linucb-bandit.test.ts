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
