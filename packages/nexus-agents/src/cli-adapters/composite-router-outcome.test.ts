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
  recordZeroRouterOutcome,
  hasMinimumPreferenceData,
  computeQualityReward,
  resetQualityRewardCache,
  type OutcomeDependencies,
} from './composite-router-outcome.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/index.js';
import { applyBudgetFilter } from './composite-router-helpers.js';
import type { BudgetRouter } from './budget-router.js';
import type { CompositeRouterConfig } from './composite-router-types.js';
import type { BanditContext } from '../core/index.js';

vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

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
    budgetRouter: undefined,
    budgetConstraints: undefined,
    ...overrides,
  };
}

function createCliTask(content = 'test task'): CliTask {
  return { content, maxTokens: 1000 };
}

/** A BudgetRouter stub whose `checkBudget` reports a fixed projected spend. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockBudgetRouter(estimatedCostUsd: number) {
  return {
    checkBudget: vi.fn(() => ({ withinBudget: true, estimatedCostUsd })),
    filterByTaskClassCeiling: vi.fn((_t: unknown, c: unknown) => c),
  } as unknown as BudgetRouter;
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

    it('updates with the same budgetUtilization the select path scored with', () => {
      // LinUCB's invariant: the feature vector passed to `update` must be the
      // one `selectArm` scored. #4874 gave the select path a real
      // `budgetUtilization` and left this path on the 0.5 default, so with a
      // cost budget configured the bandit was fit against a constant column
      // and then scored against a varying one.
      const bandit = createMockLinUCBBandit();
      const budgetRouter = createMockBudgetRouter(0.03);
      const budgetConstraints = { maxCostUsd: 0.05 };
      const config = { budgetConstraints } as CompositeRouterConfig;
      const task = createCliTask();
      const deps = createBaseDeps({ linucbBandit: bandit, budgetRouter, budgetConstraints });

      recordBanditOutcome('claude', task, 0.85, deps);

      // Derived from the select path itself rather than restated: a hardcoded
      // 0.6 here would keep passing if both sides drifted together.
      const atSelect = applyBudgetFilter(task, ['claude'], budgetRouter, config);
      const atUpdate = vi.mocked(bandit.update).mock.calls[0]?.[1] as BanditContext;

      expect(atSelect.budgetUtilization).toBeDefined();
      expect(atUpdate.budgetUtilization).toBe(atSelect.budgetUtilization);
    });

    it('falls back to the neutral feature when no cost budget is configured', () => {
      // The pair. Symmetry is the requirement, not a particular number: with
      // no budget the select path also yields nothing and both sides sit at
      // the neutral 0.5.
      const bandit = createMockLinUCBBandit();
      const deps = createBaseDeps({ linucbBandit: bandit });

      recordBanditOutcome('claude', createCliTask(), 0.85, deps);

      const ctx = vi.mocked(bandit.update).mock.calls[0]?.[1] as BanditContext;
      expect(ctx.budgetUtilization).toBe(0.5);
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

  describe('recordZeroRouterOutcome', () => {
    it('should skip when zeroRouter is undefined', () => {
      const deps = createBaseDeps({ zeroRouter: undefined });
      recordZeroRouterOutcome(createCliTask(), true, 0.9, deps, undefined);

      expect(deps.logger.debug).toHaveBeenCalledWith(
        'ZeroRouter not enabled, skipping difficulty outcome'
      );
    });

    it('should record outcome with quality score', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });
      recordZeroRouterOutcome(createCliTask(), true, 0.9, deps, {
        difficulty: 0.6,
        selectedCli: 'claude',
      });

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
      recordZeroRouterOutcome(createCliTask(), false, undefined, deps, {
        difficulty: 0.6,
        selectedCli: 'claude',
      });

      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(deps.logger.debug).toHaveBeenCalledWith('Recorded difficulty outcome', {
        difficulty: '0.600',
        success: false,
        qualityScore: undefined,
      });
    });

    it('should use the routed execution attribution', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });

      recordZeroRouterOutcome(createCliTask('cached'), true, 0.8, deps, {
        selectedCli: 'codex',
        difficulty: 0.25,
      });

      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ estimatedDifficulty: 0.25, selectedCli: 'codex' })
      );
    });

    it('should handle edge case quality scores', () => {
      const zeroRouter = createMockZeroRouter();
      const deps = createBaseDeps({ zeroRouter });

      const attribution = { difficulty: 0.6, selectedCli: 'claude' } as const;
      recordZeroRouterOutcome(createCliTask(), true, 0, deps, attribution);
      expect(zeroRouter.calibrate).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, qualityScore: 0 })
      );

      recordZeroRouterOutcome(createCliTask(), false, 0.2, deps, attribution);
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
      resetQualityRewardCache();
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

    it('stays inside the range the formula can actually produce', () => {
      // The old assertion was `>= 0` and `<= 1`, which the formula satisfies by
      // construction: a success is 0.5 + rate*0.3 - penalty with rate in [0, 1]
      // and penalty in [0, 0.2], so the value is always in [0.3, 0.8] and the
      // clamp can never bind. Removing `clamp01` left all 31 tests green.
      // Assert the reachable bounds instead, which a formula change would move.
      const slowest = computeQualityReward('codex', true, 100_000);
      const fastest = computeQualityReward('codex', true, 0);

      expect(slowest).toBeGreaterThanOrEqual(0.3);
      expect(fastest).toBeLessThanOrEqual(0.8);
      // A failure is a flat floor, well below any success.
      expect(computeQualityReward('codex', false, 0)).toBe(0.1);
      expect(computeQualityReward('codex', false, 0)).toBeLessThan(slowest);
    });

    it('caches the per-CLI success rate — avoids re-scanning the store every call (#3261)', () => {
      const store = getOutcomeStore();
      for (let i = 0; i < 10; i++) {
        store.append({
          id: `c-${String(i)}`,
          cli: 'claude',
          category: 'code_generation',
          model: 'claude-opus',
          success: true,
          durationMs: 500,
          timestamp: new Date().toISOString(),
          source: 'delegate',
        });
      }
      const querySpy = vi.spyOn(store, 'query');
      computeQualityReward('claude', true, 0); // miss → scans once
      computeQualityReward('claude', true, 0); // hit → no scan
      computeQualityReward('claude', true, 0); // hit → no scan
      expect(querySpy).toHaveBeenCalledTimes(1);
    });

    it('reset clears the cache so a fresh store is re-scanned (#3261)', () => {
      const store = getOutcomeStore();
      store.append({
        id: 'r-1',
        cli: 'claude',
        category: 'code_generation',
        model: 'claude-opus',
        success: true,
        durationMs: 500,
        timestamp: new Date().toISOString(),
        source: 'delegate',
      });
      const high = computeQualityReward('claude', true, 0); // rate 1.0 → 0.8
      resetOutcomeStore();
      resetQualityRewardCache();
      const base = computeQualityReward('claude', true, 0); // no history → 0.5 base
      expect(high).toBeGreaterThan(base);
    });
  });

  describe('Type interfaces', () => {
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
        lastRoutedTask: undefined,
      };
      expect(deps.cliNames).toHaveLength(3);
      expect(deps.linucbBandit).toBeDefined();
      expect(deps.preferenceRouter).toBeDefined();
      expect(deps.zeroRouter).toBeDefined();
    });
  });
});

// =============================================================================
// The update vector equals the select vector (#4953)
// =============================================================================

describe('bandit train/score vector parity (#4953)', () => {
  // #4911 fixed `budgetUtilization` and asserted this invariant in prose, then
  // tested only that one column. Three others were already mismatched, because
  // the two paths used different converters: the select path goes through
  // `TaskProfile` (0-10 scale, +500 token offset), the update path did not.
  //
  // This asserts the WHOLE vector, which is the invariant LinUCB actually
  // needs — a per-column test cannot notice a column nobody thought to add.

  /** The vector the select path builds, reproduced from its own call chain. */
  async function selectVector(
    content: string,
    budgetUtilization?: number
  ): Promise<Record<string, number>> {
    const { createSharedTaskAnalyzer, taskAnalysisResultToTaskProfile } =
      await import('../core/index.js');
    const { taskProfileToBanditContext } = await import('./composite-router-helpers.js');
    const analysis = createSharedTaskAnalyzer().analyze({
      id: 't',
      description: content,
      context: {},
    });
    return taskProfileToBanditContext(
      taskAnalysisResultToTaskProfile(analysis),
      budgetUtilization
    ) as unknown as Record<string, number>;
  }

  function updateVector(bandit: LinUCBBandit): Record<string, number> {
    return vi.mocked(bandit.update).mock.calls[0]?.[1] as unknown as Record<string, number>;
  }

  it.each([
    ['Write a function to reverse a string'],
    ['Design the architecture for a distributed consensus layer'],
    ['fix typo'],
  ])('matches the select vector for %s', async (content) => {
    const bandit = createMockLinUCBBandit();
    const deps = createBaseDeps({ linucbBandit: bandit });

    recordBanditOutcome('claude', createCliTask(content), 0.85, deps);

    expect(updateVector(bandit)).toEqual(await selectVector(content));
  });

  it('matches on every column when a budget is configured too', async () => {
    // The pair for #4911: fixing the budget column must not be undone, and the
    // other five must agree at the same time.
    const bandit = createMockLinUCBBandit();
    const budgetRouter = createMockBudgetRouter(0.03);
    const budgetConstraints = { maxCostUsd: 0.05 };
    const deps = createBaseDeps({ linucbBandit: bandit, budgetRouter, budgetConstraints });

    recordBanditOutcome('claude', createCliTask('build a parser'), 0.85, deps);

    expect(updateVector(bandit)).toEqual(await selectVector('build a parser', 0.6));
  });
});
