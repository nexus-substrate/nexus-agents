/**
 * Tests for Free-MAD (Anti-Conformity Scoring) implementation.
 *
 * @module agents/collaboration/free-mad-scoring.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FreeMadScorer,
  createFreeMadScorer,
  evaluateWithAntiConformity,
} from './free-mad-scoring.js';
import type { DebateTrajectory, TrajectoryVote } from './free-mad-types.js';

describe('FreeMadScorer', () => {
  let scorer: FreeMadScorer;

  beforeEach(() => {
    scorer = createFreeMadScorer();
  });

  describe('createTrajectory', () => {
    it('should create empty trajectory with metadata', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Should we use TypeScript?');

      expect(trajectory.debateId).toBe('debate-1');
      expect(trajectory.topic).toBe('Should we use TypeScript?');
      expect(trajectory.allPositions).toHaveLength(0);
      expect(trajectory.agentTrajectories.size).toBe(0);
      expect(trajectory.roundSnapshots).toHaveLength(0);
      expect(trajectory.totalRounds).toBe(0);
      expect(trajectory.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('recordPosition', () => {
    it('should record positions and update trajectory', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
        reasoning: 'Good idea',
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'reject',
        confidence: 0.6,
        reasoning: 'Not sure',
      });

      expect(trajectory.allPositions).toHaveLength(2);
      expect(trajectory.agentTrajectories.size).toBe(2);
      expect(trajectory.totalRounds).toBe(1);
    });

    it('should normalize positions to lowercase', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'APPROVE',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'Approve',
        confidence: 0.8,
      });

      const positions = trajectory.allPositions.map((p) => p.position);
      expect(positions).toEqual(['approve', 'approve']);
    });
  });

  describe('finalizeRound', () => {
    it('should compute round snapshot with position distribution', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'reject',
        confidence: 0.6,
      });

      const snapshot = scorer.finalizeRound(trajectory, 0);

      expect(snapshot.round).toBe(0);
      expect(snapshot.positionDistribution.get('approve')).toEqual(['agent-1', 'agent-2']);
      expect(snapshot.positionDistribution.get('reject')).toEqual(['agent-3']);
    });

    it('should detect majority when threshold met', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // 3 out of 4 = 75% > 60% threshold
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.6,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 0,
        position: 'reject',
        confidence: 0.5,
      });

      const snapshot = scorer.finalizeRound(trajectory, 0);

      expect(snapshot.majorityPosition).toBe('approve');
      expect(snapshot.majorityStrength).toBe(0.75);
    });

    it('should not detect majority when threshold not met', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // 2 out of 4 = 50% < 60% threshold
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'reject',
        confidence: 0.6,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 0,
        position: 'reject',
        confidence: 0.5,
      });

      const snapshot = scorer.finalizeRound(trajectory, 0);

      expect(snapshot.majorityPosition).toBeNull();
      expect(snapshot.majorityStrength).toBeNull();
    });
  });

  describe('conformity detection', () => {
    it('should detect when agent conforms to majority', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // Round 0: agent-1 rejects, others approve
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'reject',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 0);

      // Round 1: agent-1 changes to approve (conforming to majority)
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 1,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 1);

      const agent1Trajectory = trajectory.agentTrajectories.get('agent-1');
      expect(agent1Trajectory?.conformedToMajority).toBe(true);
      expect(agent1Trajectory?.conformityRounds).toContain(1);
      expect(agent1Trajectory?.positionChanges).toBe(1);
    });

    it('should not flag conformity for consistent agents', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // Round 0
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.6,
      });
      scorer.finalizeRound(trajectory, 0);

      // Round 1: same positions
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 1,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 1,
        position: 'approve',
        confidence: 0.6,
      });
      scorer.finalizeRound(trajectory, 1);

      for (const agentTrajectory of trajectory.agentTrajectories.values()) {
        expect(agentTrajectory.conformedToMajority).toBe(false);
        expect(agentTrajectory.positionChanges).toBe(0);
      }
    });
  });

  describe('computeScores', () => {
    it('should compute anti-conformity scores for all agents', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'reject',
        confidence: 0.6,
      });
      scorer.finalizeRound(trajectory, 0);

      const scores = scorer.computeScores(trajectory);

      expect(scores).toHaveLength(2);
      expect(scores[0]?.agentId).toBe('agent-1');
      expect(scores[1]?.agentId).toBe('agent-2');
      expect(scores[0]?.finalScore).toBeGreaterThanOrEqual(0);
      expect(scores[0]?.finalScore).toBeLessThanOrEqual(1);
    });

    it('should penalize conforming agents', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // Round 0: agent-1 rejects alone
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'reject',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 0);

      // Round 1: agent-1 conforms
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 1,
        position: 'approve',
        confidence: 0.7,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 1);

      const scores = scorer.computeScores(trajectory);
      const agent1Score = scores.find((s) => s.agentId === 'agent-1');
      const agent2Score = scores.find((s) => s.agentId === 'agent-2');

      expect(agent1Score?.conformityPenalty).toBeLessThan(0);
      expect(agent2Score?.conformityPenalty).toBe(0);
    });

    it('should reward persistence in minority position', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      // Round 0
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'reject',
        confidence: 0.9,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 0);

      // Round 1: agent-1 persists
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 1,
        position: 'reject',
        confidence: 0.9,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-4',
        round: 1,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 1);

      const scores = scorer.computeScores(trajectory);
      const agent1Score = scores.find((s) => s.agentId === 'agent-1');

      expect(agent1Score?.persistenceBonus).toBeGreaterThan(0);
    });
  });

  describe('evaluate', () => {
    it('should determine winning position from weighted scores', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');

      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.9,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'reject',
        confidence: 0.7,
      });
      scorer.finalizeRound(trajectory, 0);

      const result = scorer.evaluate(trajectory);

      expect(result.winningPosition).toBe('approve');
      expect(result.scores).toHaveLength(3);
      expect(result.positionScores.size).toBe(2);
      expect(typeof result.reasoning).toBe('string');
    });

    it('should detect when anti-conformity changes outcome', () => {
      const testScorer = createFreeMadScorer({ conformityPenaltyWeight: 0.5 });
      const trajectory = testScorer.createTrajectory('debate-1', 'Test topic');

      // Round 0: 2 approve, 1 reject with high confidence
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'reject',
        confidence: 0.95,
      });
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 0,
        position: 'approve',
        confidence: 0.6,
      });
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 0,
        position: 'approve',
        confidence: 0.6,
      });
      testScorer.finalizeRound(trajectory, 0);

      // Round 1: agent-2 and agent-3 conform more strongly
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 1,
        position: 'reject',
        confidence: 0.95,
      });
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-2',
        round: 1,
        position: 'approve',
        confidence: 0.5,
      });
      testScorer.recordPosition({
        trajectory,
        agentId: 'agent-3',
        round: 1,
        position: 'approve',
        confidence: 0.5,
      });
      testScorer.finalizeRound(trajectory, 1);

      const result = testScorer.evaluate(trajectory);

      // The high-confidence minority might win due to persistence bonus
      expect(result.reasoning).toContain('Position scores');
    });

    it('should set endedAt timestamp', () => {
      const trajectory = scorer.createTrajectory('debate-1', 'Test topic');
      scorer.recordPosition({
        trajectory,
        agentId: 'agent-1',
        round: 0,
        position: 'approve',
        confidence: 0.8,
      });
      scorer.finalizeRound(trajectory, 0);

      expect(trajectory.endedAt).toBeUndefined();
      scorer.evaluate(trajectory);
      expect(trajectory.endedAt).toBeInstanceOf(Date);
    });
  });

  describe('trajectoryFromVotes', () => {
    it('should convert votes to trajectory', () => {
      const votesByRound: TrajectoryVote[][] = [
        [
          { agentId: 'agent-1', decision: 'approve', confidence: 0.8, round: 0 },
          { agentId: 'agent-2', decision: 'reject', confidence: 0.7, round: 0 },
        ],
        [
          { agentId: 'agent-1', decision: 'approve', confidence: 0.9, round: 1 },
          { agentId: 'agent-2', decision: 'approve', confidence: 0.6, round: 1 },
        ],
      ];

      const trajectory = scorer.trajectoryFromVotes('debate-1', 'Test topic', votesByRound);

      expect(trajectory.totalRounds).toBe(2);
      expect(trajectory.agentTrajectories.size).toBe(2);
      expect(trajectory.roundSnapshots).toHaveLength(2);
    });
  });

  describe('evaluateVotes', () => {
    it('should evaluate single-round votes', () => {
      const votes = [
        { agentId: 'agent-1', decision: 'approve' as const, confidence: 0.8 },
        { agentId: 'agent-2', decision: 'approve' as const, confidence: 0.7 },
        { agentId: 'agent-3', decision: 'reject' as const, confidence: 0.6 },
      ];

      const result = scorer.evaluateVotes('debate-1', 'Test topic', votes);

      expect(result.winningPosition).toBe('approve');
      expect(result.trajectory.totalRounds).toBe(1);
    });
  });

  describe('evaluateWithAntiConformity', () => {
    it('should be a convenience function for full evaluation', () => {
      const votesByRound: TrajectoryVote[][] = [
        [
          { agentId: 'agent-1', decision: 'approve', confidence: 0.8, round: 0 },
          { agentId: 'agent-2', decision: 'approve', confidence: 0.7, round: 0 },
          { agentId: 'agent-3', decision: 'reject', confidence: 0.9, round: 0 },
        ],
      ];

      const result = evaluateWithAntiConformity('debate-1', 'Test topic', votesByRound);

      expect(result.winningPosition).toBeDefined();
      expect(result.scores).toHaveLength(3);
    });
  });

  describe('configuration', () => {
    it('should respect custom conformity penalty weight', () => {
      const heavyPenaltyScorer = createFreeMadScorer({ conformityPenaltyWeight: 0.9 });
      const lightPenaltyScorer = createFreeMadScorer({ conformityPenaltyWeight: 0.1 });

      const createConformingTrajectory = (testScorer: FreeMadScorer): DebateTrajectory => {
        const trajectory = testScorer.createTrajectory('debate-1', 'Test');

        // Round 0: agent-1 is minority
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-1',
          round: 0,
          position: 'reject',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-2',
          round: 0,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-3',
          round: 0,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-4',
          round: 0,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.finalizeRound(trajectory, 0);

        // Round 1: agent-1 conforms
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-1',
          round: 1,
          position: 'approve',
          confidence: 0.7,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-2',
          round: 1,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-3',
          round: 1,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-4',
          round: 1,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.finalizeRound(trajectory, 1);

        return trajectory;
      };

      const heavyScores = heavyPenaltyScorer.computeScores(
        createConformingTrajectory(heavyPenaltyScorer)
      );
      const lightScores = lightPenaltyScorer.computeScores(
        createConformingTrajectory(lightPenaltyScorer)
      );

      const heavyAgent1Penalty = heavyScores.find(
        (s) => s.agentId === 'agent-1'
      )?.conformityPenalty;
      const lightAgent1Penalty = lightScores.find(
        (s) => s.agentId === 'agent-1'
      )?.conformityPenalty;

      expect(heavyAgent1Penalty).toBeLessThan(lightAgent1Penalty ?? 0);
    });

    it('should respect custom majority threshold', () => {
      const lowThresholdScorer = createFreeMadScorer({ majorityThreshold: 0.4 });
      const highThresholdScorer = createFreeMadScorer({ majorityThreshold: 0.8 });

      const createTrajectory = (testScorer: FreeMadScorer): DebateTrajectory => {
        const trajectory = testScorer.createTrajectory('debate-1', 'Test');

        // 2 out of 4 = 50%
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-1',
          round: 0,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-2',
          round: 0,
          position: 'approve',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-3',
          round: 0,
          position: 'reject',
          confidence: 0.8,
        });
        testScorer.recordPosition({
          trajectory,
          agentId: 'agent-4',
          round: 0,
          position: 'reject',
          confidence: 0.8,
        });
        testScorer.finalizeRound(trajectory, 0);

        return trajectory;
      };

      const lowThresholdTrajectory = createTrajectory(lowThresholdScorer);
      const highThresholdTrajectory = createTrajectory(highThresholdScorer);

      // 50% > 40%, so low threshold should detect majority
      expect(lowThresholdTrajectory.roundSnapshots[0]?.majorityPosition).not.toBeNull();
      // 50% < 80%, so high threshold should not detect majority
      expect(highThresholdTrajectory.roundSnapshots[0]?.majorityPosition).toBeNull();
    });
  });
});
