/**
 * Tests for the consensus vote adapter (#3648).
 * Forces real voters (no simulation); maps outcome → {approved, approvalPercentage}.
 */

import { describe, it, expect, vi } from 'vitest';
import { makeVoteAdapter, buildVoteInput, type VoteRunner } from './remediation-vote-adapter.js';

describe('buildVoteInput', () => {
  it('forces real voters (simulateVotes false) and the requested strategy', () => {
    const input = buildVoteInput('remediate X', 'unanimous');
    expect(input.simulateVotes).toBe(false);
    expect(input.strategy).toBe('unanimous');
    expect(input.proposal).toBe('remediate X');
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
});
