/**
 * Tests for the consensus vote adapter (#3648).
 * Forces real voters (no simulation); maps outcome → {approved, approvalPercentage}.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  makeVoteAdapter,
  buildVoteInput,
  retryOnNoQuorum,
  type VoteRunner,
  type VoteVerdict,
} from './remediation-vote-adapter.js';

describe('buildVoteInput', () => {
  it('forces real voters (simulateVotes false) and the requested strategy', () => {
    const input = buildVoteInput('remediate X', 'unanimous');
    expect(input.simulateVotes).toBe(false);
    expect(input.strategy).toBe('unanimous');
    expect(input.proposal).toBe('remediate X');
  });

  it('opts into absolute_quorum so an errored voice degrades to no_quorum (#4138)', () => {
    // Anti-DoS: a voter you can knock offline can only force a re-run, never flip
    // an autonomous-execution gate.
    expect(buildVoteInput('remediate X', 'higher_order').errorPolicy).toBe('absolute_quorum');
    expect(buildVoteInput('p', 'unanimous').errorPolicy).toBe('absolute_quorum');
  });

  it('passes through each priority algorithm as the strategy', () => {
    expect(buildVoteInput('p', 'supermajority').strategy).toBe('supermajority');
    expect(buildVoteInput('p', 'higher_order').strategy).toBe('higher_order');
    expect(buildVoteInput('p', 'simple_majority').strategy).toBe('simple_majority');
  });
});

describe('makeVoteAdapter', () => {
  it('forwards proposal + algorithm to the runner and returns its verdict', async () => {
    const runner = vi.fn<VoteRunner>(async () =>
      Promise.resolve({ approved: true, approvalPercentage: 100 })
    );
    const vote = makeVoteAdapter(runner);
    const r = await vote({ proposal: 'fix the floor', algorithm: 'higher_order' });
    expect(r).toEqual({ approved: true, approvalPercentage: 100 });
    expect(runner).toHaveBeenCalledWith('fix the floor', 'higher_order');
  });

  it('surfaces a rejection verdict', async () => {
    const vote = makeVoteAdapter(async () =>
      Promise.resolve({ approved: false, approvalPercentage: 42 })
    );
    expect(await vote({ proposal: 'p', algorithm: 'unanimous' })).toEqual({
      approved: false,
      approvalPercentage: 42,
    });
  });

  it('carries the runner decision (incl. no_quorum) through to the gate (#4138)', async () => {
    const vote = makeVoteAdapter(async () =>
      Promise.resolve({ approved: false, approvalPercentage: 0, decision: 'no_quorum' })
    );
    expect(await vote({ proposal: 'p', algorithm: 'higher_order' })).toEqual({
      approved: false,
      approvalPercentage: 0,
      decision: 'no_quorum',
    });
  });
});

describe('retryOnNoQuorum (#4138)', () => {
  it('does NOT re-run when the first verdict is decisive (approved)', async () => {
    const runVote = vi.fn<() => Promise<VoteVerdict>>(async () =>
      Promise.resolve({ approved: true, approvalPercentage: 100, decision: 'approved' })
    );
    const v = await retryOnNoQuorum(runVote, 1);
    expect(v.approved).toBe(true);
    expect(runVote).toHaveBeenCalledTimes(1); // no wasted re-run on a clean verdict
  });

  it('re-runs a no_quorum void and returns a recovered verdict (transient blip)', async () => {
    const runVote = vi
      .fn<() => Promise<VoteVerdict>>()
      .mockResolvedValueOnce({ approved: false, approvalPercentage: 0, decision: 'no_quorum' })
      .mockResolvedValueOnce({ approved: true, approvalPercentage: 100, decision: 'approved' });
    const v = await retryOnNoQuorum(runVote, 1);
    expect(v).toEqual({ approved: true, approvalPercentage: 100, decision: 'approved' });
    expect(runVote).toHaveBeenCalledTimes(2); // initial + one re-run, then stops
  });

  it('returns the terminal no_quorum after exactly maxRetries re-runs (persistent)', async () => {
    const runVote = vi.fn<() => Promise<VoteVerdict>>(async () =>
      Promise.resolve({ approved: false, approvalPercentage: 0, decision: 'no_quorum' })
    );
    const v = await retryOnNoQuorum(runVote, 1);
    expect(v.decision).toBe('no_quorum'); // still degraded → caller makes it a terminal skip
    expect(runVote).toHaveBeenCalledTimes(2); // initial + exactly 1 re-run, bounded
  });
});
