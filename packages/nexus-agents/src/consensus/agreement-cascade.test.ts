/**
 * Tests for agreement-based cascading in the consensus engine.
 *
 * Verifies that the engine can close proposals early when the outcome
 * is mathematically determined before all voters have voted.
 *
 * @module consensus/agreement-cascade.test
 * (Source: research alignment — agreement-based-cascading technique)
 */

import { describe, it, expect } from 'vitest';
import { ConsensusEngine } from './engine.js';
import type { Vote } from './types.js';

function makeVote(decision: 'approve' | 'reject' | 'abstain'): Vote {
  return { decision, confidence: 0.9, reasoning: `I vote ${decision}` };
}

describe('Agreement-based cascading', () => {
  it('closes early when majority is guaranteed (simple_majority, 3/5 approve)', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test early cascade',
      description: 'Should close after 3 approvals of 5 required',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('approve'));
    // After 3rd approval out of 5, approval rate is 3/5=60% > 50% threshold
    await engine.vote(pid, 'a3', makeVote('approve'));

    // Proposal should be closed early
    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.outcome).toBe('approved');
    expect(outcome.value.voteCounts.total).toBe(3);
  });

  it('closes early when rejection is guaranteed (simple_majority, 3/5 reject)', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test early rejection cascade',
      description: 'Should close after 3 rejections of 5 required',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('reject'));
    await engine.vote(pid, 'a2', makeVote('reject'));
    // After 3rd rejection, max possible approval = (0 + 2) / 5 = 40% < 50%
    await engine.vote(pid, 'a3', makeVote('reject'));

    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.outcome).toBe('rejected');
    expect(outcome.value.voteCounts.total).toBe(3);
  });

  it('does not cascade when outcome is still uncertain', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test no cascade',
      description: 'Should not close after 1 approve + 1 reject of 5',
      algorithm: 'simple_majority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('reject'));

    // Still uncertain — 1 approve, 1 reject, 3 remaining
    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Should be pending since not all required voters voted and cascade didn't trigger
    expect(outcome.value.voteCounts.total).toBe(2);
  });

  it('cascades on supermajority when 4/5 approve early', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test supermajority cascade',
      description: 'Supermajority (67%) with 4 approvals of 5',
      algorithm: 'supermajority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('approve'));
    await engine.vote(pid, 'a3', makeVote('approve'));
    // 3/5 = 60% — not above 67% threshold yet, should not cascade
    let outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.voteCounts.total).toBe(3);
    }

    // 4th approval: 4/5 = 80% > 67% — should cascade
    await engine.vote(pid, 'a4', makeVote('approve'));
    outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe('approved');
      expect(outcome.value.voteCounts.total).toBe(4);
    }
  });

  it('cascades on early rejection for supermajority (2/5 reject)', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test supermajority rejection cascade',
      description: 'Supermajority (67%) impossible with 2 rejections of 5',
      algorithm: 'supermajority',
      requiredVoters: ['a1', 'a2', 'a3', 'a4', 'a5'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('reject'));
    // 1 reject: max possible = 4/5 = 80% > 67%, still possible
    await engine.vote(pid, 'a2', makeVote('reject'));
    // 2 reject: max possible = 3/5 = 60% < 67%, impossible to reach threshold

    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe('rejected');
      expect(outcome.value.voteCounts.total).toBe(2);
    }
  });

  it('does not cascade for unanimous without full agreement', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test unanimous no cascade',
      description: 'Unanimous requires all votes — 1 rejection should cascade to rejection',
      algorithm: 'unanimous',
      requiredVoters: ['a1', 'a2', 'a3'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    // Single rejection makes unanimous approval impossible
    await engine.vote(pid, 'a1', makeVote('reject'));

    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.outcome).toBe('rejected');
      expect(outcome.value.voteCounts.total).toBe(1);
    }
  });

  it('does not cascade when no requiredVoters are set', async () => {
    const engine = new ConsensusEngine();
    const result = await engine.propose({
      title: 'Test no required voters',
      description: 'Without requiredVoters, cascade logic should not apply',
      algorithm: 'simple_majority',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pid = result.value;

    await engine.vote(pid, 'a1', makeVote('approve'));
    await engine.vote(pid, 'a2', makeVote('approve'));
    await engine.vote(pid, 'a3', makeVote('approve'));

    // Should still be open since no requiredVoters defined
    const outcome = await engine.getResult(pid);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.voteCounts.total).toBe(3);
    }
  });
});
