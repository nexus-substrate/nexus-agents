/**
 * nexus-agents/consensus - Higher-Order Voting Tests
 *
 * Tests for Opinion-Wise (OW) and Independent Subset Partition (ISP) voting.
 * Verifies correlation tracking, Bayesian aggregation, and improvement over baseline.
 *
 * @module consensus/higher-order-voting.test
 * (Source: Issue #333)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Vote } from './types-core.js';
import type { ICorrelationTracker } from './higher-order-types.js';
import {
  createAgentPairKey,
  parseAgentPairKey,
  DEFAULT_HIGHER_ORDER_CONFIG,
  type CorrelationMatrix,
  type IndependentSubset,
  type AgentPairKey,
} from './higher-order-types.js';
import { CorrelationTracker, createCorrelationTracker } from './correlation-tracker.js';
import { SimpleMajorityStrategy } from './strategies.js';
import {
  OWVoting,
  createOWVoting,
  HigherOrderVotingStrategy,
  createHigherOrderVotingStrategy,
} from './higher-order-voting.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createVote(decision: 'approve' | 'reject' | 'abstain', confidence = 0.8): Vote {
  return {
    decision,
    reasoning: `Test vote: ${decision}`,
    confidence,
  };
}

function createVoteMap(
  votes: Array<[string, 'approve' | 'reject' | 'abstain', number?]>
): Map<string, Vote> {
  const map = new Map<string, Vote>();
  for (const [agentId, decision, confidence] of votes) {
    map.set(agentId, createVote(decision, confidence ?? 0.8));
  }
  return map;
}

function createCorrelationMatrix(correlations: Array<[string, string, number]>): CorrelationMatrix {
  const matrix: CorrelationMatrix = new Map();
  for (const [agentA, agentB, correlation] of correlations) {
    const key = createAgentPairKey(agentA, agentB);
    matrix.set(key, correlation);
  }
  return matrix;
}

// ============================================================================
// Higher-Order Types Tests
// ============================================================================

describe('Higher-Order Types', () => {
  describe('createAgentPairKey', () => {
    it('should create consistent key regardless of argument order', () => {
      const key1 = createAgentPairKey('alice', 'bob');
      const key2 = createAgentPairKey('bob', 'alice');
      expect(key1).toBe(key2);
    });

    it('should order agents lexicographically', () => {
      const key = createAgentPairKey('charlie', 'alice');
      expect(key).toBe('alice:charlie');
    });
  });

  describe('parseAgentPairKey', () => {
    it('should extract agent IDs from key', () => {
      const key: AgentPairKey = 'alice:bob';
      const [a, b] = parseAgentPairKey(key);
      expect(a).toBe('alice');
      expect(b).toBe('bob');
    });

    it('should throw on invalid key', () => {
      expect(() => parseAgentPairKey('invalid' as AgentPairKey)).toThrow();
    });
  });

  describe('DEFAULT_HIGHER_ORDER_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_HIGHER_ORDER_CONFIG.minObservationsForCorrelation).toBe(10);
      expect(DEFAULT_HIGHER_ORDER_CONFIG.correlationThreshold).toBe(0.3);
      expect(DEFAULT_HIGHER_ORDER_CONFIG.fallbackToSimpleVoting).toBe(true);
    });
  });
});

// ============================================================================
// CorrelationTracker Tests
// ============================================================================

describe('CorrelationTracker', () => {
  let tracker: CorrelationTracker;

  beforeEach(() => {
    tracker = new CorrelationTracker();
  });

  describe('recordVote', () => {
    it('should record single votes', () => {
      tracker.recordVote('alice', createVote('approve'), 'approved');
      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(1);
      expect(stats.totalObservations).toBe(1);
    });
  });

  describe('recordProposalVotes', () => {
    it('should record votes from multiple agents', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(3);
      expect(stats.trackedPairs).toBe(3); // alice-bob, alice-charlie, bob-charlie
    });

    it('should track agreements between agents', () => {
      // Alice and Bob always agree (approve)
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
          ['charlie', 'reject'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const correlation = tracker.getCorrelation('alice', 'bob');
      expect(correlation).toBeDefined();
      expect(correlation).toBeGreaterThan(0.5); // Highly correlated
    });

    it('should track disagreements between agents', () => {
      // Alice always approves, Charlie always rejects
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['charlie', 'reject'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const correlation = tracker.getCorrelation('alice', 'charlie');
      expect(correlation).toBeDefined();
      expect(correlation).toBeLessThan(-0.5); // Anti-correlated
    });
  });

  describe('computeCorrelationMatrix', () => {
    it('should return empty matrix with insufficient data', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      const matrix = tracker.computeCorrelationMatrix();
      expect(matrix.size).toBe(0); // Not enough observations
    });

    it('should return correlations with sufficient data', () => {
      // Record 15 proposals with consistent voting patterns
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
          ['charlie', i % 2 === 0 ? 'approve' : 'reject'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const matrix = tracker.computeCorrelationMatrix();
      expect(matrix.size).toBeGreaterThan(0);
    });
  });

  describe('getCorrelation', () => {
    it('should return undefined for unknown agents', () => {
      const correlation = tracker.getCorrelation('unknown1', 'unknown2');
      expect(correlation).toBeUndefined();
    });

    it('should return undefined with insufficient observations', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      const correlation = tracker.getCorrelation('alice', 'bob');
      expect(correlation).toBeUndefined(); // Only 1 observation
    });
  });

  describe('identifyIndependentSubsets', () => {
    it('should return empty array with no data', () => {
      const subsets = tracker.identifyIndependentSubsets();
      expect(subsets).toHaveLength(0);
    });

    it('should identify independent agents', () => {
      // Alice and Bob are correlated, Charlie is independent
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
          ['charlie', i % 2 === 0 ? 'approve' : 'reject'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const subsets = tracker.identifyIndependentSubsets();
      expect(subsets.length).toBeGreaterThan(0);
    });

    it('should group correlated agents together', () => {
      // Three groups: {alice, bob}, {charlie, dave}, {eve}
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
          ['charlie', 'reject'],
          ['dave', 'reject'],
          ['eve', i % 2 === 0 ? 'approve' : 'reject'],
        ]);
        tracker.recordProposalVotes(
          `proposal-${String(i)}`,
          votes,
          i % 2 === 0 ? 'approved' : 'rejected'
        );
      }

      const subsets = tracker.identifyIndependentSubsets();
      expect(subsets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hasSufficientData', () => {
    it('should return true for single agent', () => {
      expect(tracker.hasSufficientData(['alice'])).toBe(true);
    });

    it('should return false with insufficient observations', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      expect(tracker.hasSufficientData(['alice', 'bob'])).toBe(false);
    });

    it('should return true with sufficient observations', () => {
      for (let i = 0; i < 15; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      expect(tracker.hasSufficientData(['alice', 'bob'])).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      for (let i = 0; i < 5; i++) {
        const votes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(2);
      expect(stats.trackedPairs).toBe(1);
      expect(stats.totalObservations).toBe(10); // 2 agents * 5 proposals
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      tracker.clear();

      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(0);
      expect(stats.trackedPairs).toBe(0);
      expect(stats.totalObservations).toBe(0);
    });
  });
});

// ============================================================================
// OWVoting Tests
// ============================================================================

describe('OWVoting', () => {
  let voting: OWVoting;

  beforeEach(() => {
    voting = new OWVoting();
  });

  describe('aggregateWithCorrelation', () => {
    it('should fall back to simple voting with insufficient data', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);
      const correlationMatrix: CorrelationMatrix = new Map();

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.usedCorrelationData).toBe(false);
      expect(result.method).toBe('simple');
    });

    it('should use correlation data when available', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);
      // All pairs have correlation data
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 0.8],
        ['alice', 'charlie', -0.5],
        ['bob', 'charlie', -0.5],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.usedCorrelationData).toBe(true);
      expect(result.method).toBe('ow');
    });

    it('should downweight correlated agents', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'], // Highly correlated with alice
        ['charlie', 'reject'],
      ]);
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 0.9], // Very high correlation
        ['alice', 'charlie', 0.1],
        ['bob', 'charlie', 0.1],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.downweightedAgents.length).toBeGreaterThan(0);
    });

    it('should approve with majority', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 0.1], // Low correlation - independent
        ['alice', 'charlie', 0.1],
        ['bob', 'charlie', 0.1],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('approve');
      expect(result.posteriorApproval).toBeGreaterThan(0.5);
    });

    it('should reject with majority rejections', () => {
      const votes = createVoteMap([
        ['alice', 'reject'],
        ['bob', 'reject'],
        ['charlie', 'approve'],
      ]);
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 0.1],
        ['alice', 'charlie', 0.1],
        ['bob', 'charlie', 0.1],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('reject');
      expect(result.posteriorRejection).toBeGreaterThan(0.5);
    });

    it('should return no_consensus when margin is too small', () => {
      const votes = createVoteMap([
        ['alice', 'approve', 0.5],
        ['bob', 'reject', 0.5],
      ]);
      const correlationMatrix = createCorrelationMatrix([['alice', 'bob', 0.1]]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('no_consensus');
    });

    // =========================================================================
    // #2227: scope_steward × pm correlation regression
    // -------------------------------------------------------------------------
    // The 7-role panel (#2185) added scope_steward, which evaluates the same
    // build-vs-buy / scope axis as pm. When the two co-vote, higher_order MUST
    // down-weight the redundant signal — otherwise scope_steward + pm acting
    // in lockstep effectively double-count the product perspective.
    //
    // CorrelationTracker is dynamic (no hardcoded fixture), so the empirical
    // measurement accumulates as live votes accrue. These tests pin the
    // BEHAVIOR: given a correlation observation, the strategy must respond
    // correctly regardless of which roles are involved.
    // =========================================================================
    describe('#2227: scope_steward × pm correlation behavior', () => {
      it('down-weights pm when scope_steward × pm correlation is high', () => {
        // 7-role panel, scope_steward + pm both approve in lockstep with high
        // correlation. Other roles split. Expectation: at least one of
        // {pm, scope_steward} appears in downweightedAgents.
        const votes = createVoteMap([
          ['architect', 'approve'],
          ['security', 'reject'],
          ['devex', 'approve'],
          ['ai_ml', 'reject'],
          ['pm', 'approve'],
          ['catfish', 'reject'],
          ['scope_steward', 'approve'],
        ]);
        const correlationMatrix = createCorrelationMatrix([
          ['scope_steward', 'pm', 0.9], // The correlated pair this test guards
          // All other pairs near-independent so we isolate the signal.
          ['architect', 'security', 0.1],
          ['architect', 'devex', 0.1],
          ['architect', 'pm', 0.1],
          ['architect', 'scope_steward', 0.1],
          ['security', 'pm', 0.1],
          ['security', 'scope_steward', 0.1],
          ['devex', 'pm', 0.1],
          ['devex', 'scope_steward', 0.1],
          ['catfish', 'pm', 0.1],
          ['catfish', 'scope_steward', 0.1],
          ['ai_ml', 'pm', 0.1],
          ['ai_ml', 'scope_steward', 0.1],
        ]);

        const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

        const downweighted = new Set(result.downweightedAgents);
        expect(downweighted.has('pm') || downweighted.has('scope_steward')).toBe(true);
      });

      it('does NOT down-weight pm when scope_steward × pm correlation is low', () => {
        // Same vote pattern, but scope_steward and pm are independent. The
        // strategy should treat their joint approval as two real signals.
        const votes = createVoteMap([
          ['architect', 'approve'],
          ['security', 'reject'],
          ['devex', 'approve'],
          ['ai_ml', 'reject'],
          ['pm', 'approve'],
          ['catfish', 'reject'],
          ['scope_steward', 'approve'],
        ]);
        const correlationMatrix = createCorrelationMatrix([
          ['scope_steward', 'pm', 0.05], // INDEPENDENT
          ['architect', 'security', 0.1],
          ['architect', 'devex', 0.1],
          ['architect', 'pm', 0.1],
          ['architect', 'scope_steward', 0.1],
          ['security', 'pm', 0.1],
          ['security', 'scope_steward', 0.1],
          ['devex', 'pm', 0.1],
          ['devex', 'scope_steward', 0.1],
          ['catfish', 'pm', 0.1],
          ['catfish', 'scope_steward', 0.1],
          ['ai_ml', 'pm', 0.1],
          ['ai_ml', 'scope_steward', 0.1],
        ]);

        const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

        const downweighted = new Set(result.downweightedAgents);
        expect(downweighted.has('pm')).toBe(false);
        expect(downweighted.has('scope_steward')).toBe(false);
      });

      it('reports lower effectiveVoteCount when scope_steward × pm are correlated', () => {
        // Direct comparison: same votes, only the scope_steward × pm
        // correlation differs. The correlated case must produce a strictly
        // smaller effectiveVoteCount.
        const votes = createVoteMap([
          ['architect', 'approve'],
          ['security', 'approve'],
          ['devex', 'approve'],
          ['ai_ml', 'approve'],
          ['pm', 'approve'],
          ['catfish', 'approve'],
          ['scope_steward', 'approve'],
        ]);
        const baseCorrelations: Array<[string, string, number]> = [
          ['architect', 'security', 0.1],
          ['architect', 'devex', 0.1],
          ['architect', 'pm', 0.1],
          ['architect', 'scope_steward', 0.1],
          ['security', 'pm', 0.1],
          ['security', 'scope_steward', 0.1],
          ['devex', 'pm', 0.1],
          ['devex', 'scope_steward', 0.1],
          ['catfish', 'pm', 0.1],
          ['catfish', 'scope_steward', 0.1],
          ['ai_ml', 'pm', 0.1],
          ['ai_ml', 'scope_steward', 0.1],
        ];

        const independentResult = voting.aggregateWithCorrelation(
          votes,
          createCorrelationMatrix([...baseCorrelations, ['scope_steward', 'pm', 0.05]])
        );
        const correlatedResult = voting.aggregateWithCorrelation(
          votes,
          createCorrelationMatrix([...baseCorrelations, ['scope_steward', 'pm', 0.95]])
        );

        // Correlated case must aggregate strictly less than independent.
        // The exact delta depends on weight thresholds, so we assert the
        // monotonic property, not a specific number.
        expect(correlatedResult.effectiveVoteCount).toBeLessThan(
          independentResult.effectiveVoteCount
        );
      });
    });
  });

  describe('computeISP', () => {
    it('should fall back to simple voting with no subsets', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);

      const result = voting.computeISP(votes, []);

      expect(result.method).toBe('simple');
    });

    it('should aggregate within independent subsets', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
        ['dave', 'reject'],
      ]);

      const subsets: IndependentSubset[] = [
        {
          id: 'subset-0',
          agentIds: ['alice', 'bob'],
          independenceScore: 0.1,
          observationCount: 15,
        },
        {
          id: 'subset-1',
          agentIds: ['charlie', 'dave'],
          independenceScore: 0.1,
          observationCount: 15,
        },
      ];

      const result = voting.computeISP(votes, subsets);

      expect(result.method).toBe('isp');
      expect(result.independentSubsets).toBeDefined();
      expect(result.effectiveVoteCount).toBe(2); // 2 independent subsets
    });

    it('should weight subsets by size', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'approve'],
        ['dave', 'reject'],
      ]);

      const subsets: IndependentSubset[] = [
        {
          id: 'subset-0',
          agentIds: ['alice', 'bob', 'charlie'],
          independenceScore: 0.1,
          observationCount: 15,
        },
        { id: 'subset-1', agentIds: ['dave'], independenceScore: 0, observationCount: 15 },
      ];

      const result = voting.computeISP(votes, subsets);

      expect(result.decision).toBe('approve');
      // Larger subset should have more weight
    });
  });

  describe('aggregate', () => {
    it('should use tracker for correlation estimation', () => {
      const tracker = new CorrelationTracker();

      // Build up voting history
      for (let i = 0; i < 15; i++) {
        const historyVotes = createVoteMap([
          ['alice', 'approve'],
          ['bob', 'approve'],
          ['charlie', i % 2 === 0 ? 'approve' : 'reject'],
        ]);
        tracker.recordProposalVotes(`history-${String(i)}`, historyVotes, 'approved');
      }

      const currentVotes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);

      const result = voting.aggregate(currentVotes, tracker);

      expect(result.usedCorrelationData).toBe(true);
    });

    it('should fall back to simple voting with insufficient history', () => {
      const tracker = new CorrelationTracker();

      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
      ]);

      const result = voting.aggregate(votes, tracker);

      expect(result.usedCorrelationData).toBe(false);
      expect(result.method).toBe('simple');
    });
  });

  describe('calculateOutcome (IVotingStrategy interface)', () => {
    it('should return VotingOutcome for ConsensusEngine compatibility', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);

      const outcome = voting.calculateOutcome(new Map(votes));

      expect(outcome.approved).toBeDefined();
      expect(outcome.approvalPercentage).toBeDefined();
      expect(outcome.voteCounts).toBeDefined();
      expect(outcome.reason).toBeDefined();
    });
  });

  // #4701: the higher-order strategy was the only one of the four missing the
  // zero-voting-votes guard its siblings have (`strategies.ts:136`, `:174`).
  // `aggregateSimple` fell to `total > 0 ? approve/total : 0.5`, so a panel that
  // cast no countable votes reported a measured-looking 50%.
  describe('empty and all-abstain panels (#4701)', () => {
    it('reports 0% and says no votes were cast, not a fabricated 50% midpoint', () => {
      const outcome = voting.calculateOutcome(new Map());

      expect(outcome.approvalPercentage).toBe(0);
      expect(outcome.approved).toBe(false);
      expect(outcome.reason).toContain('No votes cast');
    });

    it('treats an all-abstain panel as no votes cast — abstentions are not a split', () => {
      // Reachable in production: an errored voter (voter-execution.ts:92) and an
      // unparseable response (protocol-helpers.ts:101) both yield `abstain`.
      const votes = createVoteMap([
        ['alice', 'abstain'],
        ['bob', 'abstain'],
        ['charlie', 'abstain'],
      ]);

      const outcome = voting.calculateOutcome(new Map(votes));

      expect(outcome.approvalPercentage).toBe(0);
      expect(outcome.approved).toBe(false);
      expect(outcome.reason).toContain('No votes cast');
      expect(outcome.voteCounts).toEqual({ approve: 0, reject: 0, abstain: 3, total: 3 });
    });

    it('matches SimpleMajorityStrategy on the same empty input', () => {
      // The point of the fix is consistency: four strategies, one empty-case answer.
      const simple = new SimpleMajorityStrategy();

      const higherOrder = voting.calculateOutcome(new Map());
      const simpleOutcome = simple.calculateOutcome(new Map());

      expect(higherOrder.approvalPercentage).toBe(simpleOutcome.approvalPercentage);
      expect(higherOrder.approved).toBe(simpleOutcome.approved);
    });

    it('still reports a real 1-1 split as 50% — the guard must not swallow a genuine tie', () => {
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'reject'],
      ]);

      const outcome = voting.calculateOutcome(new Map(votes));

      expect(outcome.approvalPercentage).toBe(50);
      expect(outcome.reason).not.toContain('No votes cast');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = voting.getConfig();

      expect(config.minObservationsForCorrelation).toBe(10);
      expect(config.fallbackToSimpleVoting).toBe(true);
    });

    it('should use custom config when provided', () => {
      const customVoting = new OWVoting({
        config: { minObservationsForCorrelation: 5 },
      });

      const config = customVoting.getConfig();
      expect(config.minObservationsForCorrelation).toBe(5);
    });
  });
});

// ============================================================================
// Edge Cases and Comparison Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('All agents perfectly correlated', () => {
    it('should significantly reduce effective vote count', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'approve'],
        ['dave', 'approve'],
      ]);

      // All pairs perfectly correlated
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 1.0],
        ['alice', 'charlie', 1.0],
        ['alice', 'dave', 1.0],
        ['bob', 'charlie', 1.0],
        ['bob', 'dave', 1.0],
        ['charlie', 'dave', 1.0],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      // Effective vote count should be reduced due to correlation
      expect(result.effectiveVoteCount).toBeLessThan(4);
      expect(result.downweightedAgents.length).toBeGreaterThan(0);
    });
  });

  describe('All agents perfectly independent', () => {
    it('should not downweight any agents', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', 'reject'],
      ]);

      // All pairs have zero correlation (independent)
      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', 0],
        ['alice', 'charlie', 0],
        ['bob', 'charlie', 0],
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.downweightedAgents.length).toBe(0);
    });
  });

  describe('Anti-correlated agents', () => {
    it('should handle negative correlations', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'reject'], // Anti-correlated with alice
      ]);

      const correlationMatrix = createCorrelationMatrix([
        ['alice', 'bob', -0.9], // Strong negative correlation
      ]);

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      // Should still reach a decision
      expect(['approve', 'reject', 'no_consensus']).toContain(result.decision);
    });
  });

  describe('Single voter', () => {
    it('should handle single agent gracefully', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([['alice', 'approve']]);
      const correlationMatrix: CorrelationMatrix = new Map();

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('approve');
      expect(result.effectiveVoteCount).toBe(1);
    });
  });

  describe('All abstentions', () => {
    it('should return no_consensus', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([
        ['alice', 'abstain'],
        ['bob', 'abstain'],
      ]);
      const correlationMatrix: CorrelationMatrix = new Map();

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('no_consensus');
    });
  });

  describe('Mixed abstentions', () => {
    it('should ignore abstentions in decision', () => {
      const voting = new OWVoting();
      const votes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'abstain'],
        ['charlie', 'abstain'],
      ]);
      const correlationMatrix: CorrelationMatrix = new Map();

      const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

      expect(result.decision).toBe('approve');
    });
  });
});

describe('Comparison with Simple Majority', () => {
  it('should show improvement when correlation data available', () => {
    const voting = new OWVoting();
    const tracker = new CorrelationTracker();

    // Build correlated voting history: Alice and Bob always vote together
    for (let i = 0; i < 20; i++) {
      const historyVotes = createVoteMap([
        ['alice', 'approve'],
        ['bob', 'approve'],
        ['charlie', i % 3 === 0 ? 'approve' : 'reject'],
        ['dave', i % 3 === 0 ? 'approve' : 'reject'],
      ]);
      tracker.recordProposalVotes(
        `history-${String(i)}`,
        historyVotes,
        i % 3 === 0 ? 'approved' : 'rejected'
      );
    }

    // Current vote: alice and bob approve (but they're correlated)
    // charlie and dave reject (more independent)
    const currentVotes = createVoteMap([
      ['alice', 'approve'],
      ['bob', 'approve'],
      ['charlie', 'reject'],
      ['dave', 'reject'],
    ]);

    const result = voting.aggregate(currentVotes, tracker);

    // With correlation awareness, alice and bob's votes should be downweighted
    // because they're essentially "the same vote"
    expect(result.usedCorrelationData).toBe(true);
    // The result should account for correlation
  });

  it('should match simple voting when all agents are independent', () => {
    const voting = new OWVoting();
    const votes = createVoteMap([
      ['alice', 'approve', 0.9],
      ['bob', 'approve', 0.9],
      ['charlie', 'reject', 0.9],
    ]);

    // All independent
    const correlationMatrix = createCorrelationMatrix([
      ['alice', 'bob', 0],
      ['alice', 'charlie', 0],
      ['bob', 'charlie', 0],
    ]);

    const result = voting.aggregateWithCorrelation(votes, correlationMatrix);

    // Should approve with ~67% since 2/3 approve
    expect(result.decision).toBe('approve');
    expect(result.posteriorApproval).toBeGreaterThan(0.6);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  describe('createCorrelationTracker', () => {
    it('should create tracker with default config', () => {
      const tracker = createCorrelationTracker();
      expect(tracker).toBeDefined();
      expect(tracker.getStats().totalAgents).toBe(0);
    });

    it('should create tracker with custom config', () => {
      const tracker = createCorrelationTracker({
        minObservationsForCorrelation: 5,
      });
      expect(tracker).toBeDefined();
    });
  });

  describe('createOWVoting', () => {
    it('should create OWVoting with default config', () => {
      const voting = createOWVoting();
      expect(voting).toBeDefined();
      const config = voting.getConfig();
      expect(config.minObservationsForCorrelation).toBe(10);
    });

    it('should create OWVoting with custom config', () => {
      const voting = createOWVoting({
        config: { correlationThreshold: 0.5 },
      });
      const config = voting.getConfig();
      expect(config.correlationThreshold).toBe(0.5);
    });
  });

  describe('createHigherOrderVotingStrategy', () => {
    it('should create strategy compatible with VotingStrategyFactory', () => {
      const strategy = createHigherOrderVotingStrategy();
      expect(strategy.algorithm).toBeDefined();
      expect(typeof strategy.calculateOutcome).toBe('function');
    });
  });
});

// ============================================================================
// Integration with ConsensusEngine Tests
// ============================================================================

describe('HigherOrderVotingStrategy', () => {
  it('should implement IVotingStrategy interface', () => {
    const strategy = new HigherOrderVotingStrategy();

    expect(strategy.algorithm).toBe('opinion_wise');
    expect(typeof strategy.calculateOutcome).toBe('function');
  });

  it('should be usable with Map<string, Vote> input', () => {
    const strategy = new HigherOrderVotingStrategy();
    const votes = new Map<string, Vote>([
      ['alice', createVote('approve')],
      ['bob', createVote('approve')],
      ['charlie', createVote('reject')],
    ]);

    const outcome = strategy.calculateOutcome(votes);

    expect(outcome.approved).toBe(true);
    expect(outcome.voteCounts.approve).toBe(2);
    expect(outcome.voteCounts.reject).toBe(1);
  });
});

describe('OWVoting.algorithm label (#3168)', () => {
  it('defaults to simple_majority when constructed directly', () => {
    expect(new OWVoting().algorithm).toBe('simple_majority');
  });

  it('is constructor-configurable', () => {
    expect(new OWVoting({ algorithm: 'opinion_wise' }).algorithm).toBe('opinion_wise');
  });

  it('HigherOrderVotingStrategy reports opinion_wise however it is created', () => {
    expect(new HigherOrderVotingStrategy().algorithm).toBe('opinion_wise');
    expect(createHigherOrderVotingStrategy().algorithm).toBe('opinion_wise');
  });
});

// ============================================================================
// Injectable correlation tracker (#3173)
// ============================================================================

/** Minimal spy tracker — `hasSufficientData=false` makes aggregate fall back to
 *  simple voting (only that method is touched), so a spy proves WHICH tracker ran. */
