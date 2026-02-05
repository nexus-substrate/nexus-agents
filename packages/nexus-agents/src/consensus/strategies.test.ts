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
  createStrategyFactory,
} from './strategies.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeVote(decision: 'approve' | 'reject' | 'abstain'): Vote {
  return { decision, confidence: 0.8, reasoning: 'test' } as Vote;
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

  it('approves with clear majority', () => {
    const outcome = strategy.calculateOutcome(makeVotes(4, 1, 0));
    expect(outcome.approved).toBe(true);
    expect(outcome.approvalPercentage).toBe(80);
  });

  it('rejects when minority approves', () => {
    const outcome = strategy.calculateOutcome(makeVotes(1, 4, 0));
    expect(outcome.approved).toBe(false);
  });

  it('rejects at exactly 50% (needs >50%)', () => {
    const outcome = strategy.calculateOutcome(makeVotes(2, 2, 0));
    expect(outcome.approved).toBe(false);
  });

  it('excludes abstentions from vote count', () => {
    // 3 approve, 1 reject, 5 abstain => 75% approval
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 5));
    expect(outcome.approved).toBe(true);
    expect(outcome.approvalPercentage).toBe(75);
  });

  it('rejects when all votes are abstentions', () => {
    const outcome = strategy.calculateOutcome(makeVotes(0, 0, 5));
    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toContain('No votes cast');
  });

  it('handles empty votes', () => {
    const outcome = strategy.calculateOutcome(new Map());
    expect(outcome.approved).toBe(false);
    expect(outcome.voteCounts.total).toBe(0);
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
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 0));
    // 75% >= 67% => approved
    expect(outcome.approved).toBe(true);
  });

  it('rejects below supermajority', () => {
    // 60% < 67%
    const outcome = strategy.calculateOutcome(makeVotes(3, 2, 0));
    expect(outcome.approved).toBe(false);
  });

  it('rejects at 66.7% (needs >=67%)', () => {
    // 2/3 = 66.67% which is < 0.67
    const outcome = strategy.calculateOutcome(makeVotes(2, 1, 0));
    expect(outcome.approved).toBe(false);
  });

  it('approves at 75%', () => {
    // 3/4 = 75% which is >= 67%
    const outcome = strategy.calculateOutcome(makeVotes(3, 1, 0));
    expect(outcome.approved).toBe(true);
  });

  it('handles all abstentions', () => {
    const outcome = strategy.calculateOutcome(makeVotes(0, 0, 3));
    expect(outcome.approved).toBe(false);
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

  it('approves when all approve', () => {
    const outcome = strategy.calculateOutcome(makeVotes(5, 0, 0));
    expect(outcome.approved).toBe(true);
    expect(outcome.reason).toContain('Unanimously approved');
  });

  it('rejects with any rejection', () => {
    const outcome = strategy.calculateOutcome(makeVotes(4, 1, 0));
    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toContain('rejection');
  });

  it('approves with approvals and abstentions (no rejections)', () => {
    const outcome = strategy.calculateOutcome(makeVotes(3, 0, 2));
    expect(outcome.approved).toBe(true);
  });

  it('rejects when only abstentions (no approvals)', () => {
    const outcome = strategy.calculateOutcome(makeVotes(0, 0, 5));
    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toContain('No approvals');
  });

  it('rejects empty votes', () => {
    const outcome = strategy.calculateOutcome(new Map());
    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toContain('No votes cast');
  });

  it('reports correct approval percentage', () => {
    const outcome = strategy.calculateOutcome(makeVotes(3, 0, 2));
    expect(outcome.approvalPercentage).toBe(60); // 3/5 = 60%
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

  it('applies custom weights', () => {
    const votes = makeVotes(1, 2, 0);
    // Give the approver a massive weight
    const weights = new Map<string, number>();
    weights.set('agent-a0', 10.0);
    weights.set('agent-r0', 1.0);
    weights.set('agent-r1', 1.0);
    const outcome = strategy.calculateOutcome(votes, weights);
    // 10 / (10+2) = 83.3% > 50% => approved
    expect(outcome.approved).toBe(true);
  });

  it('rejects when weighted rejects dominate', () => {
    const votes = makeVotes(2, 1, 0);
    const weights = new Map<string, number>();
    weights.set('agent-a0', 1.0);
    weights.set('agent-a1', 1.0);
    weights.set('agent-r0', 10.0);
    const outcome = strategy.calculateOutcome(votes, weights);
    // 2 / (2+10) = 16.7% < 50% => rejected
    expect(outcome.approved).toBe(false);
  });

  it('handles all abstentions with weights', () => {
    const votes = makeVotes(0, 0, 3);
    const outcome = strategy.calculateOutcome(votes);
    expect(outcome.approved).toBe(false);
  });
});

// ============================================================================
// calculateVoteWeight
// ============================================================================

describe('calculateVoteWeight', () => {
  it('returns 1.0 for undefined performance', () => {
    expect(calculateVoteWeight(undefined)).toBe(1.0);
  });

  it('returns 1.0 for agent with no votes', () => {
    expect(calculateVoteWeight({ totalVotes: 0, successRate: 0 } as never)).toBe(1.0);
  });

  it('returns 1.0 for perfect success rate', () => {
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 1.0 } as never)).toBe(1.0);
  });

  it('returns 0.5 for zero success rate', () => {
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 0 } as never)).toBe(0.5);
  });

  it('returns 0.75 for 50% success rate', () => {
    expect(calculateVoteWeight({ totalVotes: 10, successRate: 0.5 } as never)).toBe(0.75);
  });
});

// ============================================================================
// VotingStrategyFactory
// ============================================================================

describe('VotingStrategyFactory', () => {
  it('creates with default strategies', () => {
    const factory = createStrategyFactory();
    const algorithms = factory.getAvailableAlgorithms();
    expect(algorithms).toContain('simple_majority');
    expect(algorithms).toContain('supermajority');
    expect(algorithms).toContain('unanimous');
    expect(algorithms).toContain('proof_of_learning');
  });

  it('returns correct strategy by algorithm', () => {
    const factory = createStrategyFactory();
    expect(factory.getStrategy('simple_majority').algorithm).toBe('simple_majority');
    expect(factory.getStrategy('supermajority').algorithm).toBe('supermajority');
    expect(factory.getStrategy('unanimous').algorithm).toBe('unanimous');
  });

  it('throws for unknown algorithm', () => {
    const factory = createStrategyFactory();
    expect(() => factory.getStrategy('invalid' as never)).toThrow('Unknown voting algorithm');
  });

  it('allows registering custom strategy', () => {
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
  });
});
