/**
 * Branch coverage tests for ConsensusEngine and higher-order voting.
 *
 * Covers 6 previously uncovered branches:
 * 1. Vote on already-closed proposal
 * 2. getAgentPerformance returning undefined
 * 3. proof_of_learning via full engine flow
 * 4. Closed proposal LRU eviction
 * 5. Higher-order ISP-wins-over-OW branch
 * 6. fallbackToSimpleVoting: false path
 *
 * @module consensus/engine-branches.test
 * (Issue #1342)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConsensusEngine, createConsensusEngine, type Vote, type Proposal } from './index.js';
import { OWVoting } from './higher-order-voting.js';
import type {
  ICorrelationTracker,
  IndependentSubset,
  AgentPairKey,
  CorrelationMatrix,
} from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';

// ============================================================================
// Helpers
// ============================================================================

function approveVote(confidence = 0.9): Vote {
  return { decision: 'approve', reasoning: 'Approve', confidence };
}

function rejectVote(confidence = 0.9): Vote {
  return { decision: 'reject', reasoning: 'Reject', confidence };
}

function createProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    title: 'Test Proposal',
    description: 'A test proposal',
    algorithm: 'simple_majority',
    ...overrides,
  };
}

// ============================================================================
// 1. Vote on already-closed proposal
// ============================================================================

describe('vote on already-closed proposal', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns error when voting on a closed proposal', async () => {
    const result = await engine.propose(createProposal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposalId = result.value;
    await engine.vote(proposalId, 'agent-1', approveVote());
    await engine.close(proposalId);

    // Now try to vote on the closed proposal
    const voteResult = await engine.vote(proposalId, 'agent-2', approveVote());
    expect(voteResult.ok).toBe(false);
    if (!voteResult.ok) {
      expect(voteResult.error.message).toContain('already closed');
    }
  });

  it('returns not-found for proposal that was never created', async () => {
    const voteResult = await engine.vote('nonexistent-id', 'agent-1', approveVote());
    expect(voteResult.ok).toBe(false);
    if (!voteResult.ok) {
      expect(voteResult.error.message).toContain('not found');
    }
  });
});

// ============================================================================
// 2. getAgentPerformance returning undefined
// ============================================================================

describe('getAgentPerformance', () => {
  it('returns undefined for unknown agent', () => {
    const engine = createConsensusEngine();
    const perf = engine.getAgentPerformance('unknown-agent');
    expect(perf).toBeUndefined();
  });

  it('returns performance data for known agent', () => {
    const engine = createConsensusEngine();
    engine.updateAgentPerformance('agent-1', true);
    const perf = engine.getAgentPerformance('agent-1');
    expect(perf).toBeDefined();
    expect(perf?.agentId).toBe('agent-1');
    expect(perf?.totalVotes).toBe(1);
    expect(perf?.successRate).toBe(1.0);
  });

  it('updates performance across multiple votes', () => {
    const engine = createConsensusEngine();
    engine.updateAgentPerformance('agent-1', true);
    engine.updateAgentPerformance('agent-1', false);
    engine.updateAgentPerformance('agent-1', true);
    const perf = engine.getAgentPerformance('agent-1');
    expect(perf?.totalVotes).toBe(3);
    expect(perf?.correctVotes).toBe(2);
    expect(perf?.successRate).toBeCloseTo(2 / 3);
  });
});

// ============================================================================
// 3. proof_of_learning via full engine flow
// ============================================================================

describe('proof_of_learning via engine', () => {
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

  it('uses proof_of_learning algorithm with weighted votes', async () => {
    // Pre-populate agent performance so weights differ
    engine.updateAgentPerformance('agent-1', true);
    engine.updateAgentPerformance('agent-1', true);
    engine.updateAgentPerformance('agent-1', true);
    engine.updateAgentPerformance('agent-2', true);
    engine.updateAgentPerformance('agent-2', false);

    const result = await engine.propose(createProposal({ algorithm: 'proof_of_learning' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposalId = result.value;
    await engine.vote(proposalId, 'agent-1', approveVote(0.95));
    await engine.vote(proposalId, 'agent-2', rejectVote(0.6));

    const closeResult = await engine.close(proposalId);
    expect(closeResult.ok).toBe(true);
    if (!closeResult.ok) return;

    // Agent-1 has better performance, so its approve should carry more weight
    expect(closeResult.value.outcome).toBe('approved');
    expect(closeResult.value.proposal.algorithm).toBe('proof_of_learning');
  });

  it('records algorithm usage in metrics', async () => {
    const result = await engine.propose(createProposal({ algorithm: 'proof_of_learning' }));
    expect(result.ok).toBe(true);

    const metrics = engine.getMetrics();
    expect(metrics.algorithmUsage.proof_of_learning).toBe(1);
  });
});

// ============================================================================
// 4. Closed proposal LRU eviction
// ============================================================================

describe('closed proposal LRU eviction', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 20,
      maxClosedProposals: 3, // Low limit to trigger eviction
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts oldest closed proposals when limit exceeded', async () => {
    const ids: string[] = [];

    // Create and close 4 proposals (exceeds maxClosedProposals=3)
    for (let i = 0; i < 4; i++) {
      const result = await engine.propose(createProposal({ title: `Proposal ${String(i)}` }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      ids.push(result.value);
      await engine.vote(result.value, 'agent-1', approveVote());
      await engine.close(result.value);
    }

    // First proposal should have been evicted
    const firstResult = await engine.getResult(ids[0] ?? '');
    expect(firstResult.ok).toBe(false); // Evicted — not found

    // Last proposal should still be retrievable
    const lastResult = await engine.getResult(ids[3] ?? '');
    expect(lastResult.ok).toBe(true);
  });
});

// ============================================================================
// 5. Higher-order ISP-wins-over-OW branch
// ============================================================================

describe('OWVoting ISP-wins-over-OW branch', () => {
  it('returns ISP result when ISP confidence exceeds OW confidence', () => {
    const ow = new OWVoting({ config: { fallbackToSimpleVoting: true } });

    // Create votes where ISP subsets give a clearer signal
    const votes = new Map<string, Vote>();
    votes.set('agent-1', approveVote(0.99));
    votes.set('agent-2', approveVote(0.99));
    votes.set('agent-3', rejectVote(0.5)); // Weak rejection

    // Build a proper Map-based CorrelationMatrix
    const corrMatrix: CorrelationMatrix = new Map<AgentPairKey, number>();
    corrMatrix.set(createAgentPairKey('agent-1', 'agent-2'), 0.9);
    corrMatrix.set(createAgentPairKey('agent-1', 'agent-3'), 0.1);
    corrMatrix.set(createAgentPairKey('agent-2', 'agent-3'), 0.1);

    // Mock tracker with sufficient data and multiple independent subsets
    const tracker: ICorrelationTracker = {
      recordVote: vi.fn(),
      recordProposalVotes: vi.fn(),
      computeCorrelationMatrix: vi.fn().mockReturnValue(corrMatrix),
      getCorrelation: vi.fn(),
      identifyIndependentSubsets: vi.fn().mockReturnValue([
        {
          id: 'subset-1',
          agentIds: ['agent-1', 'agent-2'],
          independenceScore: 0.05,
          observationCount: 20,
        },
        { id: 'subset-2', agentIds: ['agent-3'], independenceScore: 0.5, observationCount: 20 },
      ] satisfies IndependentSubset[]),
      hasSufficientData: vi.fn().mockReturnValue(true),
      getStats: vi.fn(),
      clear: vi.fn(),
    };

    const result = ow.aggregate(votes, tracker);
    // With ISP having two confident subsets, the result should be approve
    expect(result.decision).toBe('approve');
    expect(result.reasoning).toBeTruthy();
  });
});

// ============================================================================
// 6. fallbackToSimpleVoting: false path
// ============================================================================

describe('OWVoting fallbackToSimpleVoting: false', () => {
  it('does not fall back when fallbackToSimpleVoting is false and data insufficient', () => {
    const ow = new OWVoting({ config: { fallbackToSimpleVoting: false } });

    const votes = new Map<string, Vote>();
    votes.set('agent-1', approveVote(0.9));
    votes.set('agent-2', rejectVote(0.8));

    // Tracker reports insufficient data — still need a valid Map for correlation matrix
    const emptyMatrix: CorrelationMatrix = new Map<AgentPairKey, number>();
    emptyMatrix.set(createAgentPairKey('agent-1', 'agent-2'), 0.0);

    const tracker: ICorrelationTracker = {
      recordVote: vi.fn(),
      recordProposalVotes: vi.fn(),
      computeCorrelationMatrix: vi.fn().mockReturnValue(emptyMatrix),
      getCorrelation: vi.fn(),
      identifyIndependentSubsets: vi.fn().mockReturnValue([]),
      hasSufficientData: vi.fn().mockReturnValue(false),
      getStats: vi.fn(),
      clear: vi.fn(),
    };

    // Should NOT fall back to simple voting — proceeds with correlation-based
    const result = ow.aggregate(votes, tracker);
    // Produces a valid result via OW path; with balanced votes (0.9 vs 0.8),
    // OW path may return 'no_consensus' when confidence is insufficient
    expect(result.decision).toBeDefined();
    expect(['approve', 'reject', 'abstain', 'no_consensus']).toContain(result.decision);
    // computeCorrelationMatrix SHOULD have been called (no fallback short-circuit)
    expect(tracker.computeCorrelationMatrix).toHaveBeenCalled();
  });

  it('falls back to simple voting when enabled and data insufficient', () => {
    const ow = new OWVoting({ config: { fallbackToSimpleVoting: true } });

    const votes = new Map<string, Vote>();
    votes.set('agent-1', approveVote(0.9));
    votes.set('agent-2', rejectVote(0.8));

    const tracker: ICorrelationTracker = {
      recordVote: vi.fn(),
      recordProposalVotes: vi.fn(),
      computeCorrelationMatrix: vi.fn(),
      getCorrelation: vi.fn(),
      identifyIndependentSubsets: vi.fn(),
      hasSufficientData: vi.fn().mockReturnValue(false),
      getStats: vi.fn(),
      clear: vi.fn(),
    };

    const result = ow.aggregate(votes, tracker);
    // Simple voting with 1 approve + 1 reject → depends on confidence
    expect(result.decision).toBeDefined();
    // computeCorrelationMatrix should NOT have been called (short-circuit)
    expect(tracker.computeCorrelationMatrix).not.toHaveBeenCalled();
  });
});
