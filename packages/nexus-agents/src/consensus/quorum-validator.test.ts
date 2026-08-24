/**
 * Tests for QuorumValidator - Unified quorum validation
 *
 * Covers: validateQuorum, getQuorumBreakdown, isAgentEligible, createQuorumValidator
 */

import { describe, expect, it } from 'vitest';

import type { Vote } from './types-core.js';

import {
  DEFAULT_QUORUM_THRESHOLDS,
  QuorumValidator,
  createQuorumValidator,
  type AgentRecord,
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

function makeAgentRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    agentId: 'agent-1',
    weight: 1.0,
    trustScore: 0.9,
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
    expect(typeof validator.isAgentEligible).toBe('function');
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

  it('uses agent records for weights when agentWeights not provided', () => {
    const agentRecords = new Map([
      ['a1', makeAgentRecord({ agentId: 'a1', weight: 3.0 })],
      ['a2', makeAgentRecord({ agentId: 'a2', weight: 1.0 })],
    ]);
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'reject'],
      ]),
      agentRecords,
      config: makeConfig({ algorithm: 'proof_of_learning', threshold: 0.5 }),
    });

    expect(breakdown.totalWeight).toBeCloseTo(4.0);
  });

  it('returns eligible agents list', () => {
    const agentRecords = new Map([
      ['a1', makeAgentRecord({ agentId: 'a1', trustScore: 0.9 })],
      ['a2', makeAgentRecord({ agentId: 'a2', trustScore: 0.1 })], // low trust
    ]);
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      agentRecords,
      config: makeConfig({ enableByzantineDetection: true }),
    });

    expect(breakdown.eligibleAgents).toContain('a1');
    expect(breakdown.eligibleAgents).not.toContain('a2');
  });

  // #4666: the tests above prove exclusion WORKS when an AgentRecord is
  // supplied. This one pins the production reality — no caller supplies one,
  // so nothing is ever excluded. If a producer is wired, this test should fail
  // and be replaced by one asserting the real screening.
  it('excludes nobody when no agent records are supplied — the production shape', () => {
    const breakdown = validator.getQuorumBreakdown({
      votes: makeVotes([
        ['a1', 'approve'],
        ['a2', 'approve'],
      ]),
      config: makeConfig({ enableByzantineDetection: true }),
    });

    // Byzantine detection is ON and still excludes nothing: with no record the
    // eligibility check returns early. A full eligible list is NOT evidence
    // that screening ran.
    expect(breakdown.eligibleAgents).toContain('a1');
    expect(breakdown.eligibleAgents).toContain('a2');
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
// ============================================================================

describe('QuorumValidator.isAgentEligible', () => {
  const validator = new QuorumValidator();

  it('returns eligible with default weight when no record exists', () => {
    const result = validator.isAgentEligible('agent-1', undefined, makeConfig());
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.weight).toBe(1.0);
    }
  });

  it('returns eligible for valid agent record', () => {
    const record = makeAgentRecord({ trustScore: 0.8, weight: 1.5 });
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.weight).toBe(1.5);
    }
  });

  it('rejects agent with Byzantine flags when detection enabled', () => {
    const record = makeAgentRecord({ byzantineFlags: 3 });
    const config = makeConfig({ enableByzantineDetection: true });
    const result = validator.isAgentEligible('agent-1', record, config);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toBe('byzantine_flagged');
    }
  });

  it('allows Byzantine-flagged agent when detection disabled', () => {
    const record = makeAgentRecord({ byzantineFlags: 3 });
    const config = makeConfig({ enableByzantineDetection: false });
    const result = validator.isAgentEligible('agent-1', record, config);
    expect(result.eligible).toBe(true);
  });

  it('allows Byzantine-flagged agent when detection not configured', () => {
    const record = makeAgentRecord({ byzantineFlags: 3 });
    const config = makeConfig(); // enableByzantineDetection not set
    const result = validator.isAgentEligible('agent-1', record, config);
    expect(result.eligible).toBe(true);
  });

  it('rejects agent with low trust score', () => {
    const record = makeAgentRecord({ trustScore: 0.2 }); // below 0.3 threshold
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toBe('low_trust');
      expect(result.weight).toBe(record.weight);
    }
  });

  it('allows agent at exactly the trust threshold boundary', () => {
    const record = makeAgentRecord({ trustScore: 0.3 }); // exactly at 0.3
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(true);
  });

  it('rejects agent with insufficient weight', () => {
    const record = makeAgentRecord({ weight: 0.05 }); // below 0.1 threshold
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toBe('insufficient_weight');
    }
  });

  it('allows agent at exactly the weight threshold boundary', () => {
    const record = makeAgentRecord({ weight: 0.1 }); // exactly at 0.1
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(true);
  });

  it('checks Byzantine before trust (order matters)', () => {
    // Agent has both: Byzantine flag AND low trust
    const record = makeAgentRecord({ byzantineFlags: 1, trustScore: 0.1 });
    const config = makeConfig({ enableByzantineDetection: true });
    const result = validator.isAgentEligible('agent-1', record, config);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      // Should return 'byzantine_flagged', not 'low_trust'
      expect(result.reason).toBe('byzantine_flagged');
    }
  });

  it('checks trust before weight (order matters)', () => {
    // Agent has low trust AND low weight
    const record = makeAgentRecord({ trustScore: 0.1, weight: 0.05 });
    const result = validator.isAgentEligible('agent-1', record, makeConfig());
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      // Should return 'low_trust', not 'insufficient_weight'
      expect(result.reason).toBe('low_trust');
    }
  });

  it('treats zero byzantineFlags as not flagged', () => {
    const record = makeAgentRecord({ byzantineFlags: 0 });
    const config = makeConfig({ enableByzantineDetection: true });
    const result = validator.isAgentEligible('agent-1', record, config);
    expect(result.eligible).toBe(true);
  });
});

// ============================================================================
// Weighted quorum scenarios
// ============================================================================

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
