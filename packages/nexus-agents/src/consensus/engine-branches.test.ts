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
      setCurrentModelPins: vi.fn(),
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
      setCurrentModelPins: vi.fn(),
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
      setCurrentModelPins: vi.fn(),
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

// ============================================================================
// 7. Agreement-based cascading (canCascadeEarly)
// ============================================================================

describe('agreement-based cascading', () => {
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

  it('cascades early approval when enough approvals to guarantee outcome', async () => {
    // simple_majority threshold = 0.5
    // 5 required voters — if 3 approve out of 5, minApprovalRate = 3/5 = 0.6 > 0.5
    // Even if remaining 2 reject, still passes. So cascade after 3rd approve.
    const result = await engine.propose(
      createProposal({
        algorithm: 'simple_majority',
        requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = result.value;
    await engine.vote(id, 'a1', approveVote());
    await engine.vote(id, 'a2', approveVote());

    // After 3rd approve, cascade should trigger auto-close
    await engine.vote(id, 'a3', approveVote());

    // Proposal should be closed with approved outcome
    const outcome = await engine.getResult(id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe('approved');
    }

    // Attempting to vote should fail (closed)
    const lateVote = await engine.vote(id, 'a4', rejectVote());
    expect(lateVote.ok).toBe(false);
  });

  it('cascades early rejection when approval is mathematically impossible', async () => {
    // supermajority threshold = 0.67
    // 5 required voters — if 2 reject, maxPossibleApprovals = approvals + remaining
    // After 2 rejects: approvals=0, remaining=3, max=3/5=0.6 < 0.67 → can never pass
    const result = await engine.propose(
      createProposal({
        algorithm: 'supermajority',
        requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = result.value;
    await engine.vote(id, 'a1', rejectVote());
    // After 2nd reject: max possible = (0 + 3) / 5 = 0.6 < 0.67
    await engine.vote(id, 'a2', rejectVote());

    const outcome = await engine.getResult(id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe('rejected');
    }
  });

  it('does not cascade when no required voters set', async () => {
    const result = await engine.propose(createProposal({ algorithm: 'simple_majority' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = result.value;
    await engine.vote(id, 'a1', approveVote());
    await engine.vote(id, 'a2', approveVote());

    // Without requiredVoters, proposal stays open
    expect(engine.getActiveProposalCount()).toBe(1);
  });

  it('does not cascade when outcome is still uncertain', async () => {
    // supermajority threshold = 0.67
    // 5 voters, 1 approve, 1 reject — remaining=3, maxRate=(1+3)/5=0.8 > 0.67
    // minRate=1/5=0.2 < 0.67 — neither path triggers
    const result = await engine.propose(
      createProposal({
        algorithm: 'supermajority',
        requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = result.value;
    await engine.vote(id, 'a1', approveVote());
    await engine.vote(id, 'a2', rejectVote());

    // Should still be active — uncertain outcome
    expect(engine.getActiveProposalCount()).toBe(1);
  });
});

// ============================================================================
// 8. Incremental quorum expansion (tryExpandQuorum)
// ============================================================================

describe('incremental quorum expansion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not expand when quorum is disabled', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
      incrementalQuorum: {
        enabled: false,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.15,
      },
    });

    const callback = vi.fn();
    engine.setVoterExpansionCallback(callback);

    const result = await engine.propose(createProposal({ requiredVoters: ['a1', 'a2'] }));
    if (!result.ok) return;

    // Low-confidence votes to trigger ambiguity if quorum were enabled
    await engine.vote(result.value, 'a1', approveVote(0.4));
    await engine.vote(result.value, 'a2', rejectVote(0.4));

    // Callback should NOT be called (disabled)
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not expand when no callback is set', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.15,
      },
    });

    // No callback set
    const result = await engine.propose(createProposal({ requiredVoters: ['a1', 'a2'] }));
    if (!result.ok) return;

    await engine.vote(result.value, 'a1', approveVote(0.4));
    // After both vote, should auto-close (no expansion possible)
    await engine.vote(result.value, 'a2', rejectVote(0.4));

    // Proposal auto-closed since expansion couldn't happen
    const outcome = await engine.getResult(result.value);
    expect(outcome.ok).toBe(true);
  });

  it('expands voter pool when voting is ambiguous', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.9, // High threshold → low confidence triggers
        ambiguityBand: 0.3, // Wide band → approval rate near threshold triggers
      },
    });

    const callback = vi.fn().mockResolvedValue(['a3', 'a4']);
    engine.setVoterExpansionCallback(callback);

    const result = await engine.propose(
      createProposal({
        algorithm: 'simple_majority',
        requiredVoters: ['a1', 'a2'],
      })
    );
    if (!result.ok) return;

    // Split vote with low confidence → ambiguous
    await engine.vote(result.value, 'a1', approveVote(0.5));
    await engine.vote(result.value, 'a2', rejectVote(0.5));

    // Callback should have been called to expand
    expect(callback).toHaveBeenCalledWith(result.value, 2, 2);

    // Proposal should still be active (waiting for expanded voters)
    expect(engine.getActiveProposalCount()).toBe(1);
  });

  it('closes immediately when expansion returns no new voters', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.9,
        ambiguityBand: 0.3,
      },
    });

    const callback = vi.fn().mockResolvedValue([]); // No new voters
    engine.setVoterExpansionCallback(callback);

    const result = await engine.propose(
      createProposal({
        algorithm: 'simple_majority',
        requiredVoters: ['a1', 'a2'],
      })
    );
    if (!result.ok) return;

    await engine.vote(result.value, 'a1', approveVote(0.5));
    await engine.vote(result.value, 'a2', rejectVote(0.5));

    expect(callback).toHaveBeenCalled();

    // Should have closed (no expansion possible)
    const outcome = await engine.getResult(result.value);
    expect(outcome.ok).toBe(true);
  });

  it('stops expanding after maxExpansionRounds', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 1,
        votersPerExpansion: 1,
        confidenceThreshold: 0.9,
        ambiguityBand: 0.3,
      },
    });

    let callCount = 0;
    const callback = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve([`new-voter-${String(callCount)}`]);
    });
    engine.setVoterExpansionCallback(callback);

    const result = await engine.propose(
      createProposal({
        algorithm: 'simple_majority',
        requiredVoters: ['a1', 'a2'],
      })
    );
    if (!result.ok) return;

    // Round 1: ambiguous → expand
    await engine.vote(result.value, 'a1', approveVote(0.5));
    await engine.vote(result.value, 'a2', rejectVote(0.5));
    expect(callback).toHaveBeenCalledTimes(1);

    // New voter votes, still ambiguous — but max rounds (1) reached
    await engine.vote(result.value, 'new-voter-1', approveVote(0.5));

    // Should NOT expand further (maxExpansionRounds=1 reached)
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 9. handleTimeout race — timeout after close
// ============================================================================

