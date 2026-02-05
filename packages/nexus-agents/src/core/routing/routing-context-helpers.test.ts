/**
 * Tests for RoutingContextStore Helpers
 * @module core/routing/routing-context-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliName } from '../../cli-adapters/types.js';
import type {
  QueryFeatures,
  RoutingDecision,
  TaskOutcome,
  ModelPerformance,
} from './routing-context-store.js';
import {
  buildOutcomeMap,
  aggregateByModel,
  buildModelMetrics,
  calculateSimilarity,
  calculateStrength,
  cleanupOldRecords,
  avg,
} from './routing-context-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 8)}`,
    selectedModel: 'claude' as CliName,
    alternativeModels: [],
    isExploration: false,
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    timestamp: new Date().toISOString(),
    traceId: `trace-${String(Math.random()).slice(2, 8)}`,
    model: 'claude' as CliName,
    success: true,
    reward: 0.8,
    ...overrides,
  };
}

function makeFeatures(overrides: Partial<QueryFeatures> = {}): QueryFeatures {
  return {
    tokenCount: 500,
    complexity: 0.5,
    requiresReasoning: false,
    requiresCode: false,
    requiresCreativity: false,
    hasAmbiguity: false,
    domain: 'general',
    keywordSignature: 'test',
    ...overrides,
  };
}

// ============================================================================
// avg
// ============================================================================

describe('avg', () => {
  it('returns average of numbers', () => {
    expect(avg([1, 2, 3])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0);
  });

  it('handles single element', () => {
    expect(avg([5])).toBe(5);
  });

  it('handles decimal values', () => {
    expect(avg([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
  });
});

// ============================================================================
// buildOutcomeMap
// ============================================================================

describe('buildOutcomeMap', () => {
  it('builds map keyed by traceId', () => {
    const outcomes = [
      makeOutcome({ traceId: 't1', reward: 0.8 }),
      makeOutcome({ traceId: 't2', reward: 0.6 }),
    ];
    const map = buildOutcomeMap(outcomes);
    expect(map.size).toBe(2);
    expect(map.get('t1')?.reward).toBe(0.8);
    expect(map.get('t2')?.reward).toBe(0.6);
  });

  it('returns empty map for empty array', () => {
    expect(buildOutcomeMap([]).size).toBe(0);
  });

  it('last outcome wins on duplicate traceId', () => {
    const outcomes = [
      makeOutcome({ traceId: 't1', reward: 0.5 }),
      makeOutcome({ traceId: 't1', reward: 0.9 }),
    ];
    const map = buildOutcomeMap(outcomes);
    expect(map.get('t1')?.reward).toBe(0.9);
  });
});

// ============================================================================
// aggregateByModel
// ============================================================================

describe('aggregateByModel', () => {
  it('aggregates decisions by selected model', () => {
    const decisions = [
      makeDecision({ selectedModel: 'claude' as CliName, traceId: 't1' }),
      makeDecision({ selectedModel: 'claude' as CliName, traceId: 't2' }),
      makeDecision({ selectedModel: 'openai' as CliName, traceId: 't3' }),
    ];
    const outcomeMap = new Map<string, TaskOutcome>();

    const aggs = aggregateByModel(decisions, outcomeMap);
    expect(aggs.get('claude' as CliName)?.selectionCount).toBe(2);
    expect(aggs.get('openai' as CliName)?.selectionCount).toBe(1);
  });

  it('tracks exploration count', () => {
    const decisions = [
      makeDecision({ isExploration: true, traceId: 't1' }),
      makeDecision({ isExploration: false, traceId: 't2' }),
      makeDecision({ isExploration: true, traceId: 't3' }),
    ];
    const aggs = aggregateByModel(decisions, new Map());
    expect(aggs.get('claude' as CliName)?.explorationCount).toBe(2);
  });

  it('adds outcome data when available', () => {
    const decisions = [makeDecision({ traceId: 't1' })];
    const outcomeMap = new Map([
      ['t1', makeOutcome({ traceId: 't1', reward: 0.9, qualityScore: 0.85, latencyMs: 300 })],
    ]);

    const aggs = aggregateByModel(decisions, outcomeMap);
    const claudeAgg = aggs.get('claude' as CliName);
    expect(claudeAgg?.rewards).toEqual([0.9]);
    expect(claudeAgg?.qualities).toEqual([0.85]);
    expect(claudeAgg?.latencies).toEqual([300]);
    expect(claudeAgg?.successes).toBe(1);
  });

  it('handles decisions without matching outcomes', () => {
    const decisions = [makeDecision({ traceId: 't1' })];
    const aggs = aggregateByModel(decisions, new Map());
    const claudeAgg = aggs.get('claude' as CliName);
    expect(claudeAgg?.rewards).toEqual([]);
    expect(claudeAgg?.successes).toBe(0);
  });
});

// ============================================================================
// buildModelMetrics
// ============================================================================

describe('buildModelMetrics', () => {
  it('builds metrics from aggregations', () => {
    const decisions = [
      makeDecision({ selectedModel: 'claude' as CliName, traceId: 't1', isExploration: false }),
      makeDecision({ selectedModel: 'claude' as CliName, traceId: 't2', isExploration: true }),
    ];
    const outcomeMap = new Map([
      ['t1', makeOutcome({ traceId: 't1', reward: 0.9, qualityScore: 0.8, latencyMs: 200 })],
      ['t2', makeOutcome({ traceId: 't2', reward: 0.7, qualityScore: 0.6, latencyMs: 400 })],
    ]);
    const aggs = aggregateByModel(decisions, outcomeMap);
    const { modelMetrics, totals } = buildModelMetrics(aggs, 2);

    expect(modelMetrics).toHaveLength(1);
    expect(modelMetrics[0]?.model).toBe('claude');
    expect(modelMetrics[0]?.selectionCount).toBe(2);
    expect(modelMetrics[0]?.selectionPercent).toBe(1);
    expect(modelMetrics[0]?.avgReward).toBeCloseTo(0.8);
    expect(modelMetrics[0]?.avgQuality).toBeCloseTo(0.7);
    expect(modelMetrics[0]?.avgLatencyMs).toBeCloseTo(300);

    expect(totals.explorationRate).toBe(0.5);
    expect(totals.avgReward).toBeCloseTo(0.8);
    expect(totals.avgLatency).toBeCloseTo(300);
  });

  it('handles empty aggregations', () => {
    const { modelMetrics, totals } = buildModelMetrics(new Map(), 0);
    expect(modelMetrics).toHaveLength(0);
    expect(totals.explorationRate).toBe(0);
    expect(totals.avgReward).toBe(0);
    expect(totals.avgLatency).toBe(0);
  });

  it('handles aggregation with no outcomes', () => {
    const decisions = [makeDecision({ traceId: 't1' })];
    const aggs = aggregateByModel(decisions, new Map());
    const { modelMetrics } = buildModelMetrics(aggs, 1);
    expect(modelMetrics[0]?.avgReward).toBe(0);
    expect(modelMetrics[0]?.successRate).toBe(0);
  });
});

// ============================================================================
// calculateSimilarity
// ============================================================================

describe('calculateSimilarity', () => {
  it('returns 1 for identical features', () => {
    const features = makeFeatures();
    expect(calculateSimilarity(features, features)).toBe(1);
  });

  it('returns lower similarity for different domains', () => {
    const a = makeFeatures({ domain: 'code' });
    const b = makeFeatures({ domain: 'writing' });
    const sameDomain = calculateSimilarity(a, a);
    const diffDomain = calculateSimilarity(a, b);
    expect(diffDomain).toBeLessThan(sameDomain);
  });

  it('returns lower similarity for different complexity', () => {
    const a = makeFeatures({ complexity: 0.1 });
    const b = makeFeatures({ complexity: 0.9 });
    const sim = calculateSimilarity(a, b);
    expect(sim).toBeLessThan(1);
  });

  it('accounts for boolean feature matching', () => {
    const a = makeFeatures({ requiresCode: true, requiresReasoning: true });
    const b = makeFeatures({ requiresCode: false, requiresReasoning: false });
    const c = makeFeatures({ requiresCode: true, requiresReasoning: true });
    expect(calculateSimilarity(a, c)).toBeGreaterThan(calculateSimilarity(a, b));
  });

  it('accounts for token count difference', () => {
    const a = makeFeatures({ tokenCount: 100 });
    const b = makeFeatures({ tokenCount: 900 });
    const c = makeFeatures({ tokenCount: 150 });
    expect(calculateSimilarity(a, c)).toBeGreaterThan(calculateSimilarity(a, b));
  });

  it('returns value between 0 and 1', () => {
    const a = makeFeatures({ tokenCount: 0, complexity: 0, domain: 'a' });
    const b = makeFeatures({ tokenCount: 10000, complexity: 1, domain: 'b' });
    const sim = calculateSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// calculateStrength
// ============================================================================

describe('calculateStrength', () => {
  it('returns weighted combination of performance factors', () => {
    const perf: ModelPerformance = {
      avgQuality: 1.0,
      successRate: 1.0,
      avgLatencyMs: 0,
      avgTokens: 0,
      observations: 10,
    };
    // 1.0*0.4 + 1.0*0.3 + 1.0*0.2 + 1.0*0.1 = 1.0
    expect(calculateStrength(perf)).toBeCloseTo(1.0);
  });

  it('penalizes high latency', () => {
    const fast: ModelPerformance = {
      avgQuality: 0.8,
      successRate: 0.8,
      avgLatencyMs: 100,
      avgTokens: 1000,
      observations: 10,
    };
    const slow: ModelPerformance = {
      avgQuality: 0.8,
      successRate: 0.8,
      avgLatencyMs: 9000,
      avgTokens: 1000,
      observations: 10,
    };
    expect(calculateStrength(fast)).toBeGreaterThan(calculateStrength(slow));
  });

  it('penalizes high token usage', () => {
    const efficient: ModelPerformance = {
      avgQuality: 0.8,
      successRate: 0.8,
      avgLatencyMs: 500,
      avgTokens: 500,
      observations: 10,
    };
    const heavy: ModelPerformance = {
      avgQuality: 0.8,
      successRate: 0.8,
      avgLatencyMs: 500,
      avgTokens: 7000,
      observations: 10,
    };
    expect(calculateStrength(efficient)).toBeGreaterThan(calculateStrength(heavy));
  });

  it('clamps latency score to 0 for extreme latency', () => {
    const perf: ModelPerformance = {
      avgQuality: 0.8,
      successRate: 0.8,
      avgLatencyMs: 20000, // > 10000ms cap
      avgTokens: 1000,
      observations: 10,
    };
    // latencyScore = max(0, 1 - 20000/10000) = 0
    const strength = calculateStrength(perf);
    expect(strength).toBeGreaterThan(0); // quality and success still contribute
  });

  it('returns value between 0 and 1', () => {
    const perf: ModelPerformance = {
      avgQuality: 0.5,
      successRate: 0.5,
      avgLatencyMs: 5000,
      avgTokens: 4000,
      observations: 10,
    };
    const strength = calculateStrength(perf);
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// cleanupOldRecords
// ============================================================================

describe('cleanupOldRecords', () => {
  it('removes records before cutoff', () => {
    const records = [
      { ts: '2025-01-01T00:00:00Z', value: 1 },
      { ts: '2025-01-02T00:00:00Z', value: 2 },
      { ts: '2025-06-01T00:00:00Z', value: 3 },
    ];
    cleanupOldRecords(records, '2025-01-03T00:00:00Z', (r) => r.ts);
    expect(records).toHaveLength(1);
    expect(records[0]?.value).toBe(3);
  });

  it('does nothing when no records before cutoff', () => {
    const records = [
      { ts: '2025-06-01T00:00:00Z', value: 1 },
      { ts: '2025-07-01T00:00:00Z', value: 2 },
    ];
    cleanupOldRecords(records, '2025-01-01T00:00:00Z', (r) => r.ts);
    expect(records).toHaveLength(2);
  });

  it('removes all records when all are old', () => {
    const records = [
      { ts: '2024-01-01T00:00:00Z', value: 1 },
      { ts: '2024-06-01T00:00:00Z', value: 2 },
    ];
    cleanupOldRecords(records, '2025-01-01T00:00:00Z', (r) => r.ts);
    expect(records).toHaveLength(0);
  });

  it('handles empty array', () => {
    const records: Array<{ ts: string }> = [];
    cleanupOldRecords(records, '2025-01-01T00:00:00Z', (r) => r.ts);
    expect(records).toHaveLength(0);
  });
});
