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
      const instance = createWeightedVoting({ config });
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
      const customVoting = new WeightedVoting({ config: { initialWeight: 0.8 } });
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
      const customVoting = new WeightedVoting({ config: { minWeight: 0.6, initialWeight: 0.5 } });
      customVoting.registerAgent('agent-1');

      expect(customVoting.canVote('agent-1')).toBe(false);
    });

    it('should return false for agent with low trust score', () => {
      const customVoting = new WeightedVoting({ config: { minTrustScore: 0.8 } });
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

  describe('Byzantine Event Emissions (Issue #218)', () => {
    interface MockEventBus {
      events: Array<{ topic: string; payload: unknown }>;
      emit: (event: { topic: string; payload: unknown }) => void;
      emitAsync: (event: { topic: string; payload: unknown }) => Promise<void>;
      subscribe: () => { id: string; pattern: string; unsubscribe: () => void };
      unsubscribe: () => void;
      getHistory: () => never[];
      clearHistory: () => void;
      getStats: () => {
        eventsEmitted: number;
        subscriptionsCreated: number;
        activeSubscriptions: number;
        historySize: number;
        errorCount: number;
      };
      hasSubscribers: () => boolean;
    }

    function createMockEventBus(): MockEventBus {
      const events: Array<{ topic: string; payload: unknown }> = [];
      return {
        events,
        emit: (event: { topic: string; payload: unknown }) => {
          events.push(event);
        },
        emitAsync: (event: { topic: string; payload: unknown }) => {
          events.push(event);
          return Promise.resolve();
        },
        subscribe: () => ({ id: 'sub-1', pattern: '*', unsubscribe: () => {} }),
        unsubscribe: () => {},
        getHistory: () => [],
        clearHistory: () => {},
        getStats: () => ({
          eventsEmitted: events.length,
          subscriptionsCreated: 0,
          activeSubscriptions: 0,
          historySize: 0,
          errorCount: 0,
        }),
        hasSubscribers: () => false,
      };
    }

    it('should emit weight_updated event on performance update', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });
      votingWithEvents.registerAgent('agent-1');

      votingWithEvents.updatePerformance('agent-1', 'success');

      const weightEvents = mockBus.events.filter((e) => e.topic === 'byzantine.weight_updated');
      expect(weightEvents).toHaveLength(1);
      expect(weightEvents[0]?.payload).toMatchObject({
        agentId: 'agent-1',
        reason: 'performance_update',
      });
    });

    it('should emit agent_flagged event when flagging Byzantine', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });
      votingWithEvents.registerAgent('agent-1');

      votingWithEvents.flagByzantine('agent-1', 'Suspicious pattern');

      const flaggedEvents = mockBus.events.filter((e) => e.topic === 'byzantine.agent_flagged');
      expect(flaggedEvents).toHaveLength(1);
      expect(flaggedEvents[0]?.payload).toMatchObject({
        agentId: 'agent-1',
        reason: 'Suspicious pattern',
      });
    });

    it('should emit weight_updated with flag_penalty reason when flagging', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });
      votingWithEvents.registerAgent('agent-1');

      votingWithEvents.flagByzantine('agent-1', 'Test reason');

      const weightEvents = mockBus.events.filter(
        (e) =>
          e.topic === 'byzantine.weight_updated' &&
          (e.payload as { reason: string }).reason === 'flag_penalty'
      );
      expect(weightEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit weight_updated on recalibration', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });
      votingWithEvents.registerAgent('agent-1');

      // Need 3+ tasks for recalibration
      votingWithEvents.updatePerformance('agent-1', 'success');
      votingWithEvents.updatePerformance('agent-1', 'success');
      votingWithEvents.updatePerformance('agent-1', 'failure');

      mockBus.events.length = 0; // Clear previous events

      votingWithEvents.recalibrateWeights();

      const recalibrationEvents = mockBus.events.filter(
        (e) =>
          e.topic === 'byzantine.weight_updated' &&
          (e.payload as { reason: string }).reason === 'recalibration'
      );
      expect(recalibrationEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit pattern_detected for collusion', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });

      votingWithEvents.registerAgent('agent-1');
      votingWithEvents.registerAgent('agent-2');
      votingWithEvents.registerAgent('agent-3');
      votingWithEvents.registerAgent('agent-4');
      votingWithEvents.registerAgent('agent-5');

      // Create collusion pattern: >60% identical votes
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 0.77, reasoning: 'R1' }],
        ['agent-2', { decision: 'approve', confidence: 0.77, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.77, reasoning: 'R3' }],
        ['agent-4', { decision: 'approve', confidence: 0.77, reasoning: 'R4' }],
        ['agent-5', { decision: 'reject', confidence: 0.5, reasoning: 'R5' }],
      ]);

      votingWithEvents.weightedConsensus(votes);

      const patternEvents = mockBus.events.filter((e) => e.topic === 'byzantine.pattern_detected');
      expect(patternEvents.length).toBeGreaterThanOrEqual(1);
      expect(patternEvents[0]?.payload).toMatchObject({
        patternType: 'collusion',
      });
    });

    it('should emit collusion_suspected for collusion pattern', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });

      votingWithEvents.registerAgent('agent-1');
      votingWithEvents.registerAgent('agent-2');
      votingWithEvents.registerAgent('agent-3');
      votingWithEvents.registerAgent('agent-4');
      votingWithEvents.registerAgent('agent-5');

      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', confidence: 0.77, reasoning: 'R1' }],
        ['agent-2', { decision: 'approve', confidence: 0.77, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.77, reasoning: 'R3' }],
        ['agent-4', { decision: 'approve', confidence: 0.77, reasoning: 'R4' }],
        ['agent-5', { decision: 'reject', confidence: 0.5, reasoning: 'R5' }],
      ]);

      votingWithEvents.weightedConsensus(votes);

      const collusionEvents = mockBus.events.filter(
        (e) => e.topic === 'byzantine.collusion_suspected'
      );
      expect(collusionEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should not emit events when emitEvents is false', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus, emitEvents: false });
      votingWithEvents.registerAgent('agent-1');

      votingWithEvents.updatePerformance('agent-1', 'success');

      expect(mockBus.events).toHaveLength(0);
    });

    it('should emit pattern_detected for contrarian Byzantine behavior', () => {
      const mockBus = createMockEventBus();
      const votingWithEvents = new WeightedVoting({ eventBus: mockBus });

      votingWithEvents.registerAgent('agent-1');
      votingWithEvents.registerAgent('agent-2');
      votingWithEvents.registerAgent('agent-3');
      votingWithEvents.registerAgent('agent-4');

      // Flag agent-1 twice
      votingWithEvents.flagByzantine('agent-1', 'Reason 1');
      votingWithEvents.flagByzantine('agent-1', 'Reason 2');

      mockBus.events.length = 0; // Clear previous events

      // agent-1 votes against majority with low confidence
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'reject', confidence: 0.2, reasoning: 'R1' }],
        ['agent-2', { decision: 'approve', confidence: 0.9, reasoning: 'R2' }],
        ['agent-3', { decision: 'approve', confidence: 0.9, reasoning: 'R3' }],
        ['agent-4', { decision: 'approve', confidence: 0.9, reasoning: 'R4' }],
      ]);

      votingWithEvents.weightedConsensus(votes);

      const patternEvents = mockBus.events.filter((e) => e.topic === 'byzantine.pattern_detected');
      expect(patternEvents.length).toBeGreaterThanOrEqual(1);
      expect(patternEvents[0]?.payload).toMatchObject({
        patternType: 'contrarian',
      });
    });
  });
});
