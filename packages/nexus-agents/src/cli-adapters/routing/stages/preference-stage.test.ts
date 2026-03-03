/**
 * Unit tests for PreferenceStage
 *
 * Tests preference-based routing logic, scoring, and learning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PreferenceStage,
  createPreferenceStage,
  type PreferenceStageConfig,
} from './preference-stage.js';
import { createRoutingContext } from '../router-stage.js';
import type { RoutingContext, CliName } from '../router-stage.js';
import type { PreferenceRoutingDecision } from '../../preference-router-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../core/index.js', async () => {
  const actual =
    await vi.importActual<typeof import('../../../core/index.js')>('../../../core/index.js');
  return {
    ...actual,
    createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
    getTimeProvider: vi.fn(() => ({ now: vi.fn(() => 1000) })),
  };
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createMockRouterInstance = () => ({
  hasMinimumData: vi.fn(() => false),
  route: vi.fn(),
  recordPreference: vi.fn(),
  getStats: vi.fn(() => ({
    totalDataPoints: 0,
    strongModelPreferenceRate: 0,
    estimatedCostSavingsRate: 0,
  })),
});

let mockRouterInstance = createMockRouterInstance();

vi.mock('../../preference-router.js', () => ({
  PreferenceRouter: vi.fn(function () {
    return mockRouterInstance;
  }),
}));

// ============================================================================
// Fixtures
// ============================================================================

function createMockRoutingDecision(
  selectedCli: CliName = 'claude',
  probability = 0.8,
  confidence = 0.9
): PreferenceRoutingDecision {
  return {
    selectedTier: 'strong' as const,
    selectedCli,
    prediction: {
      strongModelProbability: probability,
      confidence,
      features: {
        tokenCount: 10,
        complexity: 0.5,
        requiresReasoning: false,
        requiresCode: false,
        requiresCreativity: false,
        hasAmbiguity: false,
        domain: 'general',
        keywordSignature: 'test',
      },
      supportingDataPoints: 5,
    },
    reason: 'Test reason',
    routingLatencyMs: 10,
    estimatedCostSavings: 0.5,
  };
}

function createMockContext(task = 'test task'): RoutingContext {
  return createRoutingContext(task, ['claude', 'gemini', 'codex']);
}

// ============================================================================
// Tests
// ============================================================================

describe('PreferenceStage', () => {
  describe('constructor and factory', () => {
    it('should initialize with default and custom config', () => {
      const defaultStage = new PreferenceStage();
      expect(defaultStage.name).toBe('preference-learned');
      expect(defaultStage.priority).toBe(50);

      const customConfig: Partial<PreferenceStageConfig> = {
        scoreWeight: 0.5,
        minDataForScoring: 20,
      };
      const customStage = new PreferenceStage(customConfig);
      expect(customStage.getStats().config).toMatchObject(customConfig);
    });

    it('should create stage via factory', () => {
      const stage = createPreferenceStage({ scoreWeight: 0.3 });
      expect(stage).toBeInstanceOf(PreferenceStage);
      expect((stage.getStats().config as { scoreWeight: number }).scoreWeight).toBe(0.3);
    });
  });

  describe('canHandle', () => {
    it('should validate routing context', () => {
      const stage = new PreferenceStage();

      expect(stage.canHandle(createMockContext('test task'))).toBe(true);
      expect(stage.canHandle(createMockContext(''))).toBe(false);

      const filtered = new Map<CliName, string>([
        ['claude', 'filtered'],
        ['gemini', 'filtered'],
        ['codex', 'filtered'],
      ]);
      expect(stage.canHandle({ ...createMockContext(), filtered })).toBe(false);
    });
  });

  describe('route', () => {
    beforeEach(() => {
      mockRouterInstance = createMockRouterInstance();
    });

    it('should skip scoring when insufficient data', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(false);
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 5,
        strongModelPreferenceRate: 0,
        estimatedCostSavingsRate: 0,
      });

      const result = await new PreferenceStage().route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.continuesPipeline).toBe(true);
      expect(result.value.context.signals).toContain('preference:insufficient-data');
      expect(result.value.context.trace[0]?.action).toBe('skip');
    });

    it('should apply preferences with sufficient data', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(true);
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 0.9));
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 50,
        strongModelPreferenceRate: 0.6,
        estimatedCostSavingsRate: 0.3,
      });

      const result = await new PreferenceStage().route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.signals).toContain('preference:tier-strong');
      expect(result.value.context.signals).toContain('preference:confidence-0.90');
      expect(result.value.context.trace[0]?.action).toBe('score');
    });

    it('should update scores for all candidates', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(true);
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 0.9));
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 50,
        strongModelPreferenceRate: 0.6,
        estimatedCostSavingsRate: 0.3,
      });

      const result = await new PreferenceStage({ scoreWeight: 0.5 }).route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const claudeScore = result.value.context.scores.get('claude');
      expect(claudeScore).toBeGreaterThan(0);
      expect(claudeScore).toBeGreaterThan(result.value.context.scores.get('gemini') ?? 0);
    });

    it('should track routing metrics', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(true);
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision());
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 50,
        strongModelPreferenceRate: 0.6,
        estimatedCostSavingsRate: 0.3,
      });

      const stage = new PreferenceStage();
      await stage.route(createMockContext());
      await stage.route(createMockContext());

      expect(stage.getStats().routingsCount).toBe(2);
      expect(stage.getStats().preferencesApplied).toBe(2);
    });
  });

  describe('recordOutcome', () => {
    beforeEach(() => {
      mockRouterInstance = createMockRouterInstance();
    });

    it('should record strong model preference on failure or low quality', () => {
      const stage = new PreferenceStage();

      stage.recordOutcome({
        selectedCli: 'gemini',
        task: 'test task',
        success: false,
        qualityScore: 0.5,
      });
      expect(mockRouterInstance.recordPreference).toHaveBeenCalledWith(
        'test task',
        true,
        0.5,
        undefined
      );

      mockRouterInstance.recordPreference.mockClear();
      stage.recordOutcome({
        selectedCli: 'gemini',
        task: 'test task 2',
        success: true,
        qualityScore: 0.6,
      });
      expect(mockRouterInstance.recordPreference).toHaveBeenCalledWith(
        'test task 2',
        true,
        0.6,
        undefined
      );
    });

    it('should record strong model preference when claude selected', () => {
      const stage = new PreferenceStage();
      stage.recordOutcome({
        selectedCli: 'claude',
        task: 'test task',
        success: true,
        qualityScore: 0.9,
      });

      expect(mockRouterInstance.recordPreference).toHaveBeenCalledWith(
        'test task',
        true,
        0.9,
        undefined
      );
    });

    it('should record weak model preference on success with high quality', () => {
      const stage = new PreferenceStage();
      stage.recordOutcome({
        selectedCli: 'gemini',
        task: 'test task',
        success: true,
        qualityScore: 0.85,
      });

      expect(mockRouterInstance.recordPreference).toHaveBeenCalledWith(
        'test task',
        false,
        0.85,
        undefined
      );
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      mockRouterInstance = createMockRouterInstance();
    });

    it('should return complete statistics', async () => {
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 100,
        strongModelPreferenceRate: 0.6,
        estimatedCostSavingsRate: 0.4,
      });

      const stage = new PreferenceStage({ scoreWeight: 0.3, minDataForScoring: 15 });
      await stage.route(createMockContext());

      const stats = stage.getStats();
      expect(stats.routingsCount).toBe(1);
      expect(stats.config).toMatchObject({
        scoreWeight: 0.3,
        minDataForScoring: 15,
      });
      expect(stats.preferenceData).toBeDefined();
    });

    it('should calculate application rate', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(false);

      const stage = new PreferenceStage();
      await stage.route(createMockContext());
      await stage.route(createMockContext());

      expect(stage.getStats().applicationRate).toBe(0);
    });
  });

  describe('scoring logic', () => {
    beforeEach(() => {
      mockRouterInstance = createMockRouterInstance();
      mockRouterInstance.hasMinimumData.mockReturnValue(true);
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 50,
        strongModelPreferenceRate: 0.6,
        estimatedCostSavingsRate: 0.3,
      });
    });

    it('should give higher score to preferred CLI', async () => {
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 0.9));

      const stage = new PreferenceStage({ scoreWeight: 0.5 });
      const result = await stage.route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scores = result.value.context.scores;
      const claudeScore = scores.get('claude') ?? 0;
      const geminiScore = scores.get('gemini') ?? 0;
      const codexScore = scores.get('codex') ?? 0;

      expect(claudeScore).toBeGreaterThan(geminiScore);
      expect(claudeScore).toBeGreaterThan(codexScore);
    });

    it('should scale scores by confidence', async () => {
      const stage = new PreferenceStage({ scoreWeight: 1.0 });

      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 0.5));
      const result1 = await stage.route(createMockContext());

      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 1.0));
      const result2 = await stage.route(createMockContext());

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      const score1 = result1.value.context.scores.get('claude') ?? 0;
      const score2 = result2.value.context.scores.get('claude') ?? 0;
      expect(score2).toBeGreaterThan(score1);
    });

    it('should apply scoreWeight correctly', async () => {
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('claude', 0.8, 1.0));

      const stage = new PreferenceStage({ scoreWeight: 0.1 });
      const result = await stage.route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const claudeScore = result.value.context.scores.get('claude') ?? 0;
      expect(claudeScore).toBeLessThanOrEqual(0.1);
    });

    it('should score different preferred CLIs correctly', async () => {
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision('gemini', 0.7, 0.85));

      const stage = new PreferenceStage({ scoreWeight: 0.5 });
      const result = await stage.route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const geminiScore = result.value.context.scores.get('gemini') ?? 0;
      const claudeScore = result.value.context.scores.get('claude') ?? 0;
      expect(geminiScore).toBeGreaterThan(claudeScore);
    });
  });

  describe('trace and signals', () => {
    beforeEach(() => {
      mockRouterInstance = createMockRouterInstance();
    });

    it('should add trace entry with duration', async () => {
      const stage = new PreferenceStage();
      const result = await stage.route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.context.trace).toHaveLength(1);
      expect(result.value.context.trace[0]).toMatchObject({
        stageName: 'preference-learned',
        durationMs: expect.any(Number),
      });
    });

    it('should include data points in trace details', async () => {
      mockRouterInstance.hasMinimumData.mockReturnValue(true);
      mockRouterInstance.route.mockReturnValue(createMockRoutingDecision());
      mockRouterInstance.getStats.mockReturnValue({
        totalDataPoints: 75,
        strongModelPreferenceRate: 0.5,
        estimatedCostSavingsRate: 0.2,
      });

      const stage = new PreferenceStage();
      const result = await stage.route(createMockContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.context.trace[0]?.details).toContain(String(75));
    });
  });
});
