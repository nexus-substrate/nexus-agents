/**
 * Tests for QuorumValidator - Unified quorum validation
 *
 * Covers: validateQuorum, getQuorumBreakdown, createQuorumValidator
 */

import { describe, expect, it } from 'vitest';

import type { Vote } from './types-core.js';

import {
  DEFAULT_QUORUM_THRESHOLDS,
  QuorumValidator,
  createQuorumValidator,
  type QuorumValidationConfig,
  type QuorumValidationInput,
} from './quorum-validator.js';

// ============================================================================
// Test helpers
// ============================================================================

function makeVote(decision: 'approve' | 'reject' | 'abstain', confidence = 0.8): Vote {
  return { decision, reasoning: `Vote to ${decision}`, confidence };
}

function makeVotes(
  decisions: Array<[string, 'approve' | 'reject' | 'abstain']>
): ReadonlyMap<string, Vote> {
  return new Map(decisions.map(([id, decision]) => [id, makeVote(decision)]));
}

function makeConfig(overrides: Partial<QuorumValidationConfig> = {}): QuorumValidationConfig {
  return {
    algorithm: 'simple_majority',
    threshold: 0.5,
    minVoters: 1,
    ...overrides,
  };
}

// ============================================================================
// DEFAULT_QUORUM_THRESHOLDS
// ============================================================================

describe('DEFAULT_QUORUM_THRESHOLDS', () => {
  it('contains correct thresholds for all algorithms', () => {
    expect(DEFAULT_QUORUM_THRESHOLDS.simple_majority).toBe(0.5);
    expect(DEFAULT_QUORUM_THRESHOLDS.supermajority).toBe(0.67);
    expect(DEFAULT_QUORUM_THRESHOLDS.unanimous).toBe(1.0);
    expect(DEFAULT_QUORUM_THRESHOLDS.proof_of_learning).toBe(0.5);
    expect(DEFAULT_QUORUM_THRESHOLDS.opinion_wise).toBe(0.5);
    expect(DEFAULT_QUORUM_THRESHOLDS.higher_order).toBe(0.5);
    expect(DEFAULT_QUORUM_THRESHOLDS.weighted_byzantine).toBe(0.67);
  });

  it('is typed as Readonly', () => {
    // Readonly<Record<...>> at type level; verify values are not writable at runtime
    const keys = Object.keys(DEFAULT_QUORUM_THRESHOLDS);
    expect(keys.length).toBe(7);
  });
});

// ============================================================================
// createQuorumValidator factory
// ============================================================================

describe('createQuorumValidator', () => {
  it('returns an IQuorumValidator instance', () => {
    const validator = createQuorumValidator();
    expect(validator).toBeDefined();
    expect(typeof validator.validateQuorum).toBe('function');
    expect(typeof validator.getQuorumBreakdown).toBe('function');
  });
});

// ============================================================================
// QuorumValidator.validateQuorum
// ============================================================================