function spyTracker(): ICorrelationTracker {
  return {
    hasSufficientData: vi.fn(() => false),
    computeCorrelationMatrix: vi.fn(() => new Map()),
    identifyIndependentSubsets: vi.fn(() => []),
  } as unknown as ICorrelationTracker;
}

describe('OWVoting — injectable correlation tracker (#3173)', () => {
  const votes = createVoteMap([
    ['alice', 'approve'],
    ['bob', 'reject'],
  ]);

  it('uses the constructor-injected tracker when aggregate() is called WITHOUT one', () => {
    const injected = spyTracker();
    const owv = createOWVoting({ tracker: injected });
    const result = owv.aggregate(votes); // no per-call tracker
    expect(result).toBeDefined();
    expect(injected.hasSufficientData).toHaveBeenCalledTimes(1);
  });

  it('lets a per-call tracker WIN over the injected one', () => {
    const injected = spyTracker();
    const perCall = spyTracker();
    createOWVoting({ tracker: injected }).aggregate(votes, perCall);
    expect(perCall.hasSufficientData).toHaveBeenCalledTimes(1);
    expect(injected.hasSufficientData).not.toHaveBeenCalled();
  });

  it('THROWS a clear error when neither a per-call nor an injected tracker is available', () => {
    expect(() => createOWVoting().aggregate(votes)).toThrow(/requires an ICorrelationTracker/);
  });

  it('still works with a real injected tracker (composability smoke test)', () => {
    const owv = createOWVoting({ tracker: createCorrelationTracker() });
    expect(owv.aggregate(votes)).toBeDefined();
  });
});
