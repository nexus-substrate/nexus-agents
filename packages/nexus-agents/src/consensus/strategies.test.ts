/**
 * Tests for Consensus Voting Strategies
 * @module consensus/strategies.test
 */

import { describe, it, expect } from 'vitest';
import type { Vote } from './types.js';
import {
  SimpleMajorityStrategy,
  SupermajorityStrategy,
  UnanimousStrategy,
  ProofOfLearningStrategy,
  calculateVoteWeight,
  deriveWeightBasis,
  createStrategyFactory,
} from './strategies.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeVote(decision: 'approve' | 'reject' | 'abstain'): Vote {
  return { decision, confidence: 0.8, reasoning: 'test' };
}

function makeVotes(approve: number, reject: number, abstain: number): Map<string, Vote> {
  const votes = new Map<string, Vote>();
  for (let i = 0; i < approve; i++) {
    votes.set(`agent-a${String(i)}`, makeVote('approve'));
  }
  for (let i = 0; i < reject; i++) {
    votes.set(`agent-r${String(i)}`, makeVote('reject'));
  }
  for (let i = 0; i < abstain; i++) {
    votes.set(`agent-b${String(i)}`, makeVote('abstain'));
  }
  return votes;
}

// ============================================================================
// SimpleMajorityStrategy
// ============================================================================

describe('SimpleMajorityStrategy', () => {
  const strategy = new SimpleMajorityStrategy();

  it('has correct algorithm name', () => {
    expect(strategy.algorithm).toBe('simple_majority');
  });

  it('approves with clear majority (>50%)', () => {
    expect(strategy.calculateOutcome(makeVotes(4, 1, 0)).approved).toBe(true);
    expect(strategy.calculateOutcome(makeVotes(3, 2, 0)).approvalPercentage).toBe(60);
  });

  it('rejects at exactly 50% or below', () => {
    expect(strategy.calculateOutcome(makeVotes(2, 2, 0)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(1, 4, 0)).approved).toBe(false);
  });

  it('excludes abstentions from vote count', () => {
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 5));
    expect(outcome.approved).toBe(true);
    expect(outcome.approvalPercentage).toBe(75);
  });

  it('rejects when no votes cast (all abstentions or empty)', () => {
    expect(strategy.calculateOutcome(makeVotes(0, 0, 5)).approved).toBe(false);
    expect(strategy.calculateOutcome(new Map()).voteCounts.total).toBe(0);
  });

  it('includes correct reason messages', () => {
    expect(strategy.calculateOutcome(makeVotes(4, 1, 0)).reason).toContain('>50%');
    expect(strategy.calculateOutcome(makeVotes(2, 3, 0)).reason).toContain('<=50%');
  });

  it('handles single vote edge cases', () => {
    expect(strategy.calculateOutcome(makeVotes(1, 0, 0)).approvalPercentage).toBe(100);
    expect(strategy.calculateOutcome(makeVotes(0, 1, 0)).approvalPercentage).toBe(0);
  });
});

// ============================================================================
// SupermajorityStrategy
// ============================================================================

describe('SupermajorityStrategy', () => {
  const strategy = new SupermajorityStrategy();

  it('has correct algorithm name', () => {
    expect(strategy.algorithm).toBe('supermajority');
  });

  it('approves with supermajority (>=67%)', () => {
    expect(strategy.calculateOutcome(makeVotes(3, 1, 0)).approved).toBe(true);
    expect(strategy.calculateOutcome(makeVotes(67, 33, 0)).approved).toBe(true);
  });

  it('rejects below supermajority threshold', () => {
    expect(strategy.calculateOutcome(makeVotes(2, 1, 0)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(3, 2, 0)).approved).toBe(false);
  });

  it('handles edge cases and abstentions', () => {
    expect(strategy.calculateOutcome(makeVotes(0, 0, 3)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(1, 0, 0)).approvalPercentage).toBe(100);
  });

  it('includes correct reason messages', () => {
    expect(strategy.calculateOutcome(makeVotes(3, 1, 0)).reason).toContain('>=67%');
    expect(strategy.calculateOutcome(makeVotes(2, 1, 0)).reason).toContain('<67%');
  });
});

