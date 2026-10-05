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

  it('approves with at least a 2/3 supermajority', () => {
    expect(strategy.calculateOutcome(makeVotes(3, 1, 0)).approved).toBe(true);
    expect(strategy.calculateOutcome(makeVotes(67, 33, 0)).approved).toBe(true);
  });

  it.each([
    { approve: 2, reject: 1, approved: true },
    { approve: 4, reject: 2, approved: true },
    { approve: 1, reject: 2, approved: false },
    { approve: 4, reject: 3, approved: false },
    { approve: 5, reject: 2, approved: true },
  ])(
    'returns $approved with $approve approvals and $reject rejections',
    ({ approve, reject, approved }) => {
      expect(strategy.calculateOutcome(makeVotes(approve, reject, 0)).approved).toBe(approved);
    }
  );

  it('rejects below supermajority threshold', () => {
    expect(strategy.calculateOutcome(makeVotes(1, 2, 0)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(3, 2, 0)).approved).toBe(false);
  });

  it('handles edge cases and abstentions', () => {
    expect(strategy.calculateOutcome(makeVotes(0, 0, 3)).approved).toBe(false);
    expect(strategy.calculateOutcome(makeVotes(1, 0, 0)).approvalPercentage).toBe(100);
  });

  it('includes correct reason messages', () => {
    expect(strategy.calculateOutcome(makeVotes(3, 1, 0)).reason).toContain('>=66.7%');
    expect(strategy.calculateOutcome(makeVotes(1, 1, 0)).reason).toContain('<66.7%');
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
// VotingStrategyFactory
// ============================================================================

describe('VotingStrategyFactory', () => {
  it('creates with all default strategies including opinion_wise', () => {
    const factory = createStrategyFactory();
    const algorithms = factory.getAvailableAlgorithms();
    expect(algorithms).toContain('simple_majority');
    expect(algorithms).toContain('supermajority');
    expect(algorithms).toContain('unanimous');
    expect(algorithms).toContain('opinion_wise');
  });

  it('returns correct strategy instances', () => {
    const factory = createStrategyFactory();
    expect(factory.getStrategy('simple_majority').algorithm).toBe('simple_majority');
    expect(factory.getStrategy('supermajority').algorithm).toBe('supermajority');
    expect(factory.getStrategy('unanimous').algorithm).toBe('unanimous');
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