describe('handleTimeout after close', () => {
  it('is a no-op when proposal is already closed', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 5000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
    });

    const result = await engine.propose(createProposal({ timeout: 5000 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Close manually before timeout
    await engine.vote(result.value, 'a1', approveVote());
    await engine.close(result.value);

    const metricsBefore = engine.getMetrics();

    // Now advance past timeout — should be a no-op
    vi.advanceTimersByTime(6000);

    const metricsAfter = engine.getMetrics();
    // timedOutProposals should NOT have incremented
    expect(metricsAfter.timedOutProposals).toBe(metricsBefore.timedOutProposals);
    vi.useRealTimers();
  });
});

// ============================================================================
// 10. closeInternal on already-closed proposal
// ============================================================================

describe('close on already-closed proposal', () => {
  it('returns the cached result without error', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 1,
      maxActiveProposals: 10,
    });

    const result = await engine.propose(createProposal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await engine.vote(result.value, 'a1', approveVote());
    const firstClose = await engine.close(result.value);
    expect(firstClose.ok).toBe(true);

    // Close again — should return cached result
    const secondClose = await engine.close(result.value);
    expect(secondClose.ok).toBe(true);
    if (firstClose.ok && secondClose.ok) {
      expect(secondClose.value.outcome).toBe(firstClose.value.outcome);
    }
    vi.useRealTimers();
  });
});

// ============================================================================
// 11. Metrics edge cases
// ============================================================================

describe('metrics edge cases', () => {
  it('returns zero averages when no proposals are completed', () => {
    const engine = createConsensusEngine();
    const metrics = engine.getMetrics();
    expect(metrics.averageDurationMs).toBe(0);
    expect(metrics.averageVotesPerProposal).toBe(0);
  });

  it('tracks timeout in metrics via timer', async () => {
    vi.useFakeTimers();
    const engine = createConsensusEngine({
      defaultTimeout: 1000,
      minVotersForQuorum: 2,
      maxActiveProposals: 10,
    });

    await engine.propose(createProposal({ timeout: 1000 }));
    vi.advanceTimersByTime(2000);

    const metrics = engine.getMetrics();
    expect(metrics.timedOutProposals).toBe(1);
    expect(metrics.totalProposals).toBe(1);
    vi.useRealTimers();
  });
});