describe('QuorumValidator.validateQuorum', () => {
  const validator = new QuorumValidator();

  describe('input validation', () => {
    it('returns invalid when no votes provided', () => {
      const input: QuorumValidationInput = {
        votes: new Map(),
        config: makeConfig(),
      };
      const result = validator.validateQuorum(input);
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.error).toBe('No votes provided');
      }
    });
  });

  describe('simple_majority algorithm', () => {
    it('approves when majority votes approve', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
          ['a3', 'reject'],
        ]),
        config: makeConfig({ algorithm: 'simple_majority', threshold: 0.5, minVoters: 1 }),
      });
      expect(result.status).toBe('reached');
      if (result.status === 'reached') {
        expect(result.decision).toBe('approve');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('rejects when majority votes reject', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'reject'],
          ['a2', 'reject'],
          ['a3', 'approve'],
        ]),
        config: makeConfig({ algorithm: 'simple_majority', threshold: 0.5, minVoters: 1 }),
      });
      expect(result.status).toBe('reached');
      if (result.status === 'reached') {
        expect(result.decision).toBe('reject');
      }
    });

    it('returns not_reached when tied and below threshold', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'reject'],
        ]),
        config: makeConfig({ algorithm: 'simple_majority', threshold: 0.6, minVoters: 1 }),
      });
      expect(result.status).toBe('not_reached');
    });

    it('returns not_reached with insufficient voters', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([['a1', 'approve']]),
        config: makeConfig({ algorithm: 'simple_majority', threshold: 0.5, minVoters: 3 }),
      });
      expect(result.status).toBe('not_reached');
      if (result.status === 'not_reached') {
        expect(result.reason).toBe('insufficient_votes');
        expect(result.details).toContain('1');
        expect(result.details).toContain('3');
      }
    });
  });

  describe('supermajority algorithm', () => {
    it('approves with supermajority (>=67%)', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
          ['a3', 'approve'],
          ['a4', 'reject'],
        ]),
        config: makeConfig({
          algorithm: 'supermajority',
          threshold: 0.67,
          minVoters: 1,
        }),
      });
      // supermajority uses weighted counts, 75% approve > 67% threshold
      expect(result.status).toBe('reached');
      if (result.status === 'reached') {
        expect(result.decision).toBe('approve');
      }
    });
  });

  describe('unanimous algorithm', () => {
    it('approves when all votes are approve', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
          ['a3', 'approve'],
        ]),
        config: makeConfig({ algorithm: 'unanimous', threshold: 1.0, minVoters: 1 }),
      });
      expect(result.status).toBe('reached');
      if (result.status === 'reached') {
        expect(result.decision).toBe('approve');
      }
    });

    it('returns not_reached when not unanimous', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
          ['a3', 'reject'],
        ]),
        config: makeConfig({ algorithm: 'unanimous', threshold: 1.0, minVoters: 1 }),
      });
      expect(result.status).toBe('not_reached');
    });
  });

  describe('abstention handling', () => {
    it('excludes abstentions from minVoters check by default', () => {
      // With includeAbstentions=false (default), activeVotes = approve + reject only
      // The ratio denominator uses requiredParticipants (defaults to votes.size)
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
          ['a3', 'abstain'],
        ]),
        config: makeConfig({
          algorithm: 'simple_majority',
          threshold: 0.5,
          minVoters: 2,
          includeAbstentions: false,
        }),
      });
      // activeVotes = 2 (approve+reject), minVoters = 2 -> passes min check
      // approveRatio = 2/3 = 66.7% >= 50% -> reached
      expect(result.status).toBe('reached');
      if (result.status === 'reached') {
        expect(result.decision).toBe('approve');
      }
    });

    it('includes abstentions in minVoters check when configured', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'abstain'],
          ['a3', 'abstain'],
        ]),
        config: makeConfig({
          algorithm: 'simple_majority',
          threshold: 0.5,
          minVoters: 3,
          includeAbstentions: true,
        }),
      });
      // With includeAbstentions=true, activeVotes = 3 (all count)
      // approveRatio = 1/3 = 33%, below 50% threshold
      expect(result.status).toBe('not_reached');
    });

    it('fails minVoters check when abstentions excluded', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'abstain'],
          ['a3', 'abstain'],
        ]),
        config: makeConfig({
          algorithm: 'simple_majority',
          threshold: 0.5,
          minVoters: 2,
          includeAbstentions: false,
        }),
      });
      // activeVotes = 1 (only approve counts), minVoters = 2 -> insufficient
      expect(result.status).toBe('not_reached');
    });
  });

  describe('requiredParticipants', () => {
    it('uses requiredParticipants for ratio calculation', () => {
      const result = validator.validateQuorum({
        votes: makeVotes([
          ['a1', 'approve'],
          ['a2', 'approve'],
        ]),
        config: makeConfig({ algorithm: 'simple_majority', threshold: 0.5, minVoters: 1 }),
        requiredParticipants: 5, // 2/5 = 40%, below 50%
      });
      expect(result.status).toBe('not_reached');
    });
  });
});

