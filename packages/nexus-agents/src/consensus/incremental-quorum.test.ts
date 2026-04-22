/**
 * Tests for incremental quorum feature (Issue #1408).
 *
 * Covers: ambiguity detection, voter expansion, expansion cap,
 * fallback when expansion unavailable, and integration with engine.
 */

import { describe, it, expect, vi } from 'vitest';
import { isVotingAmbiguous } from './incremental-quorum.js';
import { createConsensusEngine } from './engine.js';
import type { Vote, VoterExpansionCallback } from './types.js';

// ============================================================================
// Ambiguity Detection
// ============================================================================

describe('isVotingAmbiguous', () => {
  const makeVotes = (approves: number, rejects: number, confidence = 0.8): Map<string, Vote> => {
    const votes = new Map<string, Vote>();
    for (let i = 0; i < approves; i++) {
      votes.set(`approve-${String(i)}`, {
        decision: 'approve',
        reasoning: 'good',
        confidence,
      });
    }
    for (let i = 0; i < rejects; i++) {
      votes.set(`reject-${String(i)}`, {
        decision: 'reject',
        reasoning: 'bad',
        confidence,
      });
    }
    return votes;
  };

  it('detects ambiguity when approval rate is near threshold', () => {
    // 2 approve, 2 reject out of 5 = 40% approval
    // supermajority threshold = 67%, band = 0.15
    // 40% is within [52%, 82%]? No. 40% < 52% → not ambiguous by band.
    // But let's use simple_majority (50%): 40% is within [35%, 65%] → ambiguous
    const votes = makeVotes(2, 2);
    expect(
      isVotingAmbiguous(votes, 5, 0.5, { confidenceThreshold: 0.6, ambiguityBand: 0.15 })
    ).toBe(true);
  });

  it('detects ambiguity when confidence is low', () => {
    // 3 approve, 1 reject = 75% approval → above 67% threshold
    // But confidence is 0.4 (below 0.6) → ambiguous
    const votes = makeVotes(3, 1, 0.4);
    expect(
      isVotingAmbiguous(votes, 5, 0.67, { confidenceThreshold: 0.6, ambiguityBand: 0.15 })
    ).toBe(true);
  });

  it('returns false when clearly approved with high confidence', () => {
    // 5 approve, 0 reject = 100% → well above 67%+15%=82%
    const votes = makeVotes(5, 0, 0.9);
    expect(
      isVotingAmbiguous(votes, 5, 0.67, { confidenceThreshold: 0.6, ambiguityBand: 0.15 })
    ).toBe(false);
  });

  it('returns false when clearly rejected with high confidence', () => {
    const votes = makeVotes(0, 4, 0.9);
    expect(
      isVotingAmbiguous(votes, 5, 0.5, { confidenceThreshold: 0.6, ambiguityBand: 0.15 })
    ).toBe(false);
  });

  it('returns false with zero votes', () => {
    const votes = new Map<string, Vote>();
    expect(
      isVotingAmbiguous(votes, 5, 0.5, { confidenceThreshold: 0.6, ambiguityBand: 0.15 })
    ).toBe(false);
  });
});

// ============================================================================
// Engine Integration
// ============================================================================

