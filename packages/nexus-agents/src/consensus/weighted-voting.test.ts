/**
 * Tests for weighted Byzantine voting implementation.
 * (Source: Issue #103, arXiv:2511.10400 - CP-WBFT)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WeightedVoting, createWeightedVoting } from './weighted-voting.js';
import type { Vote, WeightedVotingConfig } from './types.js';

describe('WeightedVoting', () => {
  let voting: WeightedVoting;

  beforeEach(() => {
    voting = new WeightedVoting();
  });

  describe('createWeightedVoting', () => {
    it('should create a WeightedVoting instance', () => {
      const instance = createWeightedVoting();
      expect(instance).toBeInstanceOf(WeightedVoting);
    });

    it('should accept custom configuration', () => {
      const config: Partial<WeightedVotingConfig> = {
        initialWeight: 0.8,
        quorumThreshold: 0.7,
      };
      const instance = createWeightedVoting(config);
      expect(instance).toBeInstanceOf(WeightedVoting);
    });
  });

  describe('registerAgent', () => {
    it('should register a new agent with initial weight', () => {
      voting.registerAgent('agent-1');
      const record = voting.getAgentRecord('agent-1');

      expect(record).toBeDefined();
      expect(record?.agentId).toBe('agent-1');
      expect(record?.weight).toBe(0.5); // Default initial weight
      expect(record?.totalTasks).toBe(0);
      expect(record?.byzantineFlags).toBe(0);
    });

    it('should not re-register existing agent', () => {
      voting.registerAgent('agent-1');
      voting.updatePerformance('agent-1', 'success');
      voting.registerAgent('agent-1'); // Should be no-op

      const record = voting.getAgentRecord('agent-1');
      expect(record?.totalTasks).toBe(1);
    });

    it('should respect custom initial weight', () => {
      const customVoting = new WeightedVoting({ initialWeight: 0.8 });
      customVoting.registerAgent('agent-1');

      const record = customVoting.getAgentRecord('agent-1');
      expect(record?.weight).toBe(0.8);
    });
  });

  describe('calculateWeight', () => {
    it('should return 0 for unregistered agent', () => {
      expect(voting.calculateWeight('unknown')).toBe(0);
    });

    it('should return current weight for registered agent', () => {
      voting.registerAgent('agent-1');
      expect(voting.calculateWeight('agent-1')).toBe(0.5);
    });
  });

  describe('updatePerformance', () => {
    beforeEach(() => {
      voting.registerAgent('agent-1');
    });

    it('should increase weight on success', () => {
      const initialWeight = voting.calculateWeight('agent-1');
      voting.updatePerformance('agent-1', 'success');

      const newWeight = voting.calculateWeight('agent-1');
      expect(newWeight).toBeGreaterThan(initialWeight);
    });

    it('should decrease weight on failure', () => {
      const initialWeight = voting.calculateWeight('agent-1');
      voting.updatePerformance('agent-1', 'failure');

      const newWeight = voting.calculateWeight('agent-1');
      expect(newWeight).toBeLessThan(initialWeight);
    });

    it('should slightly decrease weight on partial success', () => {
      const initialWeight = voting.calculateWeight('agent-1');
      voting.updatePerformance('agent-1', 'partial');

      const newWeight = voting.calculateWeight('agent-1');
      expect(newWeight).toBeLessThan(initialWeight);
      // Partial decay should be less severe than failure
    });

    it('should not change weight on unknown outcome', () => {
      const initialWeight = voting.calculateWeight('agent-1');
      voting.updatePerformance('agent-1', 'unknown');

      const newWeight = voting.calculateWeight('agent-1');
      expect(newWeight).toBe(initialWeight);
    });

    it('should track task counts', () => {
      voting.updatePerformance('agent-1', 'success');
      voting.updatePerformance('agent-1', 'failure');
      voting.updatePerformance('agent-1', 'partial');

      const record = voting.getAgentRecord('agent-1');
      expect(record?.totalTasks).toBe(3);
      expect(record?.successfulTasks).toBe(1);
      expect(record?.failedTasks).toBe(1);
      expect(record?.partialTasks).toBe(1);
    });

    it('should auto-register unknown agents', () => {
      voting.updatePerformance('new-agent', 'success');

      const record = voting.getAgentRecord('new-agent');
      expect(record).toBeDefined();
      expect(record?.totalTasks).toBe(1);
    });

    it('should update success rate', () => {
      voting.updatePerformance('agent-1', 'success');
      voting.updatePerformance('agent-1', 'success');
      voting.updatePerformance('agent-1', 'failure');

      const record = voting.getAgentRecord('agent-1');
      expect(record?.successRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('canVote', () => {
    it('should return false for unregistered agent', () => {
      expect(voting.canVote('unknown')).toBe(false);
    });

    it('should return true for agent meeting thresholds', () => {
      voting.registerAgent('agent-1');
      expect(voting.canVote('agent-1')).toBe(true);
    });

    it('should return false for agent below weight threshold', () => {
      const customVoting = new WeightedVoting({ minWeight: 0.6, initialWeight: 0.5 });
      customVoting.registerAgent('agent-1');

      expect(customVoting.canVote('agent-1')).toBe(false);
    });

    it('should return false for agent with low trust score', () => {
      const customVoting = new WeightedVoting({ minTrustScore: 0.8 });
      customVoting.registerAgent('agent-1');

      expect(customVoting.canVote('agent-1')).toBe(false);
    });
  });

  describe('flagByzantine', () => {
    beforeEach(() => {
      voting.registerAgent('agent-1');
    });

    it('should increment byzantine flags', () => {
      voting.flagByzantine('agent-1', 'Suspicious voting pattern');

      const record = voting.getAgentRecord('agent-1');
      expect(record?.byzantineFlags).toBe(1);
    });

    it('should apply weight penalty', () => {
      const initialWeight = voting.calculateWeight('agent-1');
      voting.flagByzantine('agent-1', 'Suspicious voting pattern');

      const newWeight = voting.calculateWeight('agent-1');
      expect(newWeight).toBe(initialWeight * 0.5);
    });

    it('should exclude agent after reaching flag threshold', () => {
      voting.flagByzantine('agent-1', 'Reason 1');
      voting.flagByzantine('agent-1', 'Reason 2');
      voting.flagByzantine('agent-1', 'Reason 3');

      expect(voting.canVote('agent-1')).toBe(false);
      const record = voting.getAgentRecord('agent-1');
      expect(record?.weight).toBe(0);
      expect(record?.trustScore).toBe(0);
    });

    it('should ignore unknown agents', () => {
      // Should not throw
      voting.flagByzantine('unknown', 'Some reason');
      expect(voting.getAgentRecord('unknown')).toBeUndefined();
    });
  });

  describe('weightedConsensus', () => {
    beforeEach(() => {
      voting.registerAgent('agent-1');
      voting.registerAgent('agent-2');
      voting.registerAgent('agent-3');
    });

    it('should calculate weighted approval', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-2', { decision: 'approve', confidence: 0.8, reasoning: 'Ok' }],
        ['agent-3', { decision: 'reject', confidence: 0.5, reasoning: 'Bad' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.weightedApproval).toBeGreaterThan(result.weightedRejection);
      expect(result.participatingAgents).toHaveLength(3);
    });

    it('should reach consensus on approval', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-2', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-3', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.decision).toBe('approve');
      expect(result.quorumReached).toBe(true);
    });

    it('should reach consensus on rejection', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'reject', confidence: 1.0, reasoning: 'Bad' }],
        ['agent-2', { decision: 'reject', confidence: 1.0, reasoning: 'Bad' }],
        ['agent-3', { decision: 'reject', confidence: 1.0, reasoning: 'Bad' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.decision).toBe('reject');
      expect(result.quorumReached).toBe(true);
    });

    it('should return no_consensus when split', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-2', { decision: 'reject', confidence: 1.0, reasoning: 'Bad' }],
        ['agent-3', { decision: 'abstain', confidence: 0.5, reasoning: 'Unsure' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.decision).toBe('no_consensus');
    });

    it('should exclude agents that cannot vote', () => {
      voting.flagByzantine('agent-1', 'Reason 1');
      voting.flagByzantine('agent-1', 'Reason 2');
      voting.flagByzantine('agent-1', 'Reason 3');

      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'reject', confidence: 1.0, reasoning: 'Bad' }],
        ['agent-2', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-3', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
      ]);

      const result = voting.weightedConsensus(votes);

      // Agent-1 should be excluded
      expect(result.participatingAgents).not.toContain('agent-1');
      expect(result.participatingAgents).toHaveLength(2);
    });

    it('should return weight breakdown', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
        ['agent-2', { decision: 'approve', confidence: 1.0, reasoning: 'Good' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.weightBreakdown.get('agent-1')).toBe(0.5);
      expect(result.weightBreakdown.get('agent-2')).toBe(0.5);
    });

    it('should apply confidence to vote weight', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 1.0, reasoning: 'Certain' }],
        ['agent-2', { decision: 'approve', confidence: 0.5, reasoning: 'Unsure' }],
      ]);

      const result = voting.weightedConsensus(votes);

      // Agent-1's vote should contribute more than agent-2's
      expect(result.weightedApproval).toBeCloseTo(0.5 * 1.0 + 0.5 * 0.5, 5);
    });
  });

  describe('getAllRecords', () => {
    it('should return all registered agents', () => {
      voting.registerAgent('agent-1');
      voting.registerAgent('agent-2');
      voting.registerAgent('agent-3');

      const records = voting.getAllRecords();

      expect(records).toHaveLength(3);
      expect(records.map((r) => r.agentId)).toContain('agent-1');
      expect(records.map((r) => r.agentId)).toContain('agent-2');
      expect(records.map((r) => r.agentId)).toContain('agent-3');
    });

    it('should return immutable records', () => {
      voting.registerAgent('agent-1');
      const records = voting.getAllRecords();

      // Records should be read-only (no byzantineReasons field exposed)
      expect(records[0]).not.toHaveProperty('byzantineReasons');
    });
  });

  describe('recalibrateWeights', () => {
    it('should recalibrate weights based on global performance', () => {
      voting.registerAgent('agent-1');
      voting.registerAgent('agent-2');

      // Agent-1 performs well
      voting.updatePerformance('agent-1', 'success');
      voting.updatePerformance('agent-1', 'success');
      voting.updatePerformance('agent-1', 'success');

      // Agent-2 performs poorly
      voting.updatePerformance('agent-2', 'failure');
      voting.updatePerformance('agent-2', 'failure');
      voting.updatePerformance('agent-2', 'failure');

      voting.recalibrateWeights();

      const weight1After = voting.calculateWeight('agent-1');
      const weight2After = voting.calculateWeight('agent-2');

      // After recalibration, good performer should have higher weight
      expect(weight1After).toBeGreaterThan(weight2After);
    });

    it('should skip agents with insufficient history', () => {
      voting.registerAgent('agent-1');
      voting.updatePerformance('agent-1', 'success'); // Only 1 task

      const weightBefore = voting.calculateWeight('agent-1');
      voting.recalibrateWeights();
      const weightAfter = voting.calculateWeight('agent-1');

      // Weight should remain unchanged (< 3 tasks)
      expect(weightAfter).toBe(weightBefore);
    });
  });

  describe('Byzantine Pattern Detection', () => {
    beforeEach(() => {
      voting.registerAgent('agent-1');
      voting.registerAgent('agent-2');
      voting.registerAgent('agent-3');
      voting.registerAgent('agent-4');
      voting.registerAgent('agent-5');
    });

    it('should detect collusion patterns', () => {
      // More than 60% identical votes with exact same confidence
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 0.77, reasoning: 'R1' }],
        ['agent-2', { decision: 'approve', confidence: 0.77, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.77, reasoning: 'R3' }],
        ['agent-4', { decision: 'approve', confidence: 0.77, reasoning: 'R4' }],
        ['agent-5', { decision: 'reject', confidence: 0.5, reasoning: 'R5' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.byzantineDetected).toBe(true);
    });

    it('should detect low-confidence contrarian voting', () => {
      // Flag agent-1 twice first
      voting.flagByzantine('agent-1', 'Reason 1');
      voting.flagByzantine('agent-1', 'Reason 2');

      // agent-1 votes against majority with low confidence
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'reject', confidence: 0.2, reasoning: 'R1' }],
        ['agent-2', { decision: 'approve', confidence: 0.9, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.9, reasoning: 'R3' }],
        ['agent-4', { decision: 'approve', confidence: 0.9, reasoning: 'R4' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.byzantineDetected).toBe(true);
    });

    it('should not flag legitimate disagreement', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 0.9, reasoning: 'R1' }],
        ['agent-2', { decision: 'reject', confidence: 0.8, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.7, reasoning: 'R3' }],
      ]);

      const result = voting.weightedConsensus(votes);

      expect(result.byzantineDetected).toBe(false);
    });
  });

  describe('Weight Bounds', () => {
    it('should not exceed weight of 1', () => {
      voting.registerAgent('agent-1');

      // Many successes
      for (let i = 0; i < 100; i++) {
        voting.updatePerformance('agent-1', 'success');
      }

      expect(voting.calculateWeight('agent-1')).toBeLessThanOrEqual(1);
    });

    it('should not go below weight of 0', () => {
      voting.registerAgent('agent-1');

      // Many failures
      for (let i = 0; i < 100; i++) {
        voting.updatePerformance('agent-1', 'failure');
      }

      expect(voting.calculateWeight('agent-1')).toBeGreaterThanOrEqual(0);
    });
  });
});
