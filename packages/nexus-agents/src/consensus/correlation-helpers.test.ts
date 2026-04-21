/**
 * Tests for Correlation Helpers
 * @module consensus/correlation-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type {
  CorrelationMatrix,
  VotingObservation,
  HigherOrderVotingConfig,
  AgentPairKey,
} from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';
import type { MutablePairwiseHistory } from './correlation-helpers.js';
import {
  isComparable,
  votesAgree,
  didAlignWithOutcome,
  computeCorrelationCoefficient,
  isIndependentFromSubset,
  computeSubsetIndependenceScore,
  computeSubsetObservationCount,
  partitionIntoIndependentGroups,
} from './correlation-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeObs(decision: 'approve' | 'reject' | 'abstain'): VotingObservation {
  return {
    agentId: 'agent-1',
    decision,
    confidence: 0.8,
    timestamp: new Date(),
  } as VotingObservation;
}

function makeHistory(overrides: Partial<MutablePairwiseHistory> = {}): MutablePairwiseHistory {
  return {
    pairKey: 'a:b',
    jointObservations: 10,
    agreements: 7,
    disagreements: 3,
    correlation: 0.4,
    lastUpdated: new Date(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<HigherOrderVotingConfig> = {}): HigherOrderVotingConfig {
  return {
    independenceThreshold: 0.3,
    minObservationsForCorrelation: 5,
    correlationDecayFactor: 0.95,
    enableCorrelationTracking: true,
    enableIndependentSubsets: true,
    ...overrides,
  } as HigherOrderVotingConfig;
}

// ============================================================================
// votesAgree
// ============================================================================

describe('isComparable', () => {
  it('returns true when both are non-abstain', () => {
    expect(isComparable(makeObs('approve'), makeObs('reject'))).toBe(true);
  });

  it('returns false when first abstains', () => {
    expect(isComparable(makeObs('abstain'), makeObs('reject'))).toBe(false);
  });

  it('returns false when second abstains', () => {
    expect(isComparable(makeObs('approve'), makeObs('abstain'))).toBe(false);
  });

  it('returns false when both abstain', () => {
    expect(isComparable(makeObs('abstain'), makeObs('abstain'))).toBe(false);
  });
});

describe('votesAgree', () => {
  it('returns true when both approve', () => {
    expect(votesAgree(makeObs('approve'), makeObs('approve'))).toBe(true);
  });

  it('returns true when both reject', () => {
    expect(votesAgree(makeObs('reject'), makeObs('reject'))).toBe(true);
  });

  it('returns false when one approves and one rejects', () => {
    expect(votesAgree(makeObs('approve'), makeObs('reject'))).toBe(false);
  });

  it('returns null when first abstains (neutral — Issue #763)', () => {
    expect(votesAgree(makeObs('abstain'), makeObs('reject'))).toBeNull();
  });

  it('returns null when second abstains (neutral — Issue #763)', () => {
    expect(votesAgree(makeObs('approve'), makeObs('abstain'))).toBeNull();
  });

  it('returns null when both abstain (neutral — Issue #763)', () => {
    expect(votesAgree(makeObs('abstain'), makeObs('abstain'))).toBeNull();
  });
});

// ============================================================================
// didAlignWithOutcome
// ============================================================================

describe('didAlignWithOutcome', () => {
  it('approve aligns with approved', () => {
    expect(didAlignWithOutcome('approve', 'approved')).toBe(true);
  });

  it('reject aligns with rejected', () => {
    expect(didAlignWithOutcome('reject', 'rejected')).toBe(true);
  });

  it('approve does not align with rejected', () => {
    expect(didAlignWithOutcome('approve', 'rejected')).toBe(false);
  });

  it('reject does not align with approved', () => {
    expect(didAlignWithOutcome('reject', 'approved')).toBe(false);
  });

  it('abstain aligns with any outcome', () => {
    expect(didAlignWithOutcome('abstain', 'approved')).toBe(true);
    expect(didAlignWithOutcome('abstain', 'rejected')).toBe(true);
  });
});

// ============================================================================
// computeCorrelationCoefficient
// ============================================================================

describe('computeCorrelationCoefficient', () => {
  it('returns 0 for no observations', () => {
    expect(computeCorrelationCoefficient(makeHistory({ jointObservations: 0 }))).toBe(0);
  });

  it('returns +1 for perfect agreement', () => {
    const result = computeCorrelationCoefficient(
      makeHistory({ jointObservations: 10, agreements: 10, disagreements: 0 })
    );
    expect(result).toBe(1);
  });

  it('returns -1 for perfect disagreement', () => {
    const result = computeCorrelationCoefficient(
      makeHistory({ jointObservations: 10, agreements: 0, disagreements: 10 })
    );
    expect(result).toBe(-1);
  });

  it('returns positive for more agreements', () => {
    const result = computeCorrelationCoefficient(
      makeHistory({ jointObservations: 10, agreements: 7, disagreements: 3 })
    );
    expect(result).toBeCloseTo(0.4);
  });

  it('returns 0 for equal agreements and disagreements', () => {
    const result = computeCorrelationCoefficient(
      makeHistory({ jointObservations: 10, agreements: 5, disagreements: 5 })
    );
    expect(result).toBe(0);
  });
});

// ============================================================================
// isIndependentFromSubset
// ============================================================================

describe('isIndependentFromSubset', () => {
  it('returns true for empty subset', () => {
    const matrix: CorrelationMatrix = new Map();
    expect(isIndependentFromSubset('x', [], matrix, 0.3)).toBe(true);
  });

  it('returns true when no correlation data', () => {
    const matrix: CorrelationMatrix = new Map();
    expect(isIndependentFromSubset('x', ['a', 'b'], matrix, 0.3)).toBe(true);
  });

  it('returns true when correlation below threshold', () => {
    const matrix: CorrelationMatrix = new Map();
    matrix.set(createAgentPairKey('a', 'x'), 0.2);
    expect(isIndependentFromSubset('x', ['a'], matrix, 0.3)).toBe(true);
  });

  it('returns false when correlation above threshold', () => {
    const matrix: CorrelationMatrix = new Map();
    matrix.set(createAgentPairKey('a', 'x'), 0.5);
    expect(isIndependentFromSubset('x', ['a'], matrix, 0.3)).toBe(false);
  });

  it('returns false when negative correlation exceeds threshold', () => {
    const matrix: CorrelationMatrix = new Map();
    matrix.set(createAgentPairKey('a', 'x'), -0.5);
    expect(isIndependentFromSubset('x', ['a'], matrix, 0.3)).toBe(false);
  });
});

// ============================================================================
// computeSubsetIndependenceScore
// ============================================================================

describe('computeSubsetIndependenceScore', () => {
  it('returns 0 for single agent', () => {
    expect(computeSubsetIndependenceScore(['a'], new Map())).toBe(0);
  });

  it('returns 0 for no correlation data', () => {
    expect(computeSubsetIndependenceScore(['a', 'b'], new Map())).toBe(0);
  });

  it('computes average absolute correlation', () => {
    const matrix: CorrelationMatrix = new Map();
    matrix.set(createAgentPairKey('a', 'b'), 0.4);
    matrix.set(createAgentPairKey('a', 'c'), -0.6);
    matrix.set(createAgentPairKey('b', 'c'), 0.2);
    const score = computeSubsetIndependenceScore(['a', 'b', 'c'], matrix);
    // (0.4 + 0.6 + 0.2) / 3 = 0.4
    expect(score).toBeCloseTo(0.4);
  });
});

// ============================================================================
// computeSubsetObservationCount
// ============================================================================

describe('computeSubsetObservationCount', () => {
  it('returns 0 for single agent', () => {
    expect(computeSubsetObservationCount(['a'], new Map())).toBe(0);
  });

  it('returns 0 when no pairwise history', () => {
    expect(computeSubsetObservationCount(['a', 'b'], new Map())).toBe(0);
  });

  it('returns minimum observations across pairs', () => {
    const history = new Map<AgentPairKey, MutablePairwiseHistory>();
    history.set(createAgentPairKey('a', 'b'), makeHistory({ jointObservations: 20 }));
    history.set(createAgentPairKey('a', 'c'), makeHistory({ jointObservations: 5 }));
    history.set(createAgentPairKey('b', 'c'), makeHistory({ jointObservations: 15 }));
    expect(computeSubsetObservationCount(['a', 'b', 'c'], history)).toBe(5);
  });
});

// ============================================================================
// partitionIntoIndependentGroups
// ============================================================================

describe('partitionIntoIndependentGroups', () => {
  it('returns empty for no agents', () => {
    expect(partitionIntoIndependentGroups([], new Map(), new Map(), makeConfig())).toEqual([]);
  });

  it('puts all independent agents in one group', () => {
    const result = partitionIntoIndependentGroups(
      ['a', 'b', 'c'],
      new Map(),
      new Map(),
      makeConfig()
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.agentIds).toEqual(['a', 'b', 'c']);
  });

  it('separates correlated agents into different groups', () => {
    const matrix: CorrelationMatrix = new Map();
    matrix.set(createAgentPairKey('a', 'b'), 0.8);
    const result = partitionIntoIndependentGroups(
      ['a', 'b', 'c'],
      matrix,
      new Map(),
      makeConfig({ independenceThreshold: 0.3 })
    );
    // 'a' and 'c' are independent, 'b' is correlated with 'a'
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns subset IDs', () => {
    const result = partitionIntoIndependentGroups(['a', 'b'], new Map(), new Map(), makeConfig());
    expect(result[0]!.id).toBe('subset-0');
  });
});