// ============================================================================
// UnanimousStrategy
// ============================================================================

describe('UnanimousStrategy', () => {
  const strategy = new UnanimousStrategy();

  it('has correct algorithm name', () => {
    expect(strategy.algorithm).toBe('unanimous');
  });

  it('approves when all approve or approve+abstain', () => {
    const outcome1 = strategy.calculateOutcome(makeVotes(5, 0, 0));
    expect(outcome1.approved).toBe(true);
    expect(outcome1.reason).toContain('Unanimously approved');

    const outcome2 = strategy.calculateOutcome(makeVotes(3, 0, 2));
    expect(outcome2.approved).toBe(true);
    expect(outcome2.approvalPercentage).toBe(60);
  });

  it('rejects with any rejection or no approvals', () => {
    expect(strategy.calculateOutcome(makeVotes(4, 1, 0)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(0, 0, 5)).approved).toBe(false);
    expect(strategy.calculateOutcome(new Map()).approved).toBe(false);
  });

  it('calculates approval percentage correctly', () => {
    expect(strategy.calculateOutcome(makeVotes(4, 1, 0)).approvalPercentage).toBe(80);
    expect(strategy.calculateOutcome(makeVotes(2, 0, 3)).approvalPercentage).toBe(40);
  });

  it('handles single vote edge cases', () => {
    expect(strategy.calculateOutcome(makeVotes(1, 0, 0)).approved).toBe(true);
    expect(strategy.calculateOutcome(makeVotes(0, 1, 0)).approved).toBe(false);
  });
});

// ============================================================================
// ProofOfLearningStrategy
// ============================================================================

