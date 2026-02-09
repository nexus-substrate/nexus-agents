/**
 * Tests for CompositeRouter outcome recording functions.
 * @module cli-adapters/composite-router-outcome.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { IZeroRouter } from './zero-router.js';
import {
  recordBanditOutcome,
  recordPreferenceSignal,
  getDifficultyInfo,
  recordZeroRouterOutcome,
  hasMinimumPreferenceData,
  computeQualityReward,
  type LastRoutedTaskInfo,
  type OutcomeDependencies,
} from './composite-router-outcome.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/index.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockLinUCBBandit() {
  return {
    update: vi.fn(),
    selectArm: vi.fn(),
  } as unknown as LinUCBBandit;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockPreferenceRouter() {
  return {
    recordPreference: vi.fn(),
    hasMinimumData: vi.fn(() => true),
    getStats: vi.fn(() => ({
      totalDataPoints: 10,
      strongModelPreferenceRate: 0.7,
    })),
  } as unknown as PreferenceRouter;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockZeroRouter() {
  return {
    estimateDifficulty: vi.fn(() => ({
      aggregateScore: 0.6,
      dimensions: { syntacticComplexity: 0.5, semanticDepth: 0.7 },
    })),
    calibrate: vi.fn(),
    routeByDifficulty: vi.fn(),
  } as unknown as IZeroRouter;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createBaseDeps(overrides: Partial<OutcomeDependencies> = {}) {
  return {
    logger: createMockLogger(),
    cliNames: ['claude', 'gemini', 'codex'] as CliName[],
    linucbBandit: undefined,
    preferenceRouter: undefined,
    zeroRouter: undefined,
    lastRoutedTask: undefined,
    ...overrides,
  };
}

function createCliTask(content = 'test task'): CliTask {
  return { content, maxTokens: 1000 };
}

describe('composite-router-outcome', () => {
  describe('recordBanditOutcome', () => {
    it('should record outcome when linucbBandit is enabled', () => {
      const bandit = createMockLinUCBBandit();
      const deps = createBaseDeps({ linucbBandit: bandit });
      recordBanditOutcome('claude', createCliTask(), 0.85, deps);

      expect(bandit.update).toHaveBeenCalledWith(0, expect.any(Object), 0.85);
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded outcome', {
        cliName: 'claude',
        reward: 0.85,
      });
    });

    it('should return early when linucbBandit is undefined', () => {
      const deps = createBaseDeps({ linucbBandit: undefined });
      recordBanditOutcome('claude', createCliTask(), 0.85, deps);
      expect(deps.logger.debug).not.toHaveBeenCalled();
    });

    it('should warn when CLI is not in cliNames', () => {
      const bandit = createMockLinUCBBandit();
      const deps = createBaseDeps({ linucbBandit: bandit });
      recordBanditOutcome('unknown' as CliName, createCliTask(), 0.85, deps);

      expect(deps.logger.warn).toHaveBeenCalledWith('Unknown CLI for outcome recording', {
        cliName: 'unknown',
      });
      expect(bandit.update).not.toHaveBeenCalled();
    });

    it('should use correct arm indices for different CLIs', () => {
      const bandit = createMockLinUCBBandit();
      const deps = createBaseDeps({ linucbBandit: bandit });
      const task = createCliTask();

      recordBanditOutcome('claude', task, 0.85, deps);
      expect(bandit.update).toHaveBeenCalledWith(0, expect.any(Object), 0.85);

      recordBanditOutcome('gemini', task, 0.75, deps);
      expect(bandit.update).toHaveBeenCalledWith(1, expect.any(Object), 0.75);

      recordBanditOutcome('codex', task, 0.65, deps);
      expect(bandit.update).toHaveBeenCalledWith(2, expect.any(Object), 0.65);
    });

    it('should handle edge case rewards', () => {
      const bandit = createMockLinUCBBandit();
      const deps = createBaseDeps({ linucbBandit: bandit });
      const task = createCliTask();

      recordBanditOutcome('claude', task, 0, deps);
      expect(bandit.update).toHaveBeenCalledWith(0, expect.any(Object), 0);

      recordBanditOutcome('claude', task, -0.5, deps);
      expect(bandit.update).toHaveBeenCalledWith(0, expect.any(Object), -0.5);
    });
  });

  describe('recordPreferenceSignal', () => {
    it('should record preference with full quality scores', () => {
      const router = createMockPreferenceRouter();
      const deps = createBaseDeps({ preferenceRouter: router });

      recordPreferenceSignal('test query', true, { strong: 0.9, weak: 0.6 }, deps);

      expect(router.recordPreference).toHaveBeenCalledWith('test query', true, 0.9, 0.6);
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded preference', {
        strongModelPreferred: true,
      });
    });

    it('should warn when preferenceRouter is undefined', () => {
      const deps = createBaseDeps({ preferenceRouter: undefined });
      recordPreferenceSignal('test query', true, undefined, deps);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        'Preference routing not enabled, cannot record preference'
      );
    });

    it('should handle undefined and partial quality scores', () => {
      const router = createMockPreferenceRouter();
      const deps = createBaseDeps({ preferenceRouter: router });

      recordPreferenceSignal('q1', false, undefined, deps);
      expect(router.recordPreference).toHaveBeenCalledWith('q1', false, undefined, undefined);

      recordPreferenceSignal('q2', true, { strong: 0.85 }, deps);
      expect(router.recordPreference).toHaveBeenCalledWith('q2', true, 0.85, undefined);

      recordPreferenceSignal('q3', false, { weak: 0.5 }, deps);
      expect(router.recordPreference).toHaveBeenCalledWith('q3', false, undefined, 0.5);
    });

    it('should record weak model preference', () => {
      const router = createMockPreferenceRouter();
      const deps = createBaseDeps({ preferenceRouter: router });

      recordPreferenceSignal('test', false, { strong: 0.7, weak: 0.8 }, deps);

      expect(router.recordPreference).toHaveBeenCalledWith('test', false, 0.7, 0.8);
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded preference', {
        strongModelPreferred: false,
      });
    });
  });

  describe('getDifficultyInfo', () => {
    it('should return cached difficulty when task content matches', () => {
      const task = createCliTask('cached task');
      const lastRoutedTask: LastRoutedTaskInfo = {
        task: createCliTask('cached task'),
        selectedCli: 'gemini',
        difficulty: 0.35,
      };
      const deps = createBaseDeps({ lastRoutedTask });

      expect(getDifficultyInfo(task, deps)).toEqual({ difficulty: 0.35, selectedCli: 'gemini' });
    });

    it('should return default values when zeroRouter is undefined', () => {
      const deps = createBaseDeps({ zeroRouter: undefined, lastRoutedTask: undefined });
      expect(getDifficultyInfo(createCliTask(), deps)).toEqual({
        difficulty: 0.5,
        selectedCli: 'claude',
      });
    });

    it('should estimate difficulty from zeroRouter when no cache match', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter, lastRoutedTask: undefined });
      const task = createCliTask('new task');

      const result = getDifficultyInfo(task, deps);

      expect(zeroRouter.estimateDifficulty).toHaveBeenCalledWith(task);
      expect(result).toEqual({ difficulty: 0.6, selectedCli: 'claude' });
    });

    it('should use zeroRouter when task content does not match cache', () => {
      const zeroRouter = createMockZeroRouter();
      const lastRoutedTask: LastRoutedTaskInfo = {
        task: createCliTask('cached'),
        selectedCli: 'gemini',
        difficulty: 0.35,
      };
      const deps = createBaseDeps({ zeroRouter, lastRoutedTask });

      getDifficultyInfo(createCliTask('different'), deps);
      expect(zeroRouter.estimateDifficulty).toHaveBeenCalled();
    });

    it('should handle empty task content', () => {
      const deps = createBaseDeps({ zeroRouter: undefined });
      expect(getDifficultyInfo(createCliTask(''), deps)).toEqual({
        difficulty: 0.5,
        selectedCli: 'claude',
      });
    });
  });

  describe('recordZeroRouterOutcome', () => {
    it('should skip when zeroRouter is undefined', () => {
      const deps = createBaseDeps({ zeroRouter: undefined });
      recordZeroRouterOutcome(createCliTask(), true, 0.9, deps);

      expect(deps.logger.debug).toHaveBeenCalledWith(
        'ZeroRouter not enabled, skipping difficulty outcome'
      );
    });

    it('should record outcome with quality score', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });
      recordZeroRouterOutcome(createCliTask(), true, 0.9, deps);

      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, qualityScore: 0.9 })
      );
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded difficulty outcome', {
        difficulty: '0.600',
        success: true,
        qualityScore: 0.9,
      });
    });

    it('should record outcome without quality score', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });
      recordZeroRouterOutcome(createCliTask(), false, undefined, deps);

      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded difficulty outcome', {
        difficulty: '0.600',
        success: false,
        qualityScore: undefined,
      });
    });

    it('should use cached difficulty when available', () => {
      const zeroRouter = createMockZeroRouter();
      const lastRoutedTask: LastRoutedTaskInfo = {
        task: createCliTask('cached'),
        selectedCli: 'codex',
        difficulty: 0.25,
      };
      const deps = createBaseDeps({ zeroRouter, lastRoutedTask });

      recordZeroRouterOutcome(createCliTask('cached'), true, 0.8, deps);

      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ estimatedDifficulty: 0.25, selectedCli: 'codex' })
      );
    });

    it('should handle edge case quality scores', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });

      recordZeroRouterOutcome(createCliTask(), true, 0, deps);
      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, qualityScore: 0 })
      );

      recordZeroRouterOutcome(createCliTask(), false, 0.2, deps);
      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, qualityScore: 0.2 })
      );
    });
  });

  describe('hasMinimumPreferenceData', () => {
    it('should return false when preferenceRouter is undefined', () => {
      expect(hasMinimumPreferenceData(createBaseDeps({ preferenceRouter: undefined }))).toBe(false);
    });

    it('should delegate to preferenceRouter.hasMinimumData', () => {
      const router = createMockPreferenceRouter();
      vi.mocked(router.hasMinimumData).mockReturnValue(true);
      const deps = createBaseDeps({ preferenceRouter: router });

      expect(hasMinimumPreferenceData(deps)).toBe(true);
      expect(router.hasMinimumData).toHaveBeenCalled();

      vi.mocked(router.hasMinimumData).mockReturnValue(false);
      expect(hasMinimumPreferenceData(deps)).toBe(false);
    });
  });

  describe('computeQualityReward (Issue #929)', () => {
    beforeEach(() => {
      resetOutcomeStore();
    });

    it('returns 0.1 for failure regardless of history', () => {
      expect(computeQualityReward('claude', false, 1000)).toBe(0.1);
    });

    it('returns ~0.5 base for success with no history', () => {
      const reward = computeQualityReward('claude', true, 0);
      expect(reward).toBeCloseTo(0.5, 1);
    });

    it('incorporates historical success rate from OutcomeStore', () => {
      const store = getOutcomeStore();
      for (let i = 0; i < 10; i++) {
        store.append({
          id: `test-${String(i)}`,
          cli: 'claude',
          category: 'code_generation',
          model: 'claude-opus',
          success: true,
          durationMs: 500,
          timestamp: new Date().toISOString(),
          source: 'delegate',
        });
      }
      const reward = computeQualityReward('claude', true, 0);
      // 0.5 base + 1.0 * 0.3 = 0.8
      expect(reward).toBeCloseTo(0.8, 1);
    });

    it('applies latency penalty for slow responses', () => {
      const fast = computeQualityReward('claude', true, 0);
      const slow = computeQualityReward('claude', true, 30_000);
      expect(slow).toBeLessThan(fast);
      expect(fast - slow).toBeCloseTo(0.2, 1);
    });

    it('clamps reward to [0, 1] range', () => {
      expect(computeQualityReward('codex', true, 100_000)).toBeGreaterThanOrEqual(0);
      expect(computeQualityReward('codex', true, 0)).toBeLessThanOrEqual(1);
    });
  });

  describe('Type interfaces', () => {
    it('should structure LastRoutedTaskInfo correctly', () => {
      const info: LastRoutedTaskInfo = {
        task: createCliTask('test'),
        selectedCli: 'claude',
        difficulty: 0.75,
      };
      expect(info.task.content).toBe('test');
      expect(info.selectedCli).toBe('claude');
      expect(info.difficulty).toBe(0.75);
    });

    it('should support minimal OutcomeDependencies', () => {
      const deps: OutcomeDependencies = {
        logger: createMockLogger(),
        cliNames: ['claude'],
        linucbBandit: undefined,
        preferenceRouter: undefined,
        zeroRouter: undefined,
        lastRoutedTask: undefined,
      };
      expect(deps.cliNames).toHaveLength(1);
      expect(deps.linucbBandit).toBeUndefined();
    });

    it('should support full OutcomeDependencies', () => {
      const deps: OutcomeDependencies = {
        logger: createMockLogger(),
        cliNames: ['claude', 'gemini', 'codex'],
        linucbBandit: createMockLinUCBBandit(),
        preferenceRouter: createMockPreferenceRouter(),
        zeroRouter: createMockZeroRouter(),
        lastRoutedTask: {
          task: createCliTask(),
          selectedCli: 'claude',
          difficulty: 0.5,
        },
      };
      expect(deps.cliNames).toHaveLength(3);
      expect(deps.linucbBandit).toBeDefined();
      expect(deps.preferenceRouter).toBeDefined();
      expect(deps.zeroRouter).toBeDefined();
      expect(deps.lastRoutedTask).toBeDefined();
    });
  });
});
