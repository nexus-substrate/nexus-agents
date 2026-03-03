/**
 * Tests for Higher-Order Voting Helpers
 * @module consensus/higher-order-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Vote } from './types-core.js';
import type { CorrelationMatrix, HigherOrderVotingResult } from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';
import {
  hasSufficientCorrelationData,
  computeEffectiveWeights,
  bayesianAggregate,
  combineSubsetResults,
  countSubsetVotes,
  determineHigherOrderDecision,
  aggregateSimple,
  calculateImprovement,
  buildReasoning,
} from './higher-order-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeVote(decision: 'approve' | 'reject' | 'abstain', confidence = 0.9): Vote {
  return { decision, confidence, reasoning: 'test' };
}

function makeCorrelationMatrix(pairs: Array<[string, string, number]>): CorrelationMatrix {
  const matrix: CorrelationMatrix = new Map();
  for (const [a, b, corr] of pairs) {
    matrix.set(createAgentPairKey(a, b), corr);
  }
  return matrix;
}

// ============================================================================
// hasSufficientCorrelationData
// ============================================================================

describe('hasSufficientCorrelationData', () => {
  it('returns false for less than 2 agents', () => {
    expect(hasSufficientCorrelationData(['a'], new Map())).toBe(false);
  });

  it('returns false when no correlation data', () => {
    expect(hasSufficientCorrelationData(['a', 'b', 'c'], new Map())).toBe(false);
  });

  it('returns true when >= 50% of pairs have data', () => {
    // 3 agents = 3 pairs. Need >= 2 with data.
    const matrix = makeCorrelationMatrix([
      ['a', 'b', 0.5],
      ['a', 'c', 0.3],
    ]);
    expect(hasSufficientCorrelationData(['a', 'b', 'c'], matrix)).toBe(true);
  });

  it('returns false when < 50% of pairs have data', () => {
    // 4 agents = 6 pairs. Need >= 3 with data.
    const matrix = makeCorrelationMatrix([
      ['a', 'b', 0.5],
      ['a', 'c', 0.3],
    ]);
    expect(hasSufficientCorrelationData(['a', 'b', 'c', 'd'], matrix)).toBe(false);
  });

  it('returns true for 2 agents with 1 pair data', () => {
    const matrix = makeCorrelationMatrix([['a', 'b', 0.5]]);
    expect(hasSufficientCorrelationData(['a', 'b'], matrix)).toBe(true);
  });
});

// ============================================================================
// computeEffectiveWeights
// ============================================================================

describe('computeEffectiveWeights', () => {
  it('starts with equal weights', () => {
    const weights = computeEffectiveWeights(['a', 'b'], new Map(), 0.5);
    expect(weights.get('a')).toBe(1.0);
    expect(weights.get('b')).toBe(1.0);
  });

  it('reduces weights for highly correlated agents', () => {
    const matrix = makeCorrelationMatrix([['a', 'b', 0.9]]);
    const weights = computeEffectiveWeights(['a', 'b'], matrix, 0.5);
    expect(weights.get('a')!).toBeLessThan(1.0);
    expect(weights.get('b')!).toBeLessThan(1.0);
  });

  it('does not reduce weights below threshold', () => {
    const matrix = makeCorrelationMatrix([['a', 'b', 0.3]]);
    const weights = computeEffectiveWeights(['a', 'b'], matrix, 0.5);
    expect(weights.get('a')).toBe(1.0);
    expect(weights.get('b')).toBe(1.0);
  });

  it('enforces minimum weight of 0.1', () => {
    const matrix = makeCorrelationMatrix([['a', 'b', 1.0]]);
    const weights = computeEffectiveWeights(['a', 'b'], matrix, 0.0);
    expect(weights.get('a')!).toBeGreaterThanOrEqual(0.1);
    expect(weights.get('b')!).toBeGreaterThanOrEqual(0.1);
  });
});

// ============================================================================
// bayesianAggregate
// ============================================================================

describe('bayesianAggregate', () => {
  it('aggregates approval votes', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('approve', 0.9)],
      ['b', makeVote('approve', 0.8)],
    ]);
    const weights = new Map([
      ['a', 1.0],
      ['b', 1.0],
    ]);
    const result = bayesianAggregate(votes, weights);
    expect(result.posteriorApproval).toBe(1.0);
    expect(result.posteriorRejection).toBe(0);
  });

  it('tracks downweighted agents', () => {
    const votes = new Map<string, Vote>([['a', makeVote('approve', 0.9)]]);
    const weights = new Map([['a', 0.5]]);
    const result = bayesianAggregate(votes, weights);
    expect(result.downweightedAgents).toContain('a');
  });

  it('returns 0.5 for empty votes', () => {
    const result = bayesianAggregate(new Map(), new Map());
    expect(result.posteriorApproval).toBe(0.5);
    expect(result.posteriorRejection).toBe(0.5);
  });

  it('handles mixed votes', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('approve', 1.0)],
      ['b', makeVote('reject', 1.0)],
    ]);
    const weights = new Map([
      ['a', 1.0],
      ['b', 1.0],
    ]);
    const result = bayesianAggregate(votes, weights);
    expect(result.posteriorApproval).toBeCloseTo(0.5);
    expect(result.posteriorRejection).toBeCloseTo(0.5);
  });
});

// ============================================================================
// countSubsetVotes
// ============================================================================

describe('countSubsetVotes', () => {
  it('returns normalized approval/rejection', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('approve', 0.8)],
      ['b', makeVote('reject', 0.2)],
    ]);
    const result = countSubsetVotes(votes);
    expect(result.approval).toBeCloseTo(0.8);
    expect(result.rejection).toBeCloseTo(0.2);
  });

  it('returns 0.5 for all abstains', () => {
    const votes = new Map<string, Vote>([['a', makeVote('abstain', 0.5)]]);
    const result = countSubsetVotes(votes);
    expect(result.approval).toBe(0.5);
    expect(result.rejection).toBe(0.5);
  });
});

// ============================================================================
// combineSubsetResults
// ============================================================================

describe('combineSubsetResults', () => {
  it('combines weighted results', () => {
    const results = [
      { approval: 1.0, rejection: 0, weight: 2 },
      { approval: 0, rejection: 1.0, weight: 1 },
    ];
    const combined = combineSubsetResults(results);
    // (1.0*2 + 0*1) / 3 = 0.667
    expect(combined.posteriorApproval).toBeCloseTo(0.667, 2);
    expect(combined.totalWeight).toBe(3);
  });

  it('returns 0.5 for empty results', () => {
    const combined = combineSubsetResults([]);
    expect(combined.posteriorApproval).toBe(0.5);
    expect(combined.posteriorRejection).toBe(0.5);
  });
});

// ============================================================================
// determineHigherOrderDecision
// ============================================================================

describe('determineHigherOrderDecision', () => {
  it('returns approve when approval > rejection by margin', () => {
    expect(determineHigherOrderDecision(0.8, 0.2)).toBe('approve');
  });

  it('returns reject when rejection > approval by margin', () => {
    expect(determineHigherOrderDecision(0.2, 0.8)).toBe('reject');
  });

  it('returns no_consensus when diff < 0.1', () => {
    expect(determineHigherOrderDecision(0.51, 0.49)).toBe('no_consensus');
  });

  it('returns approve at exact threshold boundary (diff = 0.1)', () => {
    // diff = |0.55 - 0.45| = 0.1, which is NOT < 0.1, so a decision is made
    expect(determineHigherOrderDecision(0.55, 0.45)).toBe('approve');
  });
});

// ============================================================================
// aggregateSimple
// ============================================================================

describe('aggregateSimple', () => {
  it('returns approve for majority approvals', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('approve')],
      ['b', makeVote('approve')],
      ['c', makeVote('reject')],
    ]);
    const result = aggregateSimple(votes, () => 'test');
    expect(result.decision).toBe('approve');
    expect(result.method).toBe('simple');
    expect(result.usedCorrelationData).toBe(false);
  });

  it('returns reject for majority rejections', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('reject')],
      ['b', makeVote('reject')],
      ['c', makeVote('approve')],
    ]);
    const result = aggregateSimple(votes, () => 'test');
    expect(result.decision).toBe('reject');
  });

  it('returns 0.5 for empty votes', () => {
    const result = aggregateSimple(new Map(), () => 'test');
    expect(result.posteriorApproval).toBe(0.5);
  });

  it('excludes abstains from count', () => {
    const votes = new Map<string, Vote>([
      ['a', makeVote('approve')],
      ['b', makeVote('abstain')],
    ]);
    const result = aggregateSimple(votes, () => 'test');
    expect(result.effectiveVoteCount).toBe(1);
    expect(result.posteriorApproval).toBe(1.0);
  });
});

// ============================================================================
// calculateImprovement
// ============================================================================

describe('calculateImprovement', () => {
  it('returns 0 for no_consensus', () => {
    const baseline = { decision: 'approve' as const } as HigherOrderVotingResult;
    expect(calculateImprovement(0.5, 0.5, 'no_consensus', baseline)).toBe(0);
  });

  it('returns 0 when baseline is no_consensus', () => {
    const baseline = { decision: 'no_consensus' as const } as HigherOrderVotingResult;
    expect(calculateImprovement(0.8, 0.2, 'approve', baseline)).toBe(0);
  });

  it('calculates positive improvement', () => {
    const baseline = {
      decision: 'approve' as const,
      posteriorApproval: 0.7,
      posteriorRejection: 0.3,
    } as HigherOrderVotingResult;
    const improvement = calculateImprovement(0.9, 0.1, 'approve', baseline);
    expect(improvement).toBeCloseTo(20); // (0.9 - 0.7) * 100
  });

  it('calculates negative improvement', () => {
    const baseline = {
      decision: 'approve' as const,
      posteriorApproval: 0.9,
      posteriorRejection: 0.1,
    } as HigherOrderVotingResult;
    const improvement = calculateImprovement(0.7, 0.3, 'approve', baseline);
    expect(improvement).toBeCloseTo(-20); // (0.7 - 0.9) * 100
  });
});

// ============================================================================
// buildReasoning
// ============================================================================

describe('buildReasoning', () => {
  it('includes method name for ow', () => {
    const reasoning = buildReasoning('approve', 5, [], 'ow');
    expect(reasoning).toContain('Opinion-Wise Bayesian aggregation');
  });

  it('includes method name for isp', () => {
    const reasoning = buildReasoning('approve', 3, [], 'isp');
    expect(reasoning).toContain('Independent Subset Partition');
  });

  it('includes method name for simple', () => {
    const reasoning = buildReasoning('approve', 3, [], 'simple');
    expect(reasoning).toContain('simple majority voting');
  });

  it('includes downweighted agents count', () => {
    const reasoning = buildReasoning('approve', 5, ['a', 'b'], 'ow');
    expect(reasoning).toContain('2 agent(s) downweighted');
  });

  it('includes no_consensus message', () => {
    const reasoning = buildReasoning('no_consensus', 3, [], 'simple');
    expect(reasoning).toContain('No consensus reached');
  });

  it('includes decision for approve/reject', () => {
    const reasoning = buildReasoning('approve', 5, [], 'ow');
    expect(reasoning).toContain('Final decision: approve');
  });

  it('includes effective votes', () => {
    const reasoning = buildReasoning('approve', 4.5, [], 'ow');
    expect(reasoning).toContain('4.5');
  });
});