describe('ProofOfLearningStrategy', () => {
  const strategy = new ProofOfLearningStrategy();

  it('has correct algorithm name', () => {
    expect(strategy.algorithm).toBe('proof_of_learning');
  });

  it('uses equal weights when no weights provided', () => {
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 0));
    expect(outcome.approved).toBe(true);
    expect(outcome.weightedCounts).toBeDefined();
  });

  it('applies custom weights correctly', () => {
    const votes = makeVotes(1, 2, 0);
    const weights = new Map([
      ['agent-a0', 10.0],
      ['agent-r0', 1.0],
      ['agent-r1', 1.0],
    ]);
    expect(strategy.calculateOutcome(votes, weights).approved).toBe(true);

    const votes2 = makeVotes(2, 1, 0);
    const weights2 = new Map([
      ['agent-a0', 1.0],
      ['agent-a1', 1.0],
      ['agent-r0', 10.0],
    ]);
    expect(strategy.calculateOutcome(votes2, weights2).approved).toBe(false);
  });

  it('defaults to weight 1.0 for missing agents', () => {
    const votes = makeVotes(2, 1, 0);
    const weights = new Map([['agent-a0', 2.0]]);
    const outcome = strategy.calculateOutcome(votes, weights);
    expect(outcome.approved).toBe(true);
  });

  it('handles fractional and zero weights', () => {
    const votes = makeVotes(2, 1, 0);
    const weights1 = new Map([
      ['agent-a0', 0.3],
      ['agent-a1', 0.2],
      ['agent-r0', 0.6],
    ]);
    expect(strategy.calculateOutcome(votes, weights1).approved).toBe(false);

    const weights2 = new Map([
      ['agent-a0', 0],
      ['agent-a1', 5.0],
      ['agent-r0', 0],
    ]);
    expect(strategy.calculateOutcome(votes, weights2).approved).toBe(true);
  });

  it('handles 50% weighted boundary (needs >50%)', () => {
    const votes = makeVotes(1, 1, 0);
    const weights = new Map([
      ['agent-a0', 2.0],
      ['agent-r0', 2.0],
    ]);
    expect(strategy.calculateOutcome(votes, weights).approved).toBe(false);
  });

  it('includes detailed weighted counts in outcome', () => {
    const votes = makeVotes(2, 1, 1);
    const weights = new Map([
      ['agent-a0', 1.5],
      ['agent-a1', 2.5],
      ['agent-r0', 1.0],
      ['agent-b0', 0.5],
    ]);
    const outcome = strategy.calculateOutcome(votes, weights);
    expect(outcome.weightedCounts?.approve).toBe(4.0);
    expect(outcome.weightedCounts?.reject).toBe(1.0);
    expect(outcome.weightedCounts?.abstain).toBe(0.5);
    expect(outcome.weightedCounts?.totalWeight).toBe(5.5);
  });

  it('handles all abstentions and empty weights', () => {
    expect(strategy.calculateOutcome(makeVotes(0, 0, 3)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(3, 1, 0), new Map()).approved).toBe(true);
  });

  it('does NOT claim weighted approval when nothing was weighted', () => {
    // This test previously asserted the reason CONTAINED 'weighted approval'
    // for this exact call, which supplies no weights — it pinned the #5117
    // misreport as intended behaviour. Anyone fixing the defect without reading
    // this first would have seen the failure and taken it for their own
    // regression.
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 0));
    expect(outcome.weightBasis).toBe('unweighted');
    expect(outcome.reason).toContain('UNWEIGHTED');
    expect(outcome.reason).not.toMatch(/\bweighted approval\b/);
  });

  it('reports performance basis when every voter has a recorded weight', () => {
    // The seam that matters: the field must FLIP. A discriminator that only
    // ever returns 'unweighted' is indistinguishable from a hardcoded string.
    const votes = makeVotes(3, 1, 0);
    const weights = new Map([...votes.keys()].map((id) => [id, 0.9]));
    const outcome = strategy.calculateOutcome(votes, weights);
    expect(outcome.weightBasis).toBe('performance');
    expect(outcome.reason).toContain('weighted approval');
  });

  it('reports partial basis when only some voters have a recorded weight', () => {
    // Partial coverage is its own state. Reporting it as fully
    // performance-weighted would launder an unmeasured majority.
    const votes = makeVotes(3, 1, 0);
    const firstId = [...votes.keys()][0];
    const weights = new Map(firstId !== undefined ? [[firstId, 0.9]] : []);
    const outcome = strategy.calculateOutcome(votes, weights);
    expect(outcome.weightBasis).toBe('partial');
    expect(outcome.reason).toContain('partly weighted');
  });
});

describe('deriveWeightBasis (#5117)', () => {
  const vote = { decision: 'approve' as const, confidence: 1, reasoning: 'probe', timestamp: 'x' };

  it('names the empty case: no votes is unweighted, not performance', () => {
    // A basis asserted over an empty set would be the vacuous-verdict shape —
    // claiming a measurement of nothing.
    expect(deriveWeightBasis(new Map(), new Map())).toBe('unweighted');
  });

  it('does not infer the basis from the weight VALUE', () => {
    // The condition the design panel attached. A voter with a perfect record
    // legitimately weighs exactly 1.0, so "does any weight differ from 1.0"
    // cannot tell a measured-and-reliable voter from an unmeasured one. Here
    // every recorded weight IS 1.0 and the basis must still be 'performance',
    // because a record exists for each voter.
    const votes = new Map([
      ['a', vote],
      ['b', vote],
    ]);
    const weights = new Map([
      ['a', 1.0],
      ['b', 1.0],
    ]);
    expect(deriveWeightBasis(votes, weights)).toBe('performance');
  });

  it('ignores weights for agents who did not vote', () => {
    // Coverage is measured over the voters, not over the map. A stale weight
    // for an absent agent must not make a partial tally look complete.
    const votes = new Map([
      ['a', vote],
      ['b', vote],
    ]);
    const weights = new Map([
      ['a', 0.8],
      ['ghost', 0.9],
    ]);
    expect(deriveWeightBasis(votes, weights)).toBe('partial');
  });
});

