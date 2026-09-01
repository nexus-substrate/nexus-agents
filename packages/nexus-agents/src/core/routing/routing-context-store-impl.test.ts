/**
 * Tests for RoutingContextStore - In-memory routing context store implementation.
 *
 * Covers: preference data, performance tracking, experience patterns,
 * action caching, routing decisions, task outcomes, metrics, serialization.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { CliName } from '../../cli-adapters/types.js';
import type {
  PreferenceDataPoint,
  QueryFeatures,
  ModelPerformance,
  RoutingDecision,
  TaskOutcome,
} from './routing-context-store.js';

import { RoutingContextStore, createRoutingContextStore } from './routing-context-store-impl.js';

// ============================================================================
// Test helpers
// ============================================================================

function makeFeatures(overrides: Partial<QueryFeatures> = {}): QueryFeatures {
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
  };
}

function makePreference(
  id: string,
  overrides: Partial<PreferenceDataPoint> = {}
): PreferenceDataPoint {
  return {
    id,
    query: `Query ${id}`,
    features: makeFeatures(),
    strongModelPreferred: true,
    recordedAt: new Date(),
    ...overrides,
  };
}

function makePerformance(overrides: Partial<ModelPerformance> = {}): ModelPerformance {
  return {
    avgQuality: 0.8,
    successRate: 0.9,
    avgLatencyMs: 500,
    avgTokens: 200,
    observations: 10,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${Math.random().toString(36).slice(2, 8)}`,
    selectedModel: 'claude',
    alternativeModels: ['gemini'] as CliName[],
    isExploration: false,
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${Math.random().toString(36).slice(2, 8)}`,
    model: 'claude',
    success: true,
    reward: 0.9,
    ...overrides,
  };
}

// ============================================================================
// Factory function
// ============================================================================

describe('createRoutingContextStore', () => {
  it('creates a store with default config', () => {
    const store = createRoutingContextStore();
    expect(store).toBeDefined();
    const stats = store.getStats();
    expect(stats.preferenceDataPoints).toBe(0);
  });

  it('creates a store with custom config', () => {
    const store = createRoutingContextStore({ minObservations: 3 });
    expect(store).toBeDefined();
  });
});

// ============================================================================
// Preference Data Methods
// ============================================================================

describe('RoutingContextStore Preference Data', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore();
  });

  it('stores and retrieves preference data points', () => {
    const dp = makePreference('dp-1');
    const result = store.storePreference(dp);
    expect(result.ok).toBe(true);

    const all = store.getAllPreferences();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('dp-1');
  });

  it('filters preferences by domain', () => {
    store.storePreference(makePreference('dp-1', { domain: 'engineering' }));
    store.storePreference(makePreference('dp-2', { domain: 'research' }));
    store.storePreference(makePreference('dp-3', { domain: 'engineering' }));

    const engineering = store.getPreferencesByDomain('engineering');
    expect(engineering.length).toBeGreaterThanOrEqual(2);
  });

  it('filters preferences by features domain when no top-level domain', () => {
    store.storePreference(
      makePreference('dp-1', {
        features: makeFeatures({ domain: 'science' }),
      })
    );
    const science = store.getPreferencesByDomain('science');
    expect(science).toHaveLength(1);
  });

  it('finds similar preferences by features', () => {
    const features1 = makeFeatures({ complexity: 0.9, tokenCount: 500 });
    const features2 = makeFeatures({ complexity: 0.1, tokenCount: 50 });
    const targetFeatures = makeFeatures({ complexity: 0.8, tokenCount: 400 });

    store.storePreference(makePreference('dp-complex', { features: features1 }));
    store.storePreference(makePreference('dp-simple', { features: features2 }));

    const similar = store.findSimilarPreferences(targetFeatures, 2);
    expect(similar).toHaveLength(2);
    // The more similar one (features1) should come first
    expect(similar[0]?.id).toBe('dp-complex');
  });

  it('respects limit in findSimilarPreferences', () => {
    for (let i = 0; i < 10; i++) {
      store.storePreference(makePreference(`dp-${String(i)}`));
    }
    const similar = store.findSimilarPreferences(makeFeatures(), 3);
    expect(similar).toHaveLength(3);
  });

  it('evicts oldest preferences when at capacity', () => {
    const smallStore = new RoutingContextStore({ maxPreferenceDataPoints: 5 });
    for (let i = 0; i < 6; i++) {
      smallStore.storePreference(
        makePreference(`dp-${String(i)}`, {
          recordedAt: new Date(Date.now() + i * 1000),
        })
      );
    }
    const all = smallStore.getAllPreferences();
    // Should have evicted ~10% of 5 = 1, so 5 remain
    expect(all.length).toBeLessThanOrEqual(5);
  });

  it('calculates preference stats correctly', () => {
    store.storePreference(makePreference('dp-1', { strongModelPreferred: true }));
    store.storePreference(makePreference('dp-2', { strongModelPreferred: false }));
    store.storePreference(makePreference('dp-3', { strongModelPreferred: true }));

    const stats = store.getPreferenceStats();
    expect(stats.totalDataPoints).toBe(3);
    expect(stats.strongModelPreferenceRate).toBeCloseTo(2 / 3);
    expect(stats.estimatedCostSavingsRate).toBeCloseTo(1 / 3);
  });
});

// ============================================================================
// Performance Methods
// ============================================================================

describe('RoutingContextStore Performance', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore({ minObservations: 3 });
  });

  it('stores and accumulates model performance', () => {
    const perf = makePerformance({ observations: 5 });
    const result = store.storeModelPerformance('claude', 'coding', perf);
    expect(result.ok).toBe(true);
  });

  it('returns model preferences sorted by strength', () => {
    // Store enough observations to pass minObservations threshold
    store.storeModelPerformance(
      'claude',
      'coding',
      makePerformance({
        avgQuality: 0.9,
        successRate: 0.95,
        observations: 5,
      })
    );
    store.storeModelPerformance(
      'gemini',
      'coding',
      makePerformance({
        avgQuality: 0.7,
        successRate: 0.8,
        observations: 5,
      })
    );

    const prefs = store.getModelPreferences('coding');
    expect(prefs.length).toBe(2);
    // Claude should have higher strength
    expect(prefs[0]?.model).toBe('claude');
  });

  it('excludes models with too few observations from preferences', () => {
    store.storeModelPerformance(
      'claude',
      'coding',
      makePerformance({
        observations: 1, // below minObservations of 3
      })
    );

    const prefs = store.getModelPreferences('coding');
    expect(prefs).toHaveLength(0);
  });

  it('returns recommendation for confident model', () => {
    // 10 observations with minObservations=3 and confidenceThreshold=0.6
    // confidence = min(1, 10 / (3*2)) = 1.0 >= 0.6
    store.storeModelPerformance(
      'claude',
      'coding',
      makePerformance({
        avgQuality: 0.9,
        successRate: 0.95,
        observations: 10,
      })
    );

    const recommendation = store.getRecommendation('coding');
    expect(recommendation).toBe('claude');
  });

  it('returns undefined recommendation when insufficient confidence', () => {
    store.storeModelPerformance(
      'claude',
      'coding',
      makePerformance({
        observations: 3, // confidence = min(1, 3 / (3*2)) = 0.5 < 0.6
      })
    );

    const recommendation = store.getRecommendation('coding');
    expect(recommendation).toBeUndefined();
  });

  it('returns undefined recommendation for unknown task type', () => {
    const recommendation = store.getRecommendation('unknown');
    expect(recommendation).toBeUndefined();
  });

  it('returns empty preferences for unknown task type', () => {
    const prefs = store.getModelPreferences('nonexistent');
    expect(prefs).toHaveLength(0);
  });
});

// ============================================================================
// Experience Methods
// ============================================================================

describe('RoutingContextStore Experience', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore();
  });

  it('records and retrieves experience patterns', () => {
    const models: CliName[] = ['claude', 'gemini'];
    store.recordExperience('code-review', models, true, 5000);
    store.recordExperience('code-review', models, false, 3000);

    const patterns = store.getExperiencePatterns('code-review');
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.usageCount).toBe(2);
    expect(patterns[0]?.successRate).toBe(0.5);
    expect(patterns[0]?.avgDurationMs).toBe(4000);
  });

  it('tracks different model sequences separately', () => {
    store.recordExperience('workflow', ['claude'] as CliName[], true, 1000);
    store.recordExperience('workflow', ['gemini'] as CliName[], true, 2000);

    const patterns = store.getExperiencePatterns('workflow');
    expect(patterns).toHaveLength(2);
  });

  it('returns empty patterns for unknown workflow', () => {
    const patterns = store.getExperiencePatterns('nonexistent');
    expect(patterns).toHaveLength(0);
  });

  it('sorts patterns by usage count descending', () => {
    store.recordExperience('wf', ['claude'] as CliName[], true, 1000);
    store.recordExperience('wf', ['claude'] as CliName[], true, 1000);
    store.recordExperience('wf', ['claude'] as CliName[], true, 1000);
    store.recordExperience('wf', ['gemini'] as CliName[], true, 1000);

    const patterns = store.getExperiencePatterns('wf');
    expect(patterns[0]?.modelSequence).toEqual(['claude']);
    expect(patterns[0]?.usageCount).toBe(3);
  });
});

// ============================================================================
// Action Cache Methods
// ============================================================================

describe('RoutingContextStore Action Cache', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore({ actionCacheTtlMs: 10000 });
  });

  it('caches and retrieves actions', () => {
    store.cacheAction('build-project', 'claude', { output: 'success' }, 500);
    const cached = store.getCachedAction('build-project');
    expect(cached).toBeDefined();
    expect(cached?.action).toBe('build-project');
    expect(cached?.model).toBe('claude');
    expect(cached?.result).toEqual({ output: 'success' });
  });

  it('returns undefined for non-cached actions', () => {
    const cached = store.getCachedAction('unknown');
    expect(cached).toBeUndefined();
  });

  it('tracks cache hits and misses', () => {
    store.cacheAction('action1', 'claude', 'result', 100);

    store.getCachedAction('action1'); // hit
    store.getCachedAction('action1'); // hit
    store.getCachedAction('unknown'); // miss

    const stats = store.getStats();
    expect(stats.cacheHits).toBe(2);
    expect(stats.cacheMisses).toBe(1);
  });

  it('expires cached actions after TTL', () => {
    const shortTtl = new RoutingContextStore({ actionCacheTtlMs: 1 });
    shortTtl.cacheAction('action1', 'claude', 'result', 100);

    // Wait a few ms for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait
    }

    const cached = shortTtl.getCachedAction('action1');
    expect(cached).toBeUndefined();
  });
});

// ============================================================================
// Metrics Methods
// ============================================================================

describe('RoutingContextStore Metrics', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore();
  });

  it('records and retrieves routing decisions', () => {
    store.recordRoutingDecision(makeDecision());
    store.recordRoutingDecision(makeDecision({ selectedModel: 'gemini' as CliName }));

    const decisions = store.getRoutingDecisions(24);
    expect(decisions).toHaveLength(2);
  });

  it('records and retrieves task outcomes', () => {
    store.recordTaskOutcome(makeOutcome());
    store.recordTaskOutcome(makeOutcome({ success: false, reward: 0.1 }));

    const outcomes = store.getTaskOutcomes(24);
    expect(outcomes).toHaveLength(2);
  });

  it('filters decisions by time period', () => {
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    store.recordRoutingDecision(makeDecision({ timestamp: oldTimestamp }));
    store.recordRoutingDecision(makeDecision());

    const recentDecisions = store.getRoutingDecisions(24);
    expect(recentDecisions).toHaveLength(1);
  });

  it('filters outcomes by time period', () => {
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    store.recordTaskOutcome(makeOutcome({ timestamp: oldTimestamp }));
    store.recordTaskOutcome(makeOutcome());

    const recentOutcomes = store.getTaskOutcomes(24);
    expect(recentOutcomes).toHaveLength(1);
  });

  it('evicts old decisions when at capacity', () => {
    const smallStore = new RoutingContextStore({ maxRoutingDecisions: 3 });
    for (let i = 0; i < 5; i++) {
      smallStore.recordRoutingDecision(makeDecision());
    }
    const decisions = smallStore.getRoutingDecisions(24);
    expect(decisions.length).toBeLessThanOrEqual(3);
  });

  it('evicts old outcomes when at capacity', () => {
    const smallStore = new RoutingContextStore({ maxTaskOutcomes: 3 });
    for (let i = 0; i < 5; i++) {
      smallStore.recordTaskOutcome(makeOutcome());
    }
    const outcomes = smallStore.getTaskOutcomes(24);
    expect(outcomes.length).toBeLessThanOrEqual(3);
  });

  it('calculates metrics summary', () => {
    store.recordRoutingDecision(makeDecision({ isExploration: true }));
    store.recordRoutingDecision(makeDecision({ isExploration: false }));
    store.recordTaskOutcome(makeOutcome({ reward: 0.8 }));
    store.recordTaskOutcome(makeOutcome({ reward: 0.6 }));

    const metrics = store.getMetrics(24);
    expect(metrics.totalDecisions).toBe(2);
    expect(metrics.totalOutcomes).toBe(2);
    expect(typeof metrics.explorationRate).toBe('number');
    expect(typeof metrics.avgReward).toBe('number');
  });
});

// ============================================================================
// Unified Methods
// ============================================================================

describe('RoutingContextStore unified methods', () => {
  let store: RoutingContextStore;

  beforeEach(() => {
    store = new RoutingContextStore();
  });

  it('returns comprehensive stats', () => {
    store.storePreference(makePreference('dp-1'));
    store.storeModelPerformance('claude', 'coding', makePerformance());
    store.recordExperience('wf', ['claude'] as CliName[], true, 1000);
    store.cacheAction('action1', 'claude', 'result', 100);
    store.recordRoutingDecision(makeDecision());
    store.recordTaskOutcome(makeOutcome());

    const stats = store.getStats();
    expect(stats.preferenceDataPoints).toBe(1);
    expect(stats.modelPreferences).toBe(1);
    expect(stats.experiencePatterns).toBe(1);
    expect(stats.cachedActions).toBe(1);
    expect(stats.routingDecisions).toBe(1);
    expect(stats.taskOutcomes).toBe(1);
  });

  it('clears all data', () => {
    store.storePreference(makePreference('dp-1'));
    store.storeModelPerformance('claude', 'coding', makePerformance());
    store.cacheAction('action1', 'claude', 'result', 100);
    store.getCachedAction('action1'); // cache hit
    store.recordRoutingDecision(makeDecision());
    store.recordTaskOutcome(makeOutcome());

    store.clear();

    const stats = store.getStats();
    expect(stats.preferenceDataPoints).toBe(0);
    expect(stats.cachedActions).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
    expect(stats.routingDecisions).toBe(0);
    expect(stats.taskOutcomes).toBe(0);
  });

  it('cleanup removes expired cache entries', () => {
    const shortTtl = new RoutingContextStore({ actionCacheTtlMs: 1 });
    shortTtl.cacheAction('action1', 'claude', 'result', 100);

    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait for TTL
    }

    shortTtl.cleanup();
    const stats = shortTtl.getStats();
    expect(stats.cachedActions).toBe(0);
  });
});

// ============================================================================
// Serialization
// ============================================================================

describe('RoutingContextStore serialization', () => {
  it('round-trips data through toJSON/fromJSON', () => {
    const store = new RoutingContextStore();
    store.storePreference(makePreference('dp-1'));
    store.storeModelPerformance('claude', 'coding', makePerformance());
    store.recordExperience('wf', ['claude'] as CliName[], true, 1000);
    store.cacheAction('action1', 'claude', 'result', 100);
    store.getCachedAction('action1'); // cache hit
    store.getCachedAction('unknown'); // cache miss
    store.recordRoutingDecision(makeDecision());
    store.recordTaskOutcome(makeOutcome());

    const json = store.toJSON();
    expect(typeof json).toBe('string');

    const restored = new RoutingContextStore();
    const result = restored.fromJSON(json);
    expect(result.ok).toBe(true);

    const stats = restored.getStats();
    expect(stats.preferenceDataPoints).toBe(1);
    expect(stats.cachedActions).toBe(1);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.routingDecisions).toBe(1);
    expect(stats.taskOutcomes).toBe(1);
  });

  it('returns error for invalid JSON', () => {
    const store = new RoutingContextStore();
    const result = store.fromJSON('not valid json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INVALID_DATA');
    }
  });

  // #5328: `fromJSON` used to `clear()` before inspecting any field, so a
  // payload that failed partway through wiped the store while returning a
  // clean INVALID_DATA — an error that reads as "nothing happened".
  it('leaves the store intact when the payload is not valid JSON', () => {
    const store = new RoutingContextStore();
    store.storePreference(makePreference('keep-me'));

    const result = store.fromJSON('not valid json');

    expect(result.ok).toBe(false);
    const all = store.getAllPreferences();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('keep-me');
  });

  it('leaves the store intact when the payload is JSON but not a store', () => {
    const store = new RoutingContextStore();
    store.storePreference(makePreference('keep-me'));

    const result = store.fromJSON(JSON.stringify({ preferences: 'not-an-array' }));

    expect(result.ok).toBe(false);
    expect(store.getAllPreferences()).toHaveLength(1);
  });

  it('rejects a non-numeric cacheHits rather than storing it', () => {
    const store = new RoutingContextStore();
    const valid = JSON.parse(new RoutingContextStore().toJSON()) as Record<string, unknown>;
    const result = store.fromJSON(JSON.stringify({ ...valid, cacheHits: '5' }));

    expect(result.ok).toBe(false);
    // A string here later reaches `this.cacheHits++`, which concatenates.
    expect(typeof store.getStats().cacheHits).toBe('number');
  });

  it('clears existing data before loading from JSON', () => {
    const store = new RoutingContextStore();
    store.storePreference(makePreference('dp-1'));
    store.storePreference(makePreference('dp-2'));

    const emptyStore = new RoutingContextStore();
    emptyStore.storePreference(makePreference('dp-3'));
    const json = emptyStore.toJSON();

    store.fromJSON(json);
    const all = store.getAllPreferences();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('dp-3');
  });
});