describe('ConsensusEngine incremental quorum', () => {
  function makeVote(decision: 'approve' | 'reject', confidence = 0.8): Vote {
    return { decision, reasoning: `${decision} vote`, confidence };
  }

  it('expands voters when ambiguity detected', async () => {
    const expansionCallback = vi.fn<VoterExpansionCallback>(() =>
      Promise.resolve(['extra-1', 'extra-2'])
    );

    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.2,
      },
    });

    engine.setVoterExpansionCallback(expansionCallback);

    const result = await engine.propose({
      title: 'Ambiguous proposal',
      description: 'This should trigger expansion',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    // Cast split votes to create ambiguity
    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    await engine.vote(pid, 'a3', makeVote('approve'));
    await engine.vote(pid, 'a4', makeVote('reject'));
    // 4 of 5 voted: 2-2 split → ambiguous at simple_majority

    // Last original voter tips it
    await engine.vote(pid, 'a5', makeVote('approve'));
    // 3-2 = 60% approve with simple_majority=50% → within ambiguity band (0.2)
    // Average confidence = 0.8 ≥ 0.6 → no low-confidence trigger
    // But 60% is within [30%, 70%] band → ambiguous

    // Engine should have requested expansion
    expect(expansionCallback).toHaveBeenCalledWith(pid, 5, 2);
  });

  it('caps expansion at maxExpansionRounds', async () => {
    let callCount = 0;
    const expansionCallback = vi.fn<VoterExpansionCallback>(() => {
      callCount++;
      return Promise.resolve([`extra-${String(callCount)}-1`, `extra-${String(callCount)}-2`]);
    });

    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 1,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.3,
      },
    });

    engine.setVoterExpansionCallback(expansionCallback);

    const result = await engine.propose({
      title: 'Capped expansion',
      description: 'Only 1 expansion round allowed',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    if (!result.ok) return;
    const pid = result.value;

    // 1 approve, 1 reject, 1 approve → 67% with simple_majority=50%
    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    await engine.vote(pid, 'a3', makeVote('approve'));

    // Should expand once (maxExpansionRounds=1)
    expect(expansionCallback).toHaveBeenCalledTimes(1);

    // After expansion, vote the new voters
    await engine.vote(pid, 'extra-1-1', makeVote('reject'));
    await engine.vote(pid, 'extra-1-2', makeVote('reject'));
    // Now 2-3 = 40% → would be ambiguous again, but max rounds reached

    // Should NOT expand again
    expect(expansionCallback).toHaveBeenCalledTimes(1);
  });

  it('falls back gracefully when expansion returns no new voters', async () => {
    const expansionCallback = vi.fn<VoterExpansionCallback>(() => Promise.resolve([]));

    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.3,
      },
    });

    engine.setVoterExpansionCallback(expansionCallback);

    const result = await engine.propose({
      title: 'No expansion available',
      description: 'Callback returns empty array',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    await engine.vote(pid, 'a3', makeVote('approve'));

    // Should still close normally despite ambiguity
    const closeResult = await engine.close(pid);
    expect(closeResult.ok).toBe(true);
    if (closeResult.ok) {
      expect(closeResult.value.outcome).toBe('approved');
    }
  });

  it('closes the proposal when voterExpansionCallback throws', async () => {
    const expansionCallback = vi.fn<VoterExpansionCallback>(() =>
      Promise.reject(new Error('voter registry offline'))
    );

    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.3,
      },
    });

    engine.setVoterExpansionCallback(expansionCallback);

    const result = await engine.propose({
      title: 'Callback throws',
      description: 'Should not crash the vote path',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    // Third vote triggers tryExpandQuorum → callback rejects.
    const voteResult = await engine.vote(pid, 'a3', makeVote('approve'));
    expect(voteResult.ok).toBe(true);

    // Proposal closed normally (no expansion, no crash).
    const closeResult = await engine.getResult(pid);
    expect(closeResult.ok).toBe(true);
    if (closeResult.ok) {
      expect(closeResult.value.outcome).toBe('approved');
    }
  });

  it('closes the proposal when voterExpansionCallback throws synchronously', async () => {
    const expansionCallback = vi.fn<VoterExpansionCallback>(() => {
      throw new Error('sync crash');
    });

    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      incrementalQuorum: {
        enabled: true,
        maxExpansionRounds: 2,
        votersPerExpansion: 2,
        confidenceThreshold: 0.6,
        ambiguityBand: 0.3,
      },
    });

    engine.setVoterExpansionCallback(expansionCallback);

    const result = await engine.propose({
      title: 'Callback sync-throws',
      description: 'Should not crash the vote path',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    const voteResult = await engine.vote(pid, 'a3', makeVote('approve'));
    expect(voteResult.ok).toBe(true);
  });

  it('does not expand when quorum is disabled', async () => {
    const engine = createConsensusEngine({
      defaultTimeout: 60000,
      // No incrementalQuorum config → disabled by default
    });

    const result = await engine.propose({
      title: 'No quorum expansion',
      description: 'Should not expand',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    await engine.vote(pid, 'a3', makeVote('approve'));

    // Should auto-close (all required voters voted)
    const closeResult = await engine.getResult(pid);
    expect(closeResult.ok).toBe(true);
  });
});