// ============================================================================
// calculateVoteWeight
// ============================================================================

describe('calculateVoteWeight', () => {
  it('returns 1.0 for undefined or zero totalVotes', () => {
    expect(calculateVoteWeight(undefined)).toBe(1.0);
    expect(calculateVoteWeight({ totalVotes: 0, successRate: 0 } as never)).toBe(1.0);
  });

  it('calculates weight as 0.5 + successRate * 0.5', () => {
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 1.0 } as never)).toBe(1.0);
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 0 } as never)).toBe(0.5);
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 0.5 } as never)).toBe(0.75);
  });

  it('handles various success rates', () => {
    const testCases = [
      { rate: 0, expected: 0.5 },
      { rate: 0.1, expected: 0.55 },
      { rate: 0.75, expected: 0.875 },
      { rate: 1.0, expected: 1.0 },
    ];

    testCases.forEach(({ rate, expected }) => {
      const weight = calculateVoteWeight({
        agentId: 'test',
        totalVotes: 100,
        correctVotes: Math.round(rate * 100),
        successRate: rate,
        lastUpdated: '2025-01-01T00:00:00Z',
      });
      expect(weight).toBe(expected);
    });
  });

  it('ensures weight stays in range [0.5, 1.0]', () => {
    for (let rate = 0; rate <= 1; rate += 0.1) {
      const weight = calculateVoteWeight({
        agentId: 'test',
        totalVotes: 10,
        correctVotes: Math.round(rate * 10),
        successRate: rate,
        lastUpdated: '2025-01-01T00:00:00Z',
      });
      expect(weight).toBeGreaterThanOrEqual(0.5);
      expect(weight).toBeLessThanOrEqual(1.0);
    }
  });
});

// ============================================================================
// VotingStrategyFactory
// ============================================================================

describe('VotingStrategyFactory', () => {
  it('creates with all default strategies including opinion_wise', () => {
    const factory = createStrategyFactory();
    const algorithms = factory.getAvailableAlgorithms();
    expect(algorithms).toContain('simple_majority');
    expect(algorithms).toContain('supermajority');
    expect(algorithms).toContain('unanimous');
    expect(algorithms).toContain('proof_of_learning');
    expect(algorithms).toContain('opinion_wise');
  });

  it('returns correct strategy instances', () => {
    const factory = createStrategyFactory();
    expect(factory.getStrategy('simple_majority').algorithm).toBe('simple_majority');
    expect(factory.getStrategy('supermajority').algorithm).toBe('supermajority');
    expect(factory.getStrategy('unanimous').algorithm).toBe('unanimous');
    expect(factory.getStrategy('proof_of_learning').algorithm).toBe('proof_of_learning');
    expect(factory.getStrategy('opinion_wise').algorithm).toBe('opinion_wise');
  });

  it('throws for unknown algorithm', () => {
    const factory = createStrategyFactory();
    expect(() => factory.getStrategy('invalid' as never)).toThrow('Unknown voting algorithm');
  });

  it('allows registering and overwriting strategies', () => {
    const factory = createStrategyFactory();
    const custom = {
      algorithm: 'custom' as never,
      calculateOutcome: () => ({
        approved: true,
        approvalPercentage: 100,
        voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
        reason: 'Custom',
      }),
    };
    factory.registerStrategy(custom);
    expect(factory.getAvailableAlgorithms()).toContain('custom');

    const override = {
      algorithm: 'simple_majority' as never,
      calculateOutcome: () => ({
        approved: false,
        approvalPercentage: 0,
        voteCounts: { approve: 0, reject: 0, abstain: 0, total: 0 },
        reason: 'Overridden',
      }),
    };
    factory.registerStrategy(override);
    expect(factory.getStrategy('simple_majority').calculateOutcome(makeVotes(5, 0, 0)).reason).toBe(
      'Overridden'
    );
  });
});
