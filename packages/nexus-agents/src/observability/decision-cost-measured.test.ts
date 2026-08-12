/**
 * `unmeasured` must not certify a voter that reported no tokens (#4430).
 *
 * `isMeasured` keyed on `costUsd` alone. A voter whose adapter reported no
 * usage still got `inputTokens ?? 0` → 0, and — because a cost was supplied —
 * `unmeasured: false`. The rollup therefore certified 0/0 as a measurement.
 *
 * Observed live across three 7-voter panels at 2.176.2: every `gpt-5.5` voter
 * returned full reasoning that was counted in the verdict while reporting
 * `0` input and `0` output, all flagged measured. The natural mitigation a
 * consumer would reach for — drop zero-token voters — would have discarded
 * 3 of 7 voters in one of those votes, enough to move a supermajority.
 *
 * A real zero-token call and a call that reported nothing must be
 * distinguishable, because only one of them is evidence.
 *
 * @module observability/decision-cost-measured.test
 */

import { describe, it, expect } from 'vitest';
import { rollupDecisionCost, type VoterCostInput } from './decision-cost.js';

const voter = (over: Partial<VoterCostInput> = {}): VoterCostInput => ({
  role: 'architect',
  model: 'claude-fable-5',
  inputTokens: 100,
  outputTokens: 200,
  costUsd: 0.01,
  ...over,
});

describe('isMeasured requires token evidence (#4430)', () => {
  it('flags a voter that reported no tokens as unmeasured, even with a cost', () => {
    // The live shape: reasoning returned, usage absent, cost supplied.
    const out = rollupDecisionCost(
      [voter({ inputTokens: undefined, outputTokens: undefined })],
      'plan'
    );

    expect(out.perVoter[0]?.unmeasured).toBe(true);
    expect(out.unmeasuredVoters).toBe(1);
    expect(out.measuredVoters).toBe(0);
  });

  it('keeps a genuinely zero-token call measured', () => {
    // Explicit 0 is a measurement; absent is not. Collapsing the two is the bug.
    const out = rollupDecisionCost([voter({ inputTokens: 0, outputTokens: 0 })], 'plan');

    expect(out.perVoter[0]?.unmeasured).toBe(false);
    expect(out.measuredVoters).toBe(1);
  });

  it('accepts a partial report (output only) as measured', () => {
    // Some adapters report only completion tokens. That is still evidence, and
    // demanding both would newly discard voters that were previously counted.
    const out = rollupDecisionCost([voter({ inputTokens: undefined })], 'plan');

    expect(out.perVoter[0]?.unmeasured).toBe(false);
  });

  it('still flags a voter with tokens but no cost as unmeasured', () => {
    // The pre-existing rule (#4165) must survive: no computable cost ⇒ unmeasured.
    const out = rollupDecisionCost([voter({ costUsd: undefined })], 'api');

    expect(out.perVoter[0]?.unmeasured).toBe(true);
  });

  it('leaves a fully-reported voter measured', () => {
    const out = rollupDecisionCost([voter()], 'plan');

    expect(out.perVoter[0]?.unmeasured).toBe(false);
    expect(out.measuredVoters).toBe(1);
  });

  it('splits a mixed panel correctly', () => {
    const out = rollupDecisionCost(
      [voter(), voter({ role: 'security', inputTokens: undefined, outputTokens: undefined })],
      'plan'
    );

    expect(out.measuredVoters).toBe(1);
    expect(out.unmeasuredVoters).toBe(1);
  });
});
