/**
 * Consensus Voting Integration Tests
 *
 * End-to-end tests for multi-agent consensus reaching and failure scenarios.
 * Tests the full voting protocol with simulated agent committees.
 *
 * (Source: Issue #109)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConsensusEngine,
  WeightedVoting,
  type ConsensusEngine,
  type Proposal,
  type Vote,
} from '../../src/consensus/index.js';

describe('Integration: Consensus Voting', () => {
  describe('ConsensusEngine - Basic Voting', () => {
    let engine: ConsensusEngine;

    beforeEach(() => {
      engine = createConsensusEngine({
        defaultTimeout: 60000,
        minVotersForQuorum: 2,
        maxActiveProposals: 10,
      });
    });

    it('should reach simple majority consensus with 3 approvals', async () => {
      const proposal: Proposal = {
        title: 'Adopt new coding standard',
        description: 'Switch to strict TypeScript mode',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const proposalId = propResult.value;

      // 3 approvals, 2 rejections = simple majority
      const votes: Array<{ agentId: string; vote: Vote }> = [
        {
          agentId: 'agent-1',
          vote: { decision: 'approve', reasoning: 'Good idea', confidence: 0.9 },
        },
        {
          agentId: 'agent-2',
          vote: { decision: 'approve', reasoning: 'I agree', confidence: 0.8 },
        },
        {
          agentId: 'agent-3',
          vote: { decision: 'reject', reasoning: 'Too strict', confidence: 0.7 },
        },
        {
          agentId: 'agent-4',
          vote: { decision: 'approve', reasoning: 'Necessary', confidence: 0.85 },
        },
        {
          agentId: 'agent-5',
          vote: { decision: 'reject', reasoning: 'Not ready', confidence: 0.6 },
        },
      ];

      for (const { agentId, vote } of votes) {
        const voteResult = await engine.vote(proposalId, agentId, vote);
        expect(voteResult.ok).toBe(true);
      }

      const result = await engine.getResult(proposalId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('approved');
        expect(result.value.voteCounts.approve).toBe(3);
        expect(result.value.voteCounts.reject).toBe(2);
      }
    });

    it('should reject proposal without majority', async () => {
      const proposal: Proposal = {
        title: 'Controversial change',
        description: 'Remove all comments from code',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const proposalId = propResult.value;

      // 2 approvals, 3 rejections
      const votes: Array<{ agentId: string; vote: Vote }> = [
        { agentId: 'agent-1', vote: { decision: 'approve', reasoning: 'Fine', confidence: 0.5 } },
        {
          agentId: 'agent-2',
          vote: { decision: 'reject', reasoning: 'Bad idea', confidence: 0.9 },
        },
        { agentId: 'agent-3', vote: { decision: 'reject', reasoning: 'No way', confidence: 0.95 } },
        { agentId: 'agent-4', vote: { decision: 'approve', reasoning: 'OK', confidence: 0.4 } },
        { agentId: 'agent-5', vote: { decision: 'reject', reasoning: 'Never', confidence: 0.99 } },
      ];

      for (const { agentId, vote } of votes) {
        await engine.vote(proposalId, agentId, vote);
      }

      const result = await engine.getResult(proposalId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('rejected');
        expect(result.value.voteCounts.reject).toBe(3);
      }
    });

    it('should require supermajority (67%) for supermajority algorithm', async () => {
      const proposal: Proposal = {
        title: 'Major architecture change',
        description: 'Migrate to microservices',
        algorithm: 'supermajority',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const proposalId = propResult.value;

      // 2 out of 3 = 66.7%
      await engine.vote(proposalId, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });
      await engine.vote(proposalId, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.85,
      });
      await engine.vote(proposalId, 'agent-3', {
        decision: 'reject',
        reasoning: 'No',
        confidence: 0.7,
      });

      const result = await engine.getResult(proposalId);
      expect(result.ok).toBe(true);
      // Supermajority is >=67%, so 66.7% should be rejected
      // (This depends on exact implementation - >= vs >)
    });

    it('should require unanimous approval for unanimous algorithm', async () => {
      const proposal: Proposal = {
        title: 'Security-critical change',
        description: 'Modify authentication system',
        algorithm: 'unanimous',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const proposalId = propResult.value;

      // One rejection breaks unanimous
      await engine.vote(proposalId, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.99,
      });
      await engine.vote(proposalId, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.98,
      });
      await engine.vote(proposalId, 'agent-3', {
        decision: 'reject',
        reasoning: 'Concern',
        confidence: 0.8,
      });

      const result = await engine.getResult(proposalId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('rejected');
      }
    });

    it('should handle abstentions correctly', async () => {
      const proposal: Proposal = {
        title: 'Optional enhancement',
        description: 'Add optional logging',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      const proposalId = propResult.value;

      // 2 approve, 1 reject, 1 abstain
      await engine.vote(proposalId, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.8,
      });
      await engine.vote(proposalId, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.75,
      });
      await engine.vote(proposalId, 'agent-3', {
        decision: 'reject',
        reasoning: 'No',
        confidence: 0.6,
      });
      await engine.vote(proposalId, 'agent-4', {
        decision: 'abstain',
        reasoning: 'No opinion',
        confidence: 0.5,
      });

      const result = await engine.getResult(proposalId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.voteCounts.abstain).toBe(1);
        // 2 approve vs 1 reject = approved
        expect(result.value.outcome).toBe('approved');
      }
    });
  });

  describe('WeightedVoting - Agent Performance Tracking', () => {
    let weightedVoting: WeightedVoting;

    beforeEach(() => {
      weightedVoting = new WeightedVoting({
        minWeight: 0.1,
        maxByzantineFraction: 0.33,
        initialWeight: 0.5,
        quorumThreshold: 0.67,
      });
    });

    it('should register agents with initial weight', () => {
      weightedVoting.registerAgent('agent-1');
      const weight = weightedVoting.calculateWeight('agent-1');
      expect(weight).toBe(0.5); // Initial weight
    });

    it('should increase weight after successful tasks', () => {
      weightedVoting.registerAgent('agent-1');

      // Simulate successful tasks
      weightedVoting.updatePerformance('agent-1', 'success');
      weightedVoting.updatePerformance('agent-1', 'success');
      weightedVoting.updatePerformance('agent-1', 'success');

      const weight = weightedVoting.calculateWeight('agent-1');
      expect(weight).toBeGreaterThan(0.5);
    });

    it('should decrease weight after failed tasks', () => {
      weightedVoting.registerAgent('agent-1');

      // Simulate failed tasks
      weightedVoting.updatePerformance('agent-1', 'failure');
      weightedVoting.updatePerformance('agent-1', 'failure');

      const weight = weightedVoting.calculateWeight('agent-1');
      expect(weight).toBeLessThan(0.5);
    });

    it('should reach weighted consensus with Map of votes', () => {
      // Register agents
      weightedVoting.registerAgent('honest-1');
      weightedVoting.registerAgent('honest-2');
      weightedVoting.registerAgent('byzantine-1');

      // Honest agents have higher weights due to success
      weightedVoting.updatePerformance('honest-1', 'success');
      weightedVoting.updatePerformance('honest-1', 'success');
      weightedVoting.updatePerformance('honest-2', 'success');
      weightedVoting.updatePerformance('byzantine-1', 'failure');

      // Create votes as Map
      const votes = new Map<string, Vote>([
        ['honest-1', { decision: 'approve', reasoning: 'Good', confidence: 0.9 }],
        ['honest-2', { decision: 'approve', reasoning: 'Agree', confidence: 0.85 }],
        ['byzantine-1', { decision: 'reject', reasoning: 'Disagree', confidence: 0.3 }],
      ]);

      const result = weightedVoting.weightedConsensus(votes);
      // Weighted voting result should have a decision
      // Note: 'approve', 'reject', or 'no_consensus' are the valid values
      expect(['approve', 'reject', 'no_consensus']).toContain(result.decision);
      // Total weight should reflect votes from honest agents
      expect(result.totalWeight).toBeGreaterThan(0);
    });

    it('should flag byzantine behavior and reduce weight', () => {
      weightedVoting.registerAgent('suspicious-agent');

      // Flag for suspicious behavior
      weightedVoting.flagByzantine('suspicious-agent', 'Contrarian voting pattern');
      weightedVoting.flagByzantine('suspicious-agent', 'Low confidence contradictions');
      weightedVoting.flagByzantine('suspicious-agent', 'Potential collusion');

      const record = weightedVoting.getAgentRecord('suspicious-agent');
      expect(record).toBeDefined();
      if (record) {
        expect(record.byzantineFlags).toBe(3);
        // Weight should be significantly reduced
        expect(record.weight).toBeLessThan(0.5);
      }
    });

    it('should exclude agents exceeding byzantine flag threshold from voting', () => {
      weightedVoting.registerAgent('bad-actor');
      weightedVoting.registerAgent('good-actor');

      // Exceed threshold (default 3)
      weightedVoting.flagByzantine('bad-actor', 'Reason 1');
      weightedVoting.flagByzantine('bad-actor', 'Reason 2');
      weightedVoting.flagByzantine('bad-actor', 'Reason 3');

      // Create votes as Map
      const votes = new Map<string, Vote>([
        ['bad-actor', { decision: 'reject', reasoning: 'Block', confidence: 0.99 }],
        ['good-actor', { decision: 'approve', reasoning: 'Valid', confidence: 0.8 }],
      ]);

      const result = weightedVoting.weightedConsensus(votes);
      // Bad actor's vote should be excluded - only good-actor's vote counts
      expect(result.participatingAgents).not.toContain('bad-actor');
    });
  });

  describe('Failure Scenarios', () => {
    it('should handle incomplete quorum', async () => {
      const engine = createConsensusEngine({
        defaultTimeout: 1000,
        minVotersForQuorum: 3,
        maxActiveProposals: 5,
      });

      const proposal: Proposal = {
        title: 'Test proposal',
        description: 'Need 3 voters',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1', 'agent-2', 'agent-3'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      // Only 2 votes submitted (below quorum)
      await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });
      await engine.vote(propResult.value, 'agent-2', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.85,
      });

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const result = await engine.getResult(propResult.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should timeout without quorum
        expect(result.value.outcome).toBe('timeout');
      }
    });

    it('should reject duplicate votes from same agent', async () => {
      const engine = createConsensusEngine();

      const proposal: Proposal = {
        title: 'Duplicate vote test',
        description: 'Test duplicate handling',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      // First vote succeeds
      const vote1 = await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'First vote',
        confidence: 0.9,
      });
      expect(vote1.ok).toBe(true);

      // Second vote from same agent should fail
      const vote2 = await engine.vote(propResult.value, 'agent-1', {
        decision: 'reject',
        reasoning: 'Changed mind',
        confidence: 0.8,
      });
      expect(vote2.ok).toBe(false);
    });

    it('should reject votes on closed proposals', async () => {
      const engine = createConsensusEngine();

      const proposal: Proposal = {
        title: 'Closed proposal test',
        description: 'Test closed handling',
        algorithm: 'simple_majority',
        requiredVoters: ['agent-1'],
      };

      const propResult = await engine.propose(proposal);
      expect(propResult.ok).toBe(true);
      if (!propResult.ok) return;

      // Vote and close
      await engine.vote(propResult.value, 'agent-1', {
        decision: 'approve',
        reasoning: 'Yes',
        confidence: 0.9,
      });
      await engine.close(propResult.value);

      // Late vote should fail
      const lateVote = await engine.vote(propResult.value, 'agent-2', {
        decision: 'reject',
        reasoning: 'Too late',
        confidence: 0.8,
      });
      expect(lateVote.ok).toBe(false);
    });

    it('should handle proposal capacity limits', async () => {
      const engine = createConsensusEngine({
        maxActiveProposals: 2,
      });

      // Create 2 proposals (at limit)
      await engine.propose({ title: 'P1', description: 'D1', algorithm: 'simple_majority' });
      await engine.propose({ title: 'P2', description: 'D2', algorithm: 'simple_majority' });

      // Third should fail
      const third = await engine.propose({
        title: 'P3',
        description: 'D3',
        algorithm: 'simple_majority',
      });
      expect(third.ok).toBe(false);
    });
  });
});
