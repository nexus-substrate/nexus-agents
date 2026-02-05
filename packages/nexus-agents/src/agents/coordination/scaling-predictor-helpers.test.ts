/**
 * Tests for Scaling Predictor Helpers
 * @module agents/coordination/scaling-predictor-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TaskFeatures, ModelCapability, ScalingPrinciple } from './scaling-types.js';
import {
  selectTopology,
  selectAgentCount,
  estimateSuccessRate,
  calculateConfidence,
  estimateResources,
  getTradeoffs,
  metricsKey,
} from './scaling-predictor-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeFeatures(overrides: Partial<TaskFeatures> = {}): TaskFeatures {
  return {
    taskType: 'parallelizable',
    typeConfidence: 0.8,
    complexity: 0.5,
    parallelizability: 3,
    toolIntensity: 0.3,
    hasSequentialDependencies: false,
    estimatedTokens: 10000,
    signals: [],
    ...overrides,
  };
}

function makeCapability(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    modelId: 'claude-sonnet',
    estimatedAccuracy: 0.7,
    exceedsSaturationThreshold: false,
    relativeCost: 0.5,
    avgLatencyMs: 2000,
    ...overrides,
  };
}

// ============================================================================
// selectTopology
// ============================================================================

describe('selectTopology', () => {
  it('returns single_agent when capability exceeds saturation', () => {
    const features = makeFeatures();
    const capability = makeCapability({ exceedsSaturationThreshold: true });
    expect(selectTopology(features, capability, [])).toBe('single_agent');
  });

  it('returns single_agent for sequential_reasoning', () => {
    const features = makeFeatures({ taskType: 'sequential_reasoning' });
    expect(selectTopology(features, makeCapability(), [])).toBe('single_agent');
  });

  it('returns single_agent for high tool intensity', () => {
    const features = makeFeatures({ toolIntensity: 0.8 });
    expect(selectTopology(features, makeCapability(), [])).toBe('single_agent');
  });

  it('returns centralized for parallelizable tasks', () => {
    const features = makeFeatures({ taskType: 'parallelizable', parallelizability: 3 });
    expect(selectTopology(features, makeCapability(), [])).toBe('centralized');
  });

  it('returns decentralized for web_navigation', () => {
    const features = makeFeatures({ taskType: 'web_navigation' });
    expect(selectTopology(features, makeCapability(), [])).toBe('decentralized');
  });

  it('returns independent for knowledge_retrieval with parallelizability', () => {
    const features = makeFeatures({ taskType: 'knowledge_retrieval', parallelizability: 3 });
    expect(selectTopology(features, makeCapability(), [])).toBe('independent');
  });

  it('returns centralized for code_generation with high parallelizability', () => {
    const features = makeFeatures({ taskType: 'code_generation', parallelizability: 4 });
    expect(selectTopology(features, makeCapability(), [])).toBe('centralized');
  });

  it('returns single_agent for unknown task type with low parallelizability', () => {
    const features = makeFeatures({ taskType: 'unknown', parallelizability: 1 });
    expect(selectTopology(features, makeCapability(), [])).toBe('single_agent');
  });
});

// ============================================================================
// selectAgentCount
// ============================================================================

describe('selectAgentCount', () => {
  it('returns 1 for single_agent', () => {
    expect(selectAgentCount('single_agent', makeFeatures())).toBe(1);
  });

  it('returns 1 + parallelizability capped at 5 for centralized', () => {
    expect(selectAgentCount('centralized', makeFeatures({ parallelizability: 3 }))).toBe(4);
    expect(selectAgentCount('centralized', makeFeatures({ parallelizability: 10 }))).toBe(5);
  });

  it('returns 2-3 for decentralized', () => {
    expect(selectAgentCount('decentralized', makeFeatures({ parallelizability: 1 }))).toBe(2);
    expect(selectAgentCount('decentralized', makeFeatures({ parallelizability: 5 }))).toBe(3);
  });

  it('returns 3-5 for independent', () => {
    expect(selectAgentCount('independent', makeFeatures({ parallelizability: 1 }))).toBe(3);
    expect(selectAgentCount('independent', makeFeatures({ parallelizability: 10 }))).toBe(5);
  });

  it('returns 3-7 for hierarchical based on complexity', () => {
    expect(selectAgentCount('hierarchical', makeFeatures({ complexity: 0.3 }))).toBe(3);
    expect(selectAgentCount('hierarchical', makeFeatures({ complexity: 0.9 }))).toBe(7);
  });
});

// ============================================================================
// estimateSuccessRate
// ============================================================================

describe('estimateSuccessRate', () => {
  it('returns base rate for single_agent', () => {
    expect(
      estimateSuccessRate(
        'single_agent',
        makeFeatures(),
        makeCapability({ estimatedAccuracy: 0.7 })
      )
    ).toBe(0.7);
  });

  it('returns clamped to 0-1', () => {
    expect(
      estimateSuccessRate(
        'single_agent',
        makeFeatures(),
        makeCapability({ estimatedAccuracy: 1.5 })
      )
    ).toBe(1);
  });

  it('applies 0.95 multiplier for hierarchical', () => {
    const result = estimateSuccessRate(
      'hierarchical',
      makeFeatures(),
      makeCapability({ estimatedAccuracy: 0.8 })
    );
    expect(result).toBeCloseTo(0.76); // 0.8 * 0.95
  });

  it('applies task-type performance multiplier for centralized parallelizable', () => {
    // multiplier = 1 + 0.808 = 1.808
    const result = estimateSuccessRate(
      'centralized',
      makeFeatures({ taskType: 'parallelizable' }),
      makeCapability({ estimatedAccuracy: 0.5 })
    );
    expect(result).toBeCloseTo(0.904); // 0.5 * 1.808
  });

  it('degrades independent with sequential dependencies', () => {
    const features = makeFeatures({
      taskType: 'parallelizable',
      hasSequentialDependencies: true,
    });
    const withDeps = estimateSuccessRate(
      'independent',
      features,
      makeCapability({ estimatedAccuracy: 0.5 })
    );
    const noDeps = estimateSuccessRate(
      'independent',
      makeFeatures({ taskType: 'parallelizable' }),
      makeCapability({ estimatedAccuracy: 0.5 })
    );
    expect(withDeps).toBeLessThan(noDeps);
  });
});

// ============================================================================
// calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
  it('returns type confidence as base', () => {
    const confidence = calculateConfidence(makeFeatures({ typeConfidence: 0.8 }), []);
    expect(confidence).toBe(0.8);
  });

  it('increases with high-relevance principles', () => {
    const principles: ScalingPrinciple[] = [
      { name: 'p1', description: 'd', relevance: 'high' },
      { name: 'p2', description: 'd', relevance: 'high' },
    ];
    const confidence = calculateConfidence(makeFeatures({ typeConfidence: 0.8 }), principles);
    expect(confidence).toBeGreaterThan(0.8);
  });

  it('reduces confidence for unknown task type', () => {
    const confidence = calculateConfidence(
      makeFeatures({ taskType: 'unknown', typeConfidence: 0.8 }),
      []
    );
    expect(confidence).toBeLessThan(0.8);
  });

  it('reduces confidence for low type confidence', () => {
    const confidence = calculateConfidence(makeFeatures({ typeConfidence: 0.3 }), []);
    expect(confidence).toBeLessThan(0.3);
  });

  it('clamps to 0-1', () => {
    const principles: ScalingPrinciple[] = Array.from({ length: 10 }, (_, i) => ({
      name: `p${String(i)}`,
      description: 'd',
      relevance: 'high' as const,
    }));
    const confidence = calculateConfidence(makeFeatures({ typeConfidence: 0.9 }), principles);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// estimateResources
// ============================================================================

describe('estimateResources', () => {
  it('has zero overhead for single_agent', () => {
    const result = estimateResources(
      'single_agent',
      1,
      makeFeatures({ estimatedTokens: 1000 }),
      makeCapability({ avgLatencyMs: 2000 })
    );
    expect(result.coordinationOverhead).toBe(0);
    expect(result.estimatedTokens).toBe(1000);
  });

  it('includes overhead for centralized', () => {
    const result = estimateResources(
      'centralized',
      3,
      makeFeatures({ estimatedTokens: 1000 }),
      makeCapability()
    );
    expect(result.coordinationOverhead).toBe(0.15);
    expect(result.estimatedTokens).toBe(Math.ceil(1000 * 3 * 1.15));
  });

  it('estimates cost based on agent count and overhead', () => {
    const result = estimateResources(
      'centralized',
      3,
      makeFeatures(),
      makeCapability({ relativeCost: 0.5 })
    );
    expect(result.estimatedCost).toBeCloseTo(0.5 * 3 * 1.15);
  });
});

// ============================================================================
// getTradeoffs
// ============================================================================

describe('getTradeoffs', () => {
  it('lists single_agent tradeoffs', () => {
    const tradeoffs = getTradeoffs('single_agent', makeFeatures());
    expect(tradeoffs).toContain('No coordination overhead');
    expect(tradeoffs).toContain('Limited parallelization');
  });

  it('warns about parallelizable structure for single_agent', () => {
    const tradeoffs = getTradeoffs('single_agent', makeFeatures({ parallelizability: 5 }));
    expect(tradeoffs.some((t) => t.includes('parallelizable'))).toBe(true);
  });

  it('lists centralized tradeoffs', () => {
    const tradeoffs = getTradeoffs('centralized', makeFeatures());
    expect(tradeoffs.some((t) => t.includes('+80.8%'))).toBe(true);
  });

  it('lists independent tradeoffs', () => {
    const tradeoffs = getTradeoffs('independent', makeFeatures());
    expect(tradeoffs.some((t) => t.includes('error amplification'))).toBe(true);
  });

  it('warns about sequential dependencies for independent', () => {
    const tradeoffs = getTradeoffs(
      'independent',
      makeFeatures({ hasSequentialDependencies: true })
    );
    expect(tradeoffs.some((t) => t.includes('sequential dependencies'))).toBe(true);
  });
});

// ============================================================================
// metricsKey
// ============================================================================

describe('metricsKey', () => {
  it('combines topology and task type', () => {
    expect(metricsKey('centralized', 'parallelizable')).toBe('centralized:parallelizable');
  });
});
