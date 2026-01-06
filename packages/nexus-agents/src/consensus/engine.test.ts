/**
 * nexus-agents/consensus - Unit Tests
 *
 * Tests for consensus engine and voting strategies.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConsensusEngine,
  ConsensusError,
  createConsensusEngine,
  SimpleMajorityStrategy,
  SupermajorityStrategy,
  UnanimousStrategy,
  ProofOfLearningStrategy,
  VotingStrategyFactory,
  calculateVoteWeight,
  type Vote,
  type Proposal,
  type AgentPerformance,
} from './index.js';

describe('ConsensusEngine', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 2,
      maxActiveProposals: 10,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('propose', () => {
    it('should create a proposal with generated ID', async () => {
      const proposal: Proposal = {
        title: 'Test Proposal',
        description: 'A test proposal for voting',
        algorithm: 'simple_majority',
      };

      const result = await engine.propose(proposal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatch(/^prop_[a-z0-9]+_[a-z0-9]+$/);
      }
    });

    it('should use provided proposal ID', async () => {
      const proposal: Proposal = {
        id: 'custom-id-123',
        title: 'Test Proposal',
        description: 'A test proposal',
        algorithm: 'simple_majority',
      };

      const result = await engine.propose(proposal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('custom-id-123');
      }
    });

    it('should reject invalid proposals', async () => {
      const proposal = {
        title: '', // Empty title - invalid
        description: 'A test',
        algorithm: 'simple_majority',
      } as Proposal;

      const result = await engine.propose(proposal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConsensusError);
        expect(result.error.message).toContain('Invalid proposal');
      }
    });

    it('should reject when max active proposals reached', async () => {
      // Create max proposals
      for (let i = 0; i < 10; i++) {
        await engine.propose({
          title: `Proposal ${String(i)}`,
          description: 'Test',
          algorithm: 'simple_majority',
        });
      }

      const result = await engine.propose({
        title: 'One more',
        description: 'Should fail',
        algorithm: 'simple_majority',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Maximum active proposals');
      }
    });
  });

  describe('vote', () => {
    it('should accept valid votes', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const vote: Vote = {
        decision: 'approve',
        reasoning: 'Looks good to me',
        confidence: 0.9,
      };

      const voteResult = await engine.vote(propResult.value, 'agent-1', vote);

      expect(voteResult.ok).toBe(true);
    });

    it('should reject invalid votes', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      if (!propResult.ok) return;

      const vote = {
        decision: 'approve',
        reasoning: '', // Empty reasoning - invalid
        confidence: 0.9,
      } as Vote;

      const voteResult = await engine.vote(propResult.value, 'agent-1', vote);

      expect(voteResult.ok).toBe(false);
    });

    it('should reject votes for non-existent proposals', async () => {
      const vote: Vote = {
        decision: 'approve',
        reasoning: 'Test',
        confidence: 0.8,
      };

      const result = await engine.vote('non-existent', 'agent-1', vote);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should allow multiple agents to vote', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      if (!propResult.ok) return;

      const agents = ['agent-1', 'agent-2', 'agent-3'];
      for (const agentId of agents) {
        const result = await engine.vote(propResult.value, agentId, {
          decision: 'approve',
          reasoning: 'Approved',
          confidence: 0.8,
        });
        expect(result.ok).toBe(true);
      }

      const status = await engine.getResult(propResult.value);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value.voteCounts.approve).toBe(3);
      }
    });

    it('should auto-close when all required voters vote', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1', 'agent-2'],
      });

      if (!propResult.ok) return;

      await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });

      await engine.vote(propResult.value, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });

      const result = await engine.getResult(propResult.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('approved');
      }
    });
  });

  describe('close', () => {
    it('should close proposal and return final result', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      if (!propResult.ok) return;

      await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });

      await engine.vote(propResult.value, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.8,
      });

      const closeResult = await engine.close(propResult.value);

      expect(closeResult.ok).toBe(true);
      if (closeResult.ok) {
        expect(closeResult.value.outcome).toBe('approved');
        expect(closeResult.value.voteCounts.approve).toBe(2);
        expect(closeResult.value.approvalPercentage).toBe(100);
      }
    });

    it('should reject proposal when quorum not reached', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      if (!propResult.ok) return;

      // Only one vote, quorum is 2
      await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });

      const closeResult = await engine.close(propResult.value);

      expect(closeResult.ok).toBe(true);
      if (closeResult.ok) {
        expect(closeResult.value.outcome).toBe('rejected');
        expect(closeResult.value.quorumReached).toBe(false);
      }
    });
  });

  describe('timeout handling', () => {
    it('should timeout proposal after configured duration', async () => {
      const propResult = await engine.propose({
        title: 'Test',
        description: 'Test',
        algorithm: 'simple_majority',
        timeout: 5000,
      });

      if (!propResult.ok) return;

      // Advance time past timeout
      vi.advanceTimersByTime(6000);

      const result = await engine.getResult(propResult.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('timeout');
      }
    });
  });

  describe('metrics', () => {
    it('should track proposal metrics', async () => {
      // Create and close an approved proposal
      const prop1 = await engine.propose({
        title: 'Test 1',
        description: 'Test',
        algorithm: 'simple_majority',
      });

      if (prop1.ok) {
        await engine.vote(prop1.value, 'agent-1', {
          decision: 'approve',
          reasoning: 'Yes',
          confidence: 0.9,
        });
        await engine.vote(prop1.value, 'agent-2', {
          decision: 'approve',
          reasoning: 'Yes',
          confidence: 0.9,
        });
        await engine.close(prop1.value);
      }

      // Create and close a rejected proposal
      const prop2 = await engine.propose({
        title: 'Test 2',
        description: 'Test',
        algorithm: 'unanimous',
      });

      if (prop2.ok) {
        await engine.vote(prop2.value, 'agent-1', {
          decision: 'approve',
          reasoning: 'Yes',
          confidence: 0.9,
        });
        await engine.vote(prop2.value, 'agent-2', {
          decision: 'reject',
          reasoning: 'No',
          confidence: 0.9,
        });
        await engine.close(prop2.value);
      }

      const metrics = engine.getMetrics();

      expect(metrics.totalProposals).toBe(2);
      expect(metrics.approvedProposals).toBe(1);
      expect(metrics.rejectedProposals).toBe(1);
      expect(metrics.algorithmUsage.simple_majority).toBe(1);
      expect(metrics.algorithmUsage.unanimous).toBe(1);
    });
  });

  describe('agent performance tracking', () => {
    it('should track agent performance', () => {
      engine.updateAgentPerformance('agent-1', true);
      engine.updateAgentPerformance('agent-1', true);
      engine.updateAgentPerformance('agent-1', false);

      const performance = engine.getAgentPerformance('agent-1');

      expect(performance).toBeDefined();
      if (performance) {
        expect(performance.totalVotes).toBe(3);
        expect(performance.correctVotes).toBe(2);
        expect(performance.successRate).toBeCloseTo(0.667, 2);
      }
    });
  });
});

describe('Voting Strategies', () => {
  describe('SimpleMajorityStrategy', () => {
    const strategy = new SimpleMajorityStrategy();

    it('should approve when >50% vote approve', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'reject', reasoning: 'No', confidence: 0.7 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(true);
      expect(outcome.approvalPercentage).toBeCloseTo(66.67, 1);
    });

    it('should reject when <=50% vote approve', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'reject', reasoning: 'No', confidence: 0.8 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(false);
      expect(outcome.approvalPercentage).toBe(50);
    });

    it('should exclude abstentions from count', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'abstain', reasoning: 'Skip', confidence: 0.5 }],
        ['agent-3', { decision: 'abstain', reasoning: 'Skip', confidence: 0.5 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(true);
      expect(outcome.approvalPercentage).toBe(100);
      expect(outcome.voteCounts.abstain).toBe(2);
    });
  });

  describe('SupermajorityStrategy', () => {
    const strategy = new SupermajorityStrategy();

    it('should approve when >=67% vote approve', () => {
      // 3 out of 4 votes = 75% approval
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'approve', reasoning: 'Yes', confidence: 0.7 }],
        ['agent-4', { decision: 'reject', reasoning: 'No', confidence: 0.7 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(true);
      expect(outcome.approvalPercentage).toBe(75);
    });

    it('should reject when <67% vote approve', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'reject', reasoning: 'No', confidence: 0.7 }],
        ['agent-4', { decision: 'reject', reasoning: 'No', confidence: 0.7 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(false);
      expect(outcome.approvalPercentage).toBe(50);
    });
  });

  describe('UnanimousStrategy', () => {
    const strategy = new UnanimousStrategy();

    it('should approve when all votes are approve', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'approve', reasoning: 'Yes', confidence: 0.7 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(true);
    });

    it('should reject with any rejection', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'reject', reasoning: 'No', confidence: 0.7 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(false);
      expect(outcome.reason).toContain('rejection');
    });

    it('should allow abstentions without blocking approval', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'approve', reasoning: 'Yes', confidence: 0.8 }],
        ['agent-3', { decision: 'abstain', reasoning: 'Skip', confidence: 0.5 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(true);
    });

    it('should reject with only abstentions', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'abstain', reasoning: 'Skip', confidence: 0.5 }],
        ['agent-2', { decision: 'abstain', reasoning: 'Skip', confidence: 0.5 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(false);
      expect(outcome.reason).toContain('No approvals');
    });
  });

  describe('ProofOfLearningStrategy', () => {
    const strategy = new ProofOfLearningStrategy();

    it('should weight votes by agent performance', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'reject', reasoning: 'No', confidence: 0.8 }],
      ]);

      // Agent-1 has higher weight (better performance)
      const weights = new Map<string, number>([
        ['agent-1', 1.0],
        ['agent-2', 0.6],
      ]);

      const outcome = strategy.calculateOutcome(votes, weights);

      expect(outcome.approved).toBe(true);
      expect(outcome.weightedCounts).toBeDefined();
      if (outcome.weightedCounts) {
        expect(outcome.weightedCounts.approve).toBe(1.0);
        expect(outcome.weightedCounts.reject).toBe(0.6);
      }
    });

    it('should use default weight when no weights provided', () => {
      const votes = new Map<string, Vote>([
        ['agent-1', { decision: 'approve', reasoning: 'Yes', confidence: 0.9 }],
        ['agent-2', { decision: 'reject', reasoning: 'No', confidence: 0.8 }],
      ]);

      const outcome = strategy.calculateOutcome(votes);

      expect(outcome.approved).toBe(false); // 50-50 split doesn't exceed threshold
    });
  });

  describe('calculateVoteWeight', () => {
    it('should return 1.0 for new agents', () => {
      expect(calculateVoteWeight(undefined)).toBe(1.0);
    });

    it('should calculate weight based on success rate', () => {
      const performance: AgentPerformance = {
        agentId: 'agent-1',
        totalVotes: 100,
        correctVotes: 80,
        successRate: 0.8,
        lastUpdated: new Date().toISOString(),
      };

      const weight = calculateVoteWeight(performance);

      // 0.5 + (0.8 * 0.5) = 0.9
      expect(weight).toBeCloseTo(0.9, 2);
    });

    it('should return 0.5 for 0% success rate', () => {
      const performance: AgentPerformance = {
        agentId: 'agent-1',
        totalVotes: 10,
        correctVotes: 0,
        successRate: 0,
        lastUpdated: new Date().toISOString(),
      };

      const weight = calculateVoteWeight(performance);

      expect(weight).toBe(0.5);
    });

    it('should return 1.0 for 100% success rate', () => {
      const performance: AgentPerformance = {
        agentId: 'agent-1',
        totalVotes: 50,
        correctVotes: 50,
        successRate: 1.0,
        lastUpdated: new Date().toISOString(),
      };

      const weight = calculateVoteWeight(performance);

      expect(weight).toBe(1.0);
    });
  });

  describe('VotingStrategyFactory', () => {
    it('should return correct strategy for each algorithm', () => {
      const factory = new VotingStrategyFactory();

      expect(factory.getStrategy('simple_majority')).toBeInstanceOf(SimpleMajorityStrategy);
      expect(factory.getStrategy('supermajority')).toBeInstanceOf(SupermajorityStrategy);
      expect(factory.getStrategy('unanimous')).toBeInstanceOf(UnanimousStrategy);
      expect(factory.getStrategy('proof_of_learning')).toBeInstanceOf(ProofOfLearningStrategy);
    });

    it('should list all available algorithms', () => {
      const factory = new VotingStrategyFactory();
      const algorithms = factory.getAvailableAlgorithms();

      expect(algorithms).toContain('simple_majority');
      expect(algorithms).toContain('supermajority');
      expect(algorithms).toContain('unanimous');
      expect(algorithms).toContain('proof_of_learning');
    });
  });
});