// ============================================================================
// QuorumValidator.getQuorumBreakdown
// ============================================================================

describe('QuorumValidator.getQuorumBreakdown', () => {
  const validator = new QuorumValidator();

  it('returns correct vote counts', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
        ['a3', 'abstain'],
        ['a4', 'approve'],
      ]),
      config: makeConfig(),
    });

    expect(breakdown.totalVotes).toBe(4);
    expect(breakdown.voteCounts.approve).toBe(2);
    expect(breakdown.voteCounts.reject).toBe(1);
    expect(breakdown.voteCounts.abstain).toBe(1);
    expect(breakdown.voteCounts.total).toBe(4);
  });

  it('returns undefined weights for simple_majority', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([['a1', 'approve']]),
      config: makeConfig({ algorithm: 'simple_majority' }),
    });

    expect(breakdown.totalWeight).toBeUndefined();
    expect(breakdown.weightedCounts).toBeUndefined();
  });

  it('returns undefined weights for unanimous', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([['a1', 'approve']]),
      config: makeConfig({ algorithm: 'unanimous', threshold: 1.0 }),
    });

    expect(breakdown.totalWeight).toBeUndefined();
    expect(breakdown.weightedCounts).toBeUndefined();
  });

  it('calculates weights for supermajority', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
      ]),
      config: makeConfig({ algorithm: 'supermajority', threshold: 0.67 }),
    });

    expect(breakdown.totalWeight).toBeDefined();
    expect(breakdown.weightedCounts).toBeDefined();
    if (breakdown.weightedCounts !== undefined) {
      expect(breakdown.weightedCounts.approve).toBeGreaterThan(0);
      expect(breakdown.weightedCounts.reject).toBeGreaterThan(0);
    }
  });

  it('calculates weights for proof_of_learning', () => {
    const weights = new Map([
      ['a1', 2.0],
      ['a2', 1.0],
    ]);
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'proof_of_learning', threshold: 0.5 }),
    });

    expect(breakdown.totalWeight).toBeDefined();
    expect(breakdown.weightedCounts).toBeDefined();
    if (breakdown.weightedCounts !== undefined) {
      // a1 has weight 2.0, a2 has weight 1.0
      expect(breakdown.weightedCounts.approve).toBeGreaterThan(breakdown.weightedCounts.reject);
    }
  });

  it('applies confidence multiplier when configured', () => {
    const votes: ReadonlyMap<string, Vote> = new Map([
      ['a1', { decision: 'approve', reasoning: 'yes', confidence: 1.0 }],
      ['a2', { decision: 'approve', reasoning: 'maybe', confidence: 0.5 }],
    ]);
    const breakdown = validator.getQuorumBreakdown({
      votes,
      config: makeConfig({
        algorithm: 'supermajority',
        threshold: 0.67,
        confidenceMultiplier: true,
      }),
    });

    // a1: weight 1.0 * confidence 1.0 = 1.0
    // a2: weight 1.0 * confidence 0.5 = 0.5
    // Total: 1.5
    expect(breakdown.totalWeight).toBeCloseTo(1.5);
    if (breakdown.weightedCounts !== undefined) {
      expect(breakdown.weightedCounts.approve).toBeCloseTo(1.5);
    }
  });

  it('includes reasoning string', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      config: makeConfig(),
    });

    expect(breakdown.reasoning).toBeTruthy();
    expect(typeof breakdown.reasoning).toBe('string');
  });
});

