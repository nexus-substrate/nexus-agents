/**
 * `consensus/decision/strategy` (#6000 step 1) — which bar a `consensus_vote`
 * call is measured against, imported DIRECTLY from the governed module.
 *
 * `resolveStrategy` was module-private in `mcp/tools/consensus-vote.ts`; this
 * is its first direct test. The `strategy`-discards-`threshold` case is pinned
 * on purpose: #5315 found it, and the governance table is written around it.
 */

import { describe, it, expect } from 'vitest';
import { getDefaultErrorPolicy, resolveStrategy, strategyToAlgorithm } from './strategy.js';
import { getDefaultErrorPolicy as fromMcpTypes } from '../../mcp/tools/consensus-vote-types.js';
import type { ConsensusVoteInput } from '../../mcp/tools/consensus-vote-types.js';

const base: ConsensusVoteInput = { proposal: 'p', quickMode: false, simulateVotes: false };

describe('resolveStrategy', () => {
  it('defaults to simple_majority when neither strategy nor threshold is given', () => {
    expect(resolveStrategy(base)).toBe('simple_majority');
  });

  it('maps the legacy threshold onto its algorithm', () => {
    expect(resolveStrategy({ ...base, threshold: 'majority' })).toBe('simple_majority');
    expect(resolveStrategy({ ...base, threshold: 'supermajority' })).toBe('supermajority');
    expect(resolveStrategy({ ...base, threshold: 'unanimous' })).toBe('unanimous');
  });

  it('strategy wins outright — threshold is discarded when both are set (#5315)', () => {
    expect(resolveStrategy({ ...base, strategy: 'higher_order', threshold: 'supermajority' })).toBe(
      'higher_order'
    );
    expect(resolveStrategy({ ...base, strategy: 'simple_majority', threshold: 'unanimous' })).toBe(
      'simple_majority'
    );
  });
});

describe('strategyToAlgorithm', () => {
  it('is the identity over every strategy, aliases included', () => {
    for (const s of [
      'simple_majority',
      'supermajority',
      'unanimous',
      'proof_of_learning',
      'higher_order',
      'opinion_wise',
    ] as const) {
      expect(strategyToAlgorithm(s)).toBe(s);
    }
  });
});

describe('getDefaultErrorPolicy', () => {
  it('fails closed only for unanimous; everything else reduces the denominator (#3138)', () => {
    expect(getDefaultErrorPolicy('unanimous')).toBe('fail_closed');
    expect(getDefaultErrorPolicy('simple_majority')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('supermajority')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('higher_order')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('opinion_wise')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('proof_of_learning')).toBe('reduce_denominator');
  });

  it('the previous home re-exports the SAME function, not a copy', () => {
    expect(fromMcpTypes).toBe(getDefaultErrorPolicy);
  });
});
