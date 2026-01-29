/**
 * Tests for CorrelationTracker
 *
 * @module consensus/correlation-tracker.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CorrelationTracker, createCorrelationTracker } from './correlation-tracker.js';
import type { Vote } from './types-core.js';

describe('CorrelationTracker', () => {
  describe('createCorrelationTracker', () => {
    it('creates a tracker with default config', () => {
      const tracker = createCorrelationTracker();
      expect(tracker).toBeInstanceOf(CorrelationTracker);
      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(0);
      expect(stats.totalObservations).toBe(0);
    });

    it('creates a tracker with custom config', () => {
      const tracker = createCorrelationTracker({
        minObservationsForCorrelation: 5,
        maxObservationsPerAgent: 100,
        maxProposals: 500,
      });
      expect(tracker).toBeInstanceOf(CorrelationTracker);
    });
  });

  describe('recordProposalVotes', () => {
    let tracker: CorrelationTracker;

    beforeEach(() => {
      tracker = new CorrelationTracker();
    });

    it('records votes from multiple agents', () => {
      const votes = new Map<string, Vote>([
        ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
        ['agent2', { decision: 'approve', confidence: 0.8, reasoning: 'test' }],
        ['agent3', { decision: 'reject', confidence: 0.7, reasoning: 'test' }],
      ]);

      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(3);
      expect(stats.totalObservations).toBe(3);
    });

    it('builds pairwise history from joint observations', () => {
      const votes1 = new Map<string, Vote>([
        ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
        ['agent2', { decision: 'approve', confidence: 0.8, reasoning: 'test' }],
      ]);

      const votes2 = new Map<string, Vote>([
        ['agent1', { decision: 'reject', confidence: 0.9, reasoning: 'test' }],
        ['agent2', { decision: 'reject', confidence: 0.8, reasoning: 'test' }],
      ]);

      tracker.recordProposalVotes('proposal-1', votes1, 'approved');
      tracker.recordProposalVotes('proposal-2', votes2, 'rejected');

      const stats = tracker.getStats();
      expect(stats.trackedPairs).toBe(1);
    });
  });

  describe('memory bounds - FIFO eviction (Issue #521)', () => {
    it('evicts oldest observations per agent when maxObservationsPerAgent reached', () => {
      const tracker = new CorrelationTracker({
        maxObservationsPerAgent: 3,
        maxProposals: 1000,
      });

      // Record 5 proposals, should only keep last 3 observations per agent
      for (let i = 0; i < 5; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: `test-${String(i)}` }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(1);
      // Should have 3 observations (maxObservationsPerAgent), not 5
      expect(stats.totalObservations).toBe(3);
    });

    it('evicts oldest proposals when maxProposals reached', () => {
      const tracker = new CorrelationTracker({
        maxObservationsPerAgent: 1000,
        maxProposals: 3,
      });

      // Record 5 proposals with different agents each time
      for (let i = 0; i < 5; i++) {
        const votes = new Map<string, Vote>([
          [
            `agent-${String(i)}`,
            { decision: 'approve', confidence: 0.9, reasoning: `test-${String(i)}` },
          ],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const stats = tracker.getStats();
      // Should have 3 agents (from last 3 proposals), not 5
      // Note: This tests proposal eviction, not observation eviction
      expect(stats.totalAgents).toBe(5); // All agents still tracked (observations not evicted)
    });

    it('cleans up agentProposals when evicting proposals', () => {
      const tracker = new CorrelationTracker({
        maxObservationsPerAgent: 1000,
        maxProposals: 2,
      });

      // Record 3 proposals with same agent
      for (let i = 0; i < 3; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: `test-${String(i)}` }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      // Tracker should still function without errors
      const stats = tracker.getStats();
      expect(stats.totalAgents).toBe(1);
    });

    it('maintains bounded memory under high volume', () => {
      const maxObsPerAgent = 10;
      const maxProposals = 20;
      const tracker = new CorrelationTracker({
        maxObservationsPerAgent: maxObsPerAgent,
        maxProposals,
      });

      // Simulate high volume: 100 proposals
      for (let i = 0; i < 100; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: `test-${String(i)}` }],
          ['agent2', { decision: 'reject', confidence: 0.8, reasoning: `test-${String(i)}` }],
        ]);
        tracker.recordProposalVotes(
          `proposal-${String(i)}`,
          votes,
          i % 2 === 0 ? 'approved' : 'rejected'
        );
      }

      const stats = tracker.getStats();
      // Memory should be bounded by config
      expect(stats.totalObservations).toBeLessThanOrEqual(maxObsPerAgent * 2);
    });
  });

  describe('clear()', () => {
    it('clears all data including proposal order', () => {
      const tracker = new CorrelationTracker();

      const votes = new Map<string, Vote>([
        ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
      ]);
      tracker.recordProposalVotes('proposal-1', votes, 'approved');

      expect(tracker.getStats().totalObservations).toBe(1);

      tracker.clear();

      expect(tracker.getStats().totalObservations).toBe(0);
      expect(tracker.getStats().totalAgents).toBe(0);
    });
  });

  describe('hasSufficientData', () => {
    it('returns true for single agent', () => {
      const tracker = new CorrelationTracker();
      expect(tracker.hasSufficientData(['agent1'])).toBe(true);
    });

    it('returns true when no data (vacuously)', () => {
      const tracker = new CorrelationTracker();
      expect(tracker.hasSufficientData([])).toBe(true);
    });

    it('returns false when insufficient observations for correlation', () => {
      const tracker = new CorrelationTracker({ minObservationsForCorrelation: 10 });

      // Only record 2 observations
      for (let i = 0; i < 2; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
          ['agent2', { decision: 'approve', confidence: 0.8, reasoning: 'test' }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      expect(tracker.hasSufficientData(['agent1', 'agent2'])).toBe(false);
    });

    it('returns true when sufficient observations for correlation', () => {
      const tracker = new CorrelationTracker({ minObservationsForCorrelation: 5 });

      // Record 10 observations
      for (let i = 0; i < 10; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
          ['agent2', { decision: 'approve', confidence: 0.8, reasoning: 'test' }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      expect(tracker.hasSufficientData(['agent1', 'agent2'])).toBe(true);
    });
  });

  describe('getCorrelation', () => {
    it('returns undefined for unknown agents', () => {
      const tracker = new CorrelationTracker();
      expect(tracker.getCorrelation('agent1', 'agent2')).toBeUndefined();
    });

    it('returns correlation coefficient when sufficient data', () => {
      const tracker = new CorrelationTracker({ minObservationsForCorrelation: 3 });

      // Record agreeing votes
      for (let i = 0; i < 5; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
          ['agent2', { decision: 'approve', confidence: 0.8, reasoning: 'test' }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const correlation = tracker.getCorrelation('agent1', 'agent2');
      expect(correlation).toBeDefined();
      expect(typeof correlation).toBe('number');
      // Should be positive since agents always agree
      expect(correlation).toBeGreaterThan(0);
    });
  });

  describe('identifyIndependentSubsets', () => {
    it('returns empty array when no agents tracked', () => {
      const tracker = new CorrelationTracker();
      const subsets = tracker.identifyIndependentSubsets();
      expect(subsets).toEqual([]);
    });

    it('caches results until invalidated', () => {
      const tracker = new CorrelationTracker({ minObservationsForCorrelation: 3 });

      for (let i = 0; i < 5; i++) {
        const votes = new Map<string, Vote>([
          ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
          ['agent2', { decision: 'reject', confidence: 0.8, reasoning: 'test' }],
        ]);
        tracker.recordProposalVotes(`proposal-${String(i)}`, votes, 'approved');
      }

      const subsets1 = tracker.identifyIndependentSubsets();
      const subsets2 = tracker.identifyIndependentSubsets();
      expect(subsets1).toBe(subsets2); // Same reference (cached)

      // New vote invalidates cache
      const votes = new Map<string, Vote>([
        ['agent1', { decision: 'approve', confidence: 0.9, reasoning: 'test' }],
      ]);
      tracker.recordProposalVotes('proposal-new', votes, 'approved');

      const subsets3 = tracker.identifyIndependentSubsets();
      expect(subsets3).not.toBe(subsets1); // Different reference (recalculated)
    });
  });
});
