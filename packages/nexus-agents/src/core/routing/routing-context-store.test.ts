/**
 * Tests for routing-context-store types, interfaces, and type contracts.
 *
 * Validates type shapes, discriminated union narrowing, interface compliance,
 * and factory function behavior for the unified routing context store.
 *
 * @module core/routing/routing-context-store.test
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { CliName } from '../../cli-adapters/types.js';
import type {
  IRoutingContextStore,
  RoutingContextStoreConfig,
  RoutingContextError,
  RoutingContextStats,
  PreferenceDataPoint,
  PreferenceStats,
  QueryFeatures,
  ModelPerformance,
  ModelPreference,
  ExperiencePattern,
  CachedActionResult,
  RoutingDecision,
  TaskOutcome,
  AggregatedModelMetrics,
  RoutingMetricsSummary,
  Timestamp,
  TaskType,
  Domain,
} from './routing-context-store.js';
import { RoutingContextStore, createRoutingContextStore } from './routing-context-store-impl.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeFeatures(overrides: Partial<QueryFeatures> = {}) {
  return {
    tokenCount: 100,
    complexity: 0.5,
    requiresReasoning: false,
    requiresCode: true,
    requiresCreativity: false,
    hasAmbiguity: false,
    domain: 'engineering',
    keywordSignature: 'code,function',
    ...overrides,
  } satisfies QueryFeatures;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePreference(id: string, overrides: Partial<PreferenceDataPoint> = {}) {
  return {
    id,
    query: `Query ${id}`,
    features: makeFeatures(),
    strongModelPreferred: true,
    recordedAt: new Date('2025-06-01T12:00:00Z'),
    ...overrides,
  } satisfies PreferenceDataPoint;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePerformance(overrides: Partial<ModelPerformance> = {}) {
  return {
    avgQuality: 0.8,
    successRate: 0.9,
    avgLatencyMs: 500,
    avgTokens: 200,
    observations: 10,
    ...overrides,
  } satisfies ModelPerformance;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecision(overrides: Partial<RoutingDecision> = {}) {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 8)}`,
    selectedModel: 'claude' as CliName,
    alternativeModels: ['gemini'] as CliName[],
    isExploration: false,
    ...overrides,
  } satisfies RoutingDecision;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOutcome(overrides: Partial<TaskOutcome> = {}) {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 8)}`,
    model: 'claude' as CliName,
    success: true,
    reward: 0.9,
    ...overrides,
  } satisfies TaskOutcome;
}

// ============================================================================
// QueryFeatures type shape
// ============================================================================

describe('QueryFeatures type shape', () => {
  it('holds all required fields with correct value types', () => {
    const features = makeFeatures();
    expect(typeof features.tokenCount).toBe('number');
    expect(typeof features.complexity).toBe('number');
    expect(typeof features.requiresReasoning).toBe('boolean');
    expect(typeof features.requiresCode).toBe('boolean');
    expect(typeof features.requiresCreativity).toBe('boolean');
    expect(typeof features.hasAmbiguity).toBe('boolean');
    expect(typeof features.domain).toBe('string');
    expect(typeof features.keywordSignature).toBe('string');
  });

  it('accepts zero complexity as lower bound', () => {
    const features = makeFeatures({ complexity: 0 });
    expect(features.complexity).toBe(0);
  });

  it('accepts max complexity as upper bound', () => {
    const features = makeFeatures({ complexity: 1 });
    expect(features.complexity).toBe(1);
  });

  it('accepts zero token count', () => {
    const features = makeFeatures({ tokenCount: 0 });
    expect(features.tokenCount).toBe(0);
  });

  it('accepts empty keyword signature', () => {
    const features = makeFeatures({ keywordSignature: '' });
    expect(features.keywordSignature).toBe('');
  });
});

// ============================================================================
// PreferenceDataPoint type shape
// ============================================================================

describe('PreferenceDataPoint type shape', () => {
  it('holds required fields', () => {
    const dp = makePreference('pref-1');
    expect(dp.id).toBe('pref-1');
    expect(dp.query).toBe('Query pref-1');
    expect(dp.features).toBeDefined();
    expect(typeof dp.strongModelPreferred).toBe('boolean');
    expect(dp.recordedAt).toBeInstanceOf(Date);
  });

  it('supports optional quality scores', () => {
    const dp = makePreference('pref-2', {
      strongModelQuality: 0.95,
      weakModelQuality: 0.6,
    });
    expect(dp.strongModelQuality).toBe(0.95);
    expect(dp.weakModelQuality).toBe(0.6);
  });

  it('supports optional domain field', () => {
    const dp = makePreference('pref-3', { domain: 'science' });
    expect(dp.domain).toBe('science');
  });

  it('omits optional fields when not provided', () => {
    const dp = makePreference('pref-4');
    expect(dp.strongModelQuality).toBeUndefined();
    expect(dp.weakModelQuality).toBeUndefined();
  });
});

// ============================================================================
// RoutingContextError discriminated union
// ============================================================================

describe('RoutingContextError discriminated union', () => {
  it('narrows NOT_FOUND error type', () => {
    const error: RoutingContextError = { type: 'NOT_FOUND', message: 'Missing item' };
    expect(error.type).toBe('NOT_FOUND');
    expect(error.message).toBe('Missing item');
  });

  it('narrows CAPACITY_EXCEEDED error type', () => {
    const error: RoutingContextError = { type: 'CAPACITY_EXCEEDED', message: 'Store full' };
    expect(error.type).toBe('CAPACITY_EXCEEDED');
    expect(error.message).toBe('Store full');
  });

  it('narrows INVALID_DATA error type', () => {
    const error: RoutingContextError = { type: 'INVALID_DATA', message: 'Bad JSON' };
    expect(error.type).toBe('INVALID_DATA');
    expect(error.message).toBe('Bad JSON');
  });

  it('narrows STORE_ERROR error type', () => {
    const error: RoutingContextError = { type: 'STORE_ERROR', message: 'Internal failure' };
    expect(error.type).toBe('STORE_ERROR');
    expect(error.message).toBe('Internal failure');
  });

  it('covers all four error variants via switch', () => {
    const errors: RoutingContextError[] = [
      { type: 'NOT_FOUND', message: 'a' },
      { type: 'CAPACITY_EXCEEDED', message: 'b' },
      { type: 'INVALID_DATA', message: 'c' },
      { type: 'STORE_ERROR', message: 'd' },
    ];
    const types = errors.map((e) => e.type);
    expect(types).toEqual(['NOT_FOUND', 'CAPACITY_EXCEEDED', 'INVALID_DATA', 'STORE_ERROR']);
  });
});

// ============================================================================
// ModelPerformance type shape
// ============================================================================

describe('ModelPerformance type shape', () => {
  it('holds all required numeric fields', () => {
    const perf = makePerformance();
    expect(typeof perf.avgQuality).toBe('number');
    expect(typeof perf.successRate).toBe('number');
    expect(typeof perf.avgLatencyMs).toBe('number');
    expect(typeof perf.avgTokens).toBe('number');
    expect(typeof perf.observations).toBe('number');
  });

  it('accepts zero observations', () => {
    const perf = makePerformance({ observations: 0 });
    expect(perf.observations).toBe(0);
  });
});

// ============================================================================
// RoutingDecision and TaskOutcome type shapes
// ============================================================================

describe('RoutingDecision type shape', () => {
  it('holds required fields with correct types', () => {
    const decision = makeDecision();
    expect(typeof decision.timestamp).toBe('string');
    expect(typeof decision.traceId).toBe('string');
    expect(typeof decision.selectedModel).toBe('string');
    expect(Array.isArray(decision.alternativeModels)).toBe(true);
    expect(typeof decision.isExploration).toBe('boolean');
  });

  it('supports optional taskType and contextTokens', () => {
    const decision = makeDecision({
      taskType: 'coding',
      contextTokens: 5000,
      routingLatencyMs: 12,
    });
    expect(decision.taskType).toBe('coding');
    expect(decision.contextTokens).toBe(5000);
    expect(decision.routingLatencyMs).toBe(12);
  });
});

describe('TaskOutcome type shape', () => {
  it('holds required fields with correct types', () => {
    const outcome = makeOutcome();
    expect(typeof outcome.timestamp).toBe('string');
    expect(typeof outcome.traceId).toBe('string');
    expect(typeof outcome.model).toBe('string');
    expect(typeof outcome.success).toBe('boolean');
    expect(typeof outcome.reward).toBe('number');
  });

  it('supports optional qualityScore and latencyMs', () => {
    const outcome = makeOutcome({
      qualityScore: 0.85,
      latencyMs: 250,
    });
    expect(outcome.qualityScore).toBe(0.85);
    expect(outcome.latencyMs).toBe(250);
  });
});

// ============================================================================
// RoutingContextStoreConfig defaults
// ============================================================================

describe('RoutingContextStoreConfig defaults', () => {
  it('store uses defaults when no config provided', () => {
    const store = createRoutingContextStore();
    const stats = store.getStats();
    expect(stats.preferenceDataPoints).toBe(0);
    expect(stats.routingDecisions).toBe(0);
    expect(stats.taskOutcomes).toBe(0);
  });

  it('store accepts partial config overrides', () => {
    const config: RoutingContextStoreConfig = {
      maxPreferenceDataPoints: 50,
      retentionHours: 24,
    };
    const store = createRoutingContextStore(config);
    expect(store).toBeDefined();
  });

  it('store accepts empty config object', () => {
    const store = createRoutingContextStore({});
    expect(store).toBeDefined();
  });
});

// ============================================================================
// IRoutingContextStore interface compliance
// ============================================================================

describe('IRoutingContextStore interface compliance', () => {
  let store: IRoutingContextStore;

  beforeEach(() => {
    store = createRoutingContextStore();
  });

  it('implements all preference methods', () => {
    expect(typeof store.storePreference).toBe('function');
    expect(typeof store.getAllPreferences).toBe('function');
    expect(typeof store.getPreferencesByDomain).toBe('function');
    expect(typeof store.findSimilarPreferences).toBe('function');
    expect(typeof store.getPreferenceStats).toBe('function');
  });

  it('implements all performance methods', () => {
    expect(typeof store.storeModelPerformance).toBe('function');
    expect(typeof store.getModelPreferences).toBe('function');
    expect(typeof store.getRecommendation).toBe('function');
    expect(typeof store.recordExperience).toBe('function');
    expect(typeof store.getExperiencePatterns).toBe('function');
    expect(typeof store.cacheAction).toBe('function');
    expect(typeof store.getCachedAction).toBe('function');
  });

  it('implements all metrics methods', () => {
    expect(typeof store.recordRoutingDecision).toBe('function');
    expect(typeof store.recordTaskOutcome).toBe('function');
    expect(typeof store.getMetrics).toBe('function');
    expect(typeof store.getRoutingDecisions).toBe('function');
    expect(typeof store.getTaskOutcomes).toBe('function');
  });

  it('implements all unified methods', () => {
    expect(typeof store.getStats).toBe('function');
    expect(typeof store.clear).toBe('function');
    expect(typeof store.cleanup).toBe('function');
    expect(typeof store.toJSON).toBe('function');
    expect(typeof store.fromJSON).toBe('function');
  });
});

// ============================================================================
// PreferenceStats type shape
// ============================================================================

describe('PreferenceStats type shape', () => {
  it('returns correct shape from empty store', () => {
    const store = createRoutingContextStore();
    const stats: PreferenceStats = store.getPreferenceStats();
    expect(stats.totalDataPoints).toBe(0);
    expect(stats.strongModelPreferenceRate).toBe(0);
    expect(stats.estimatedCostSavingsRate).toBe(1);
    expect(stats.lastUpdatedAt).toBeInstanceOf(Date);
    expect(typeof stats.dataPointsByDomain).toBe('object');
  });

  it('dataPointsByDomain is a record of domain counts', () => {
    const store = createRoutingContextStore();
    store.storePreference(makePreference('dp-1', { domain: 'code' }));
    store.storePreference(makePreference('dp-2', { domain: 'code' }));
    store.storePreference(makePreference('dp-3', { domain: 'writing' }));

    const stats = store.getPreferenceStats();
    expect(stats.dataPointsByDomain['code']).toBe(2);
    expect(stats.dataPointsByDomain['writing']).toBe(1);
  });
});

// ============================================================================
// RoutingContextStats type shape
// ============================================================================

describe('RoutingContextStats type shape', () => {
  it('returns all required stat fields from empty store', () => {
    const store = createRoutingContextStore();
    const stats: RoutingContextStats = store.getStats();
    expect(typeof stats.preferenceDataPoints).toBe('number');
    expect(typeof stats.strongModelPreferenceRate).toBe('number');
    expect(typeof stats.modelPreferences).toBe('number');
    expect(typeof stats.experiencePatterns).toBe('number');
    expect(typeof stats.cachedActions).toBe('number');
    expect(typeof stats.cacheHits).toBe('number');
    expect(typeof stats.cacheMisses).toBe('number');
    expect(typeof stats.routingDecisions).toBe('number');
    expect(typeof stats.taskOutcomes).toBe('number');
    expect(typeof stats.explorationRate).toBe('number');
    expect(typeof stats.avgReward).toBe('number');
  });

  it('all stats start at zero for a fresh store', () => {
    const store = createRoutingContextStore();
    const stats = store.getStats();
    expect(stats.preferenceDataPoints).toBe(0);
    expect(stats.modelPreferences).toBe(0);
    expect(stats.experiencePatterns).toBe(0);
    expect(stats.cachedActions).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
    expect(stats.routingDecisions).toBe(0);
    expect(stats.taskOutcomes).toBe(0);
  });
});

// ============================================================================
// RoutingMetricsSummary type shape
// ============================================================================

describe('RoutingMetricsSummary type shape', () => {
  it('returns correct shape from empty period', () => {
    const store = createRoutingContextStore();
    const summary: RoutingMetricsSummary = store.getMetrics(24);
    expect(typeof summary.periodStart).toBe('string');
    expect(typeof summary.periodEnd).toBe('string');
    expect(summary.totalDecisions).toBe(0);
    expect(summary.totalOutcomes).toBe(0);
    expect(Array.isArray(summary.modelMetrics)).toBe(true);
    expect(summary.modelMetrics).toHaveLength(0);
    expect(typeof summary.explorationRate).toBe('number');
    expect(typeof summary.avgReward).toBe('number');
    expect(typeof summary.avgRewardTrend).toBe('number');
    expect(typeof summary.avgRoutingLatencyMs).toBe('number');
  });

  it('periodStart and periodEnd are valid ISO timestamps', () => {
    const store = createRoutingContextStore();
    const summary = store.getMetrics(1);
    expect(Number.isNaN(Date.parse(summary.periodStart))).toBe(false);
    expect(Number.isNaN(Date.parse(summary.periodEnd))).toBe(false);
  });
});

// ============================================================================
// AggregatedModelMetrics type shape
// ============================================================================

describe('AggregatedModelMetrics type shape', () => {
  it('returns model metrics with correct fields', () => {
    const store = createRoutingContextStore();
    const traceId = 'trace-agg-test';
    store.recordRoutingDecision(makeDecision({ traceId, isExploration: true }));
    store.recordTaskOutcome(
      makeOutcome({ traceId, reward: 0.7, qualityScore: 0.8, latencyMs: 300 })
    );

    const summary = store.getMetrics(24);
    expect(summary.modelMetrics).toHaveLength(1);

    const metric: AggregatedModelMetrics = summary.modelMetrics[0]!;
    expect(typeof metric.model).toBe('string');
    expect(typeof metric.selectionCount).toBe('number');
    expect(typeof metric.selectionPercent).toBe('number');
    expect(typeof metric.avgReward).toBe('number');
    expect(typeof metric.avgQuality).toBe('number');
    expect(typeof metric.avgLatencyMs).toBe('number');
    expect(typeof metric.successRate).toBe('number');
    expect(typeof metric.explorationCount).toBe('number');
  });
});

// ============================================================================
// ModelPreference type shape
// ============================================================================

describe('ModelPreference type shape', () => {
  it('returns preferences with all required fields', () => {
    const store = createRoutingContextStore({ minObservations: 1 });
    store.storeModelPerformance('claude', 'coding', makePerformance({ observations: 5 }));

    const prefs = store.getModelPreferences('coding');
    expect(prefs).toHaveLength(1);

    const pref: ModelPreference = prefs[0]!;
    expect(typeof pref.model).toBe('string');
    expect(typeof pref.strength).toBe('number');
    expect(typeof pref.confidence).toBe('number');
    expect(pref.performance).toBeDefined();
    expect(typeof pref.performance.avgQuality).toBe('number');
  });
});

// ============================================================================
// ExperiencePattern type shape
// ============================================================================

describe('ExperiencePattern type shape', () => {
  it('returns experience patterns with all required fields', () => {
    const store = createRoutingContextStore();
    store.recordExperience('review', ['claude', 'gemini'] as CliName[], true, 3000);

    const patterns = store.getExperiencePatterns('review');
    expect(patterns).toHaveLength(1);

    const pattern: ExperiencePattern = patterns[0]!;
    expect(typeof pattern.workflow).toBe('string');
    expect(Array.isArray(pattern.modelSequence)).toBe(true);
    expect(typeof pattern.successRate).toBe('number');
    expect(typeof pattern.avgDurationMs).toBe('number');
    expect(typeof pattern.usageCount).toBe('number');
    expect(pattern.workflow).toBe('review');
    expect(pattern.modelSequence).toEqual(['claude', 'gemini']);
  });
});

// ============================================================================
// CachedActionResult type shape
// ============================================================================

describe('CachedActionResult type shape', () => {
  it('returns cached action with all required fields', () => {
    const store = createRoutingContextStore();
    store.cacheAction('build', 'claude', { status: 'ok' }, 250);

    const cached: CachedActionResult | undefined = store.getCachedAction('build');
    expect(cached).toBeDefined();
    expect(cached!.action).toBe('build');
    expect(cached!.model).toBe('claude');
    expect(cached!.result).toEqual({ status: 'ok' });
    expect(cached!.cachedAt).toBeInstanceOf(Date);
    expect(typeof cached!.timeSavedMs).toBe('number');
    expect(cached!.timeSavedMs).toBe(250);
  });
});

// ============================================================================
// Timestamp, TaskType, Domain type aliases
// ============================================================================

describe('type alias strings', () => {
  it('Timestamp is an ISO 8601 string', () => {
    const ts: Timestamp = new Date().toISOString();
    expect(Number.isNaN(Date.parse(ts))).toBe(false);
  });

  it('TaskType is a string identifier', () => {
    const taskType: TaskType = 'code-review';
    expect(typeof taskType).toBe('string');
  });

  it('Domain is a string identifier', () => {
    const domain: Domain = 'engineering';
    expect(typeof domain).toBe('string');
  });
});

// ============================================================================
// createRoutingContextStore factory
// ============================================================================

describe('createRoutingContextStore factory', () => {
  it('returns an object implementing IRoutingContextStore', () => {
    const store: IRoutingContextStore = createRoutingContextStore();
    expect(store).toBeDefined();
    // Verify it has the core methods from the interface
    expect(typeof store.storePreference).toBe('function');
    expect(typeof store.getStats).toBe('function');
    expect(typeof store.clear).toBe('function');
    expect(typeof store.toJSON).toBe('function');
  });

  it('returns RoutingContextStore instance', () => {
    const store = createRoutingContextStore();
    expect(store).toBeInstanceOf(RoutingContextStore);
  });

  it('each call creates an independent store', () => {
    const store1 = createRoutingContextStore();
    const store2 = createRoutingContextStore();
    store1.storePreference(makePreference('dp-1'));

    expect(store1.getAllPreferences()).toHaveLength(1);
    expect(store2.getAllPreferences()).toHaveLength(0);
  });
});