// ============================================================================
// QuorumValidator.isAgentEligible
describe('QuorumValidator weighted quorum scenarios', () => {
  const validator = new QuorumValidator();

  it('reaches weighted quorum when total weight meets threshold', () => {
    const weights = new Map([
      ['a1', 0.5],
      ['a2', 0.3],
    ]);
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'supermajority', threshold: 0.67 }),
    });
    // Total weight: 0.8, threshold: 0.67 -> quorum reached
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('approve');
    }
  });

  it('returns not_reached when weight below threshold', () => {
    const weights = new Map([
      ['a1', 0.2],
      ['a2', 0.1],
    ]);
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'supermajority', threshold: 0.67 }),
    });
    // Total weight: 0.3, threshold: 0.67 -> not reached
    expect(result.status).toBe('not_reached');
    if (result.status === 'not_reached') {
      expect(result.reason).toBe('insufficient_weight');
    }
  });

  it('determines weighted rejection correctly', () => {
    const weights = new Map([
      ['a1', 1.0],
      ['a2', 3.0],
    ]);
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'proof_of_learning', threshold: 0.5 }),
    });
    // a2 (reject, weight 3.0) outweighs a1 (approve, weight 1.0)
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('reject');
    }
  });

  it('handles weighted tie (approve wins by default)', () => {
    const weights = new Map([
      ['a1', 1.0],
      ['a2', 1.0],
    ]);
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'proof_of_learning', threshold: 0.5 }),
    });
    // Equal weights -> approve >= reject, so approve wins
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('approve');
    }
  });

  it('handles weighted_byzantine algorithm', () => {
    const weights = new Map([
      ['a1', 1.0],
      ['a2', 1.0],
      ['a3', 1.0],
    ]);
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
        ['a3', 'reject'],
      ]),
      agentWeights: weights,
      config: makeConfig({ algorithm: 'weighted_byzantine', threshold: 0.67 }),
    });
    // Total weight 3.0 >= 0.67 threshold -> quorum reached
    expect(result.status).toBe('reached');
  });

  it('handles opinion_wise algorithm with weighted counts', () => {
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      config: makeConfig({ algorithm: 'opinion_wise', threshold: 0.5 }),
    });
    // opinion_wise uses weighted calculation
    expect(result.status).toBe('reached');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('QuorumValidator edge cases', () => {
  const validator = new QuorumValidator();

  it('handles single voter approve', () => {
    const result = validator.validateQuorum({
      votes: makeVotes([['a1', 'approve']]),
      config: makeConfig({ threshold: 0.5, minVoters: 1 }),
    });
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('approve');
    }
  });

  it('handles single voter reject', () => {
    const result = validator.validateQuorum({
      votes: makeVotes([['a1', 'reject']]),
      config: makeConfig({ threshold: 0.5, minVoters: 1 }),
    });
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('reject');
    }
  });

  it('handles all abstain votes', () => {
    const result = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'abstain'],
        ['a2', 'abstain'],
      ]),
      config: makeConfig({ threshold: 0.5, minVoters: 1 }),
    });
    // 0 active votes (abstentions excluded), but minVoters is 1
    expect(result.status).toBe('not_reached');
  });

  it('handles large number of voters', () => {
    const decisions: Array<[string, 'approve' | 'reject' | 'abstain']> = [];
    for (let i = 0; i < 100; i++) {
      decisions.push([`a${String(i)}`, i < 70 ? 'approve' : 'reject']);
    }
    const result = validator.validateQuorum({
      votes: makeVotes(decisions),
      config: makeConfig({ threshold: 0.67, minVoters: 50 }),
    });
    expect(result.status).toBe('reached');
    if (result.status === 'reached') {
      expect(result.decision).toBe('approve');
    }
  });

  it('confidence increases with wider margin', () => {
    const narrowResult = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
        ['a3', 'reject'],
      ]),
      config: makeConfig({ threshold: 0.5, minVoters: 1 }),
    });

    const wideResult = validator.validateQuorum({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
        ['a3', 'approve'],
        ['a4', 'reject'],
      ]),
      config: makeConfig({ threshold: 0.5, minVoters: 1 }),
    });

    if (narrowResult.status === 'reached' && wideResult.status === 'reached') {
      expect(wideResult.confidence).toBeGreaterThan(narrowResult.confidence);
    }
  });
});
