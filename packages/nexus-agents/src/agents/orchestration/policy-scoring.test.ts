/**
 * Tests for policy-scoring.ts
 *
 * Covers capability, recency, pattern match, cost efficiency,
 * progress adjustment, and combined agent scoring.
 */

import { describe, it, expect } from 'vitest';
import type { ScoringFeatures } from './policy-feature-extraction.js';
import {
  computeCapabilityScore,
  computeRecencyScore,
  computePatternMatchScore,
  computeCostEfficiencyScore,
  computeProgressAdjustment,
  computeAgentScore,
  computeAllAgentScores,
} from './policy-scoring.js';

// ============================================================================
// Helpers
// ============================================================================

function makeFeatures(overrides: Partial<ScoringFeatures> = {}): ScoringFeatures {
  return {
    stepCount: 3,
    recentAgents: [],
    progress: 0.5,
    isStuck: false,
    taskKeywords: [],
    ...overrides,
  };
}

// ============================================================================
// computeCapabilityScore
// ============================================================================

describe('computeCapabilityScore', () => {
  it('returns 0.5 for unknown agent with no matching keywords', () => {
    const score = computeCapabilityScore('unknown-agent', makeFeatures());
    expect(score).toBe(0.5);
  });

  it('returns 0.5 when no task keywords provided', () => {
    const score = computeCapabilityScore('puppet-executor', makeFeatures());
    expect(score).toBe(0.5);
  });

  it('scores higher for matching keywords', () => {
    const features = makeFeatures({ taskKeywords: ['execute', 'build'] });
    const score = computeCapabilityScore('puppet-executor', features);
    expect(score).toBeGreaterThan(0.5);
  });

  it('caps score at 1.0', () => {
    const features = makeFeatures({
      taskKeywords: ['execute', 'run', 'implement', 'build', 'create', 'code'],
    });
    const score = computeCapabilityScore('puppet-executor', features);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('returns 0.5 for known agent with no matching keywords', () => {
    const features = makeFeatures({ taskKeywords: ['irrelevant'] });
    const score = computeCapabilityScore('puppet-executor', features);
    expect(score).toBe(0.5);
  });
});

// ============================================================================
// computeRecencyScore
// ============================================================================

describe('computeRecencyScore', () => {
  it('returns 1.0 when agent not recently used', () => {
    const features = makeFeatures({ recentAgents: ['other-agent'] });
    const score = computeRecencyScore('puppet-executor', features, 0.5);
    expect(score).toBe(1.0);
  });

  it('penalizes recently used agents', () => {
    const features = makeFeatures({ recentAgents: ['puppet-executor'] });
    const score = computeRecencyScore('puppet-executor', features, 0.5);
    expect(score).toBeLessThan(1.0);
  });

  it('penalizes more when agent was most recently used', () => {
    const features = makeFeatures({ recentAgents: ['a', 'b', 'puppet-executor'] });
    const scoreLast = computeRecencyScore('puppet-executor', features, 0.5);

    const features2 = makeFeatures({ recentAgents: ['puppet-executor', 'a', 'b'] });
    const scoreFirst = computeRecencyScore('puppet-executor', features2, 0.5);

    // Agent at end (most recent) should get lower score
    expect(scoreLast).toBeLessThan(scoreFirst);
  });

  it('uses repetition penalty parameter', () => {
    const features = makeFeatures({ recentAgents: ['puppet-executor'] });
    const lowPenalty = computeRecencyScore('puppet-executor', features, 0.1);
    const highPenalty = computeRecencyScore('puppet-executor', features, 0.9);
    expect(lowPenalty).toBeGreaterThan(highPenalty);
  });
});

// ============================================================================
// computePatternMatchScore
// ============================================================================

describe('computePatternMatchScore', () => {
  it('returns 1.0 for decomposer when no last pattern', () => {
    const features = makeFeatures();
    const score = computePatternMatchScore('puppet-decomposer', features);
    expect(score).toBe(1.0);
  });

  it('returns 0.5 for non-decomposer when no last pattern', () => {
    const features = makeFeatures();
    const score = computePatternMatchScore('puppet-executor', features);
    expect(score).toBe(0.5);
  });

  it('scores 1.0 for preferred transition', () => {
    const features = makeFeatures({ lastPattern: 'decomposition' });
    const score = computePatternMatchScore('puppet-executor', features);
    expect(score).toBe(1.0);
  });

  it('scores 0.3 for non-preferred transition', () => {
    const features = makeFeatures({ lastPattern: 'decomposition' });
    const score = computePatternMatchScore('puppet-decomposer', features);
    expect(score).toBe(0.3);
  });

  it('handles empty string last pattern same as undefined', () => {
    const features = makeFeatures({ lastPattern: '' });
    const score = computePatternMatchScore('puppet-decomposer', features);
    expect(score).toBe(1.0);
  });

  it('handles unknown last pattern gracefully', () => {
    const features = makeFeatures({ lastPattern: 'nonexistent' });
    const score = computePatternMatchScore('puppet-executor', features);
    expect(score).toBe(0.3);
  });
});

// ============================================================================
// computeCostEfficiencyScore
// ============================================================================

describe('computeCostEfficiencyScore', () => {
  it('returns higher score for cheaper agents', () => {
    const terminatorScore = computeCostEfficiencyScore('puppet-terminator'); // cost 0.1
    const executorScore = computeCostEfficiencyScore('puppet-executor'); // cost 0.5
    expect(terminatorScore).toBeGreaterThan(executorScore);
  });

  it('returns 0.5 for unknown agent', () => {
    const score = computeCostEfficiencyScore('unknown-agent');
    expect(score).toBe(0.5);
  });

  it('score is 1 - cost', () => {
    const score = computeCostEfficiencyScore('puppet-terminator');
    expect(score).toBeCloseTo(0.9); // 1 - 0.1
  });
});

// ============================================================================
// computeProgressAdjustment
// ============================================================================

describe('computeProgressAdjustment', () => {
  it('favors terminator near completion', () => {
    const features = makeFeatures({ progress: 0.9 });
    const score = computeProgressAdjustment('puppet-terminator', features);
    expect(score).toBe(0.5);
  });

  it('favors critic near completion', () => {
    const features = makeFeatures({ progress: 0.85 });
    const score = computeProgressAdjustment('puppet-critic', features);
    expect(score).toBe(0.3);
  });

  it('penalizes other agents near completion', () => {
    const features = makeFeatures({ progress: 0.9 });
    const score = computeProgressAdjustment('puppet-executor', features);
    expect(score).toBe(-0.1);
  });

  it('favors decomposer early on', () => {
    const features = makeFeatures({ progress: 0.1 });
    const score = computeProgressAdjustment('puppet-decomposer', features);
    expect(score).toBe(0.3);
  });

  it('returns 0 for non-decomposer early on', () => {
    const features = makeFeatures({ progress: 0.1 });
    const score = computeProgressAdjustment('puppet-executor', features);
    expect(score).toBe(0);
  });

  it('favors reflector when stuck', () => {
    const features = makeFeatures({ progress: 0.5, isStuck: true });
    const score = computeProgressAdjustment('puppet-reflector', features);
    expect(score).toBe(0.5);
  });

  it('penalizes non-reflector when stuck', () => {
    const features = makeFeatures({ progress: 0.5, isStuck: true });
    const score = computeProgressAdjustment('puppet-executor', features);
    expect(score).toBe(-0.2);
  });

  it('returns 0 for mid-progress normal state', () => {
    const features = makeFeatures({ progress: 0.5, isStuck: false });
    const score = computeProgressAdjustment('puppet-executor', features);
    expect(score).toBe(0);
  });
});

// ============================================================================
// computeAgentScore
// ============================================================================

describe('computeAgentScore', () => {
  it('returns all score components', () => {
    const features = makeFeatures();
    const weights = {
      capability_match: 0.4,
      recency: 0.3,
      pattern_match: 0.1,
      cost_efficiency: 0.2,
    };
    const scores = computeAgentScore('puppet-executor', features, weights, 0, 0.5);

    expect(scores).toHaveProperty('capability');
    expect(scores).toHaveProperty('recency');
    expect(scores).toHaveProperty('patternMatch');
    expect(scores).toHaveProperty('costEfficiency');
    expect(scores).toHaveProperty('progressAdjust');
    expect(scores).toHaveProperty('total');
  });

  it('applies bias to total score', () => {
    const features = makeFeatures();
    const weights = {};
    const scoreNoBias = computeAgentScore('puppet-executor', features, weights, 0, 0.5);
    const scoreWithBias = computeAgentScore('puppet-executor', features, weights, 0.5, 0.5);

    expect(scoreWithBias.total).toBeCloseTo(scoreNoBias.total + 0.5);
  });

  it('uses default weights when keys missing', () => {
    const features = makeFeatures();
    const scores = computeAgentScore('puppet-executor', features, {}, 0, 0.5);
    expect(scores.total).toBeGreaterThan(0);
  });
});

// ============================================================================
// computeAllAgentScores
// ============================================================================

describe('computeAllAgentScores', () => {
  it('computes scores for all agents', () => {
    const agents = ['puppet-executor', 'puppet-critic', 'puppet-terminator'];
    const features = makeFeatures();
    const weights = { capability_match: 0.4, recency: 0.3 };
    const biases = { 'puppet-executor': 0.1 };

    const scores = computeAllAgentScores(agents, features, weights, biases, 0.5);
    expect(scores.size).toBe(3);
    expect(scores.has('puppet-executor')).toBe(true);
    expect(scores.has('puppet-critic')).toBe(true);
    expect(scores.has('puppet-terminator')).toBe(true);
  });

  it('applies per-agent biases', () => {
    const agents = ['puppet-executor', 'puppet-critic'];
    const features = makeFeatures();
    const biases = { 'puppet-executor': 1.0 };

    const scores = computeAllAgentScores(agents, features, {}, biases, 0.5);
    const executorTotal = scores.get('puppet-executor')?.total ?? 0;
    const criticTotal = scores.get('puppet-critic')?.total ?? 0;
    expect(executorTotal).toBeGreaterThan(criticTotal);
  });

  it('handles empty agents array', () => {
    const scores = computeAllAgentScores([], makeFeatures(), {}, {}, 0.5);
    expect(scores.size).toBe(0);
  });
});
