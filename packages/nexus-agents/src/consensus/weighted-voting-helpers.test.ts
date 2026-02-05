/**
 * Tests for Weighted Voting Helpers
 * @module consensus/weighted-voting-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Vote } from './types.js';
import type { MutableAgentRecord } from './weighted-voting-helpers.js';
import {
  isLowConfidenceContrarian,
  computeMajorityDirection,
  determineDecision,
  updateDerivedMetrics,
  toImmutableRecord,
  createVoteSignature,
  groupVotesBySignature,
  computeGlobalStats,
  calculateCalibratedWeight,
  applyOutcomeWeight,
} from './weighted-voting-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    agentId: 'agent-1',
    decision: 'approve',
    confidence: 0.8,
    reasoning: 'test',
    ...overrides,
  } as Vote;
}

function makeRecord(overrides: Partial<MutableAgentRecord> = {}): MutableAgentRecord {
  return {
    agentId: 'agent-1',
    totalTasks: 10,
    successfulTasks: 8,
    failedTasks: 1,
    partialTasks: 1,
    successRate: 0.8,
    weight: 0.8,
    trustScore: 0.8,
    byzantineFlags: 0,
    byzantineReasons: [],
    lastActive: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// isLowConfidenceContrarian
// ============================================================================

describe('isLowConfidenceContrarian', () => {
  it('returns true for low-confidence reject when majority approves', () => {
    expect(isLowConfidenceContrarian(makeVote({ decision: 'reject', confidence: 0.1 }), true)).toBe(
      true
    );
  });

  it('returns false for high-confidence reject', () => {
    expect(isLowConfidenceContrarian(makeVote({ decision: 'reject', confidence: 0.9 }), true)).toBe(
      false
    );
  });

  it('returns true for low-confidence approve when majority rejects', () => {
    expect(
      isLowConfidenceContrarian(makeVote({ decision: 'approve', confidence: 0.2 }), false)
    ).toBe(true);
  });

  it('returns false for aligned vote', () => {
    expect(
      isLowConfidenceContrarian(makeVote({ decision: 'approve', confidence: 0.1 }), true)
    ).toBe(false);
  });
});

// ============================================================================
// computeMajorityDirection
// ============================================================================

describe('computeMajorityDirection', () => {
  it('returns true when approve outweighs reject', () => {
    const votes: Array<readonly [string, Vote]> = [
      ['a', makeVote({ decision: 'approve' })],
      ['b', makeVote({ decision: 'reject' })],
    ];
    const weights = new Map([
      ['a', 0.9],
      ['b', 0.3],
    ]);
    expect(computeMajorityDirection(votes, weights)).toBe(true);
  });

  it('returns false when reject outweighs approve', () => {
    const votes: Array<readonly [string, Vote]> = [
      ['a', makeVote({ decision: 'approve' })],
      ['b', makeVote({ decision: 'reject' })],
    ];
    const weights = new Map([
      ['a', 0.2],
      ['b', 0.9],
    ]);
    expect(computeMajorityDirection(votes, weights)).toBe(false);
  });
});

// ============================================================================
// determineDecision
// ============================================================================

describe('determineDecision', () => {
  it('returns approve when approval exceeds threshold', () => {
    expect(determineDecision(0.7, 0.3, 1.0, true, 0.5)).toBe('approve');
  });

  it('returns reject when rejection exceeds threshold', () => {
    expect(determineDecision(0.3, 0.7, 1.0, true, 0.5)).toBe('reject');
  });

  it('returns no_consensus when quorum not reached', () => {
    expect(determineDecision(0.7, 0.3, 1.0, false, 0.5)).toBe('no_consensus');
  });

  it('returns no_consensus when total is 0', () => {
    expect(determineDecision(0, 0, 0, true, 0.5)).toBe('no_consensus');
  });

  it('returns no_consensus when neither meets threshold', () => {
    expect(determineDecision(0.4, 0.4, 1.0, true, 0.6)).toBe('no_consensus');
  });
});

// ============================================================================
// updateDerivedMetrics
// ============================================================================

describe('updateDerivedMetrics', () => {
  it('updates success rate', () => {
    const record = makeRecord({ totalTasks: 10, successfulTasks: 7, partialTasks: 2 });
    updateDerivedMetrics(record);
    // (7 + 2*0.5) / 10 = 0.8
    expect(record.successRate).toBeCloseTo(0.8);
  });

  it('applies byzantine penalty to trust score', () => {
    const record = makeRecord({ weight: 0.8, byzantineFlags: 2 });
    updateDerivedMetrics(record);
    // 0.8 * 0.7^2 = 0.392
    expect(record.trustScore).toBeCloseTo(0.392);
  });

  it('handles zero tasks', () => {
    const record = makeRecord({ totalTasks: 0 });
    updateDerivedMetrics(record);
    expect(record.successRate).toBe(0.8); // unchanged
  });
});

// ============================================================================
// toImmutableRecord
// ============================================================================

describe('toImmutableRecord', () => {
  it('converts mutable to immutable record', () => {
    const mutable = makeRecord({ agentId: 'a1', totalTasks: 5 });
    const immutable = toImmutableRecord(mutable);
    expect(immutable.agentId).toBe('a1');
    expect(immutable.totalTasks).toBe(5);
  });
});

// ============================================================================
// createVoteSignature
// ============================================================================

describe('createVoteSignature', () => {
  it('creates decision:confidence signature', () => {
    expect(createVoteSignature(makeVote({ decision: 'approve', confidence: 0.85 }))).toBe(
      'approve:0.85'
    );
  });
});

// ============================================================================
// groupVotesBySignature
// ============================================================================

describe('groupVotesBySignature', () => {
  it('groups matching votes', () => {
    const votes: Array<readonly [string, Vote]> = [
      ['a', makeVote({ decision: 'approve', confidence: 0.8 })],
      ['b', makeVote({ decision: 'approve', confidence: 0.8 })],
      ['c', makeVote({ decision: 'reject', confidence: 0.9 })],
    ];
    const groups = groupVotesBySignature(votes);
    expect(groups.get('approve:0.80')).toEqual(['a', 'b']);
    expect(groups.get('reject:0.90')).toEqual(['c']);
  });
});

// ============================================================================
// computeGlobalStats
// ============================================================================

describe('computeGlobalStats', () => {
  it('computes global success rate', () => {
    const records = [
      makeRecord({ totalTasks: 10, successfulTasks: 8 }),
      makeRecord({ totalTasks: 10, successfulTasks: 6 }),
    ];
    const { globalSuccessRate, totalTasks } = computeGlobalStats(records);
    expect(totalTasks).toBe(20);
    expect(globalSuccessRate).toBeCloseTo(0.7);
  });

  it('returns 0.5 for no tasks', () => {
    const { globalSuccessRate } = computeGlobalStats([]);
    expect(globalSuccessRate).toBe(0.5);
  });
});

// ============================================================================
// calculateCalibratedWeight
// ============================================================================

describe('calculateCalibratedWeight', () => {
  it('increases weight for above-average performance', () => {
    const record = makeRecord({ successRate: 0.9, weight: 0.5 });
    const calibrated = calculateCalibratedWeight(record, 0.7, 0.5);
    expect(calibrated).toBeGreaterThan(0.5);
  });

  it('decreases weight for below-average performance', () => {
    const record = makeRecord({ successRate: 0.3, weight: 0.5 });
    const calibrated = calculateCalibratedWeight(record, 0.7, 0.5);
    expect(calibrated).toBeLessThan(0.5);
  });
});

// ============================================================================
// applyOutcomeWeight
// ============================================================================

describe('applyOutcomeWeight', () => {
  it('increases weight on success', () => {
    const result = applyOutcomeWeight(0.5, 'success', 0.8, 1.2);
    expect(result).toBeCloseTo(0.6);
  });

  it('decreases weight on failure', () => {
    const result = applyOutcomeWeight(0.5, 'failure', 0.8, 1.2);
    expect(result).toBeCloseTo(0.4);
  });

  it('partially decreases on partial', () => {
    const result = applyOutcomeWeight(0.5, 'partial', 0.8, 1.2);
    // 0.5 * (0.8 + 1) / 2 = 0.5 * 0.9 = 0.45
    expect(result).toBeCloseTo(0.45);
  });

  it('no change on unknown', () => {
    expect(applyOutcomeWeight(0.5, 'unknown', 0.8, 1.2)).toBe(0.5);
  });

  it('caps at 1 on success', () => {
    expect(applyOutcomeWeight(0.95, 'success', 0.8, 1.2)).toBeLessThanOrEqual(1);
  });

  it('floors at 0 on failure', () => {
    expect(applyOutcomeWeight(0.01, 'failure', 0.8, 1.2)).toBeGreaterThanOrEqual(0);
  });
});
