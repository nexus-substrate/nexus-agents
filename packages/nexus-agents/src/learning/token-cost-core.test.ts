/**
 * Tests for the canonical token→USD core (#5122).
 *
 * The golden values below are the audit's measured divergence cases. They exist
 * so the 3.3x spread across eleven implementations can never reappear silently:
 * every wrapper that migrates onto this core must reproduce them.
 */
import { describe, it, expect } from 'vitest';

import { computeTokenCost, roundToMicroUsd } from './token-cost-core.js';

/** claude-sonnet's in-tree rates, the audit's reference model. */
const SONNET = { inputPer1M: 3, outputPer1M: 15 };

describe('computeTokenCost — golden values from the #5122 audit', () => {
  it('1M in + 1M out on claude-sonnet is $18.00', () => {
    // Six of the eleven paths agreed on this; three said $20.00 and one $6.00.
    const { costUsd } = computeTokenCost({ input: 1_000_000, output: 1_000_000 }, SONNET);
    expect(costUsd).toBeCloseTo(18.0, 10);
  });

  it('does not round, so one input token at $2.50/1M is 0.0000025', () => {
    // The usage-log path returned 0.000003 here (micro-USD round-up) and the
    // trace path 0.0000025, off the same rate. The core keeps the exact value;
    // rounding is the ledger wrapper's business.
    const { costUsd } = computeTokenCost(
      { input: 1, output: 0 },
      { inputPer1M: 2.5, outputPer1M: 0 }
    );
    expect(costUsd).toBe(0.0000025);
  });

  it('prices input and output independently', () => {
    const { costUsd } = computeTokenCost({ input: 1_000_000, output: 0 }, SONNET);
    expect(costUsd).toBeCloseTo(3.0, 10);
  });
});

describe('computeTokenCost — the empty case is named', () => {
  it('zero tokens cost zero and are complete', () => {
    const r = computeTokenCost({ input: 0, output: 0 }, SONNET);
    expect(r.costUsd).toBe(0);
    expect(r.complete).toBe(true);
    expect(r.unpricedComponents).toEqual([]);
  });

  it('zero rates yield zero without being called unpriced', () => {
    // A genuine $0 rate is a measurement. It must not be confused with an
    // absent rate, which is not.
    const r = computeTokenCost({ input: 1000, output: 1000 }, { inputPer1M: 0, outputPer1M: 0 });
    expect(r.costUsd).toBe(0);
    expect(r.complete).toBe(true);
  });
});

describe('computeTokenCost — cache components (#5170)', () => {
  it('prices cache reads when a rate is supplied', () => {
    const r = computeTokenCost(
      { input: 0, output: 0, cacheRead: 1_000_000 },
      { ...SONNET, cacheReadPer1M: 0.3 }
    );
    expect(r.costUsd).toBeCloseTo(0.3, 10);
    expect(r.complete).toBe(true);
  });

  it('prices cache writes at their own rate, not the input rate', () => {
    // Cache writes bill at a PREMIUM over input; folding them into `input`
    // would undercount, which is what every path does today.
    const r = computeTokenCost(
      { input: 0, output: 0, cacheWrite: 1_000_000 },
      { ...SONNET, cacheWritePer1M: 3.75 }
    );
    expect(r.costUsd).toBeCloseTo(3.75, 10);
  });

  it('reports a cache component as UNPRICED rather than free when no rate exists', () => {
    // The defect this core exists to prevent: a voter reporting 2 input tokens
    // and ~47,000 cache tokens was costed from the 2, and the result presented
    // as a finished total.
    const r = computeTokenCost(
      { input: 2, output: 0, cacheRead: 10_125, cacheWrite: 37_564 },
      SONNET
    );
    expect(r.complete).toBe(false);
    expect([...r.unpricedComponents].sort()).toEqual(['cacheRead', 'cacheWrite']);
    // The cost is still the honest floor from the components that DID have rates.
    expect(r.costUsd).toBeCloseTo((2 * 3) / 1_000_000, 12);
  });

  it('names only the cache component that is actually missing a rate', () => {
    const r = computeTokenCost(
      { input: 0, output: 0, cacheRead: 100, cacheWrite: 100 },
      { ...SONNET, cacheReadPer1M: 0.3 }
    );
    expect(r.unpricedComponents).toEqual(['cacheWrite']);
    expect(r.complete).toBe(false);
  });

  it('does not flag an absent cache component as unpriced', () => {
    // An ordinary uncached call must report complete, or the flag means nothing.
    const r = computeTokenCost({ input: 100, output: 100 }, SONNET);
    expect(r.complete).toBe(true);
  });

  it('does not flag ZERO cache tokens as unpriced', () => {
    // Reported-but-zero is not a measurement gap: there was nothing to price.
    const r = computeTokenCost({ input: 100, output: 100, cacheRead: 0 }, SONNET);
    expect(r.unpricedComponents).toEqual([]);
    expect(r.complete).toBe(true);
  });

  it('complete is false exactly when unpricedComponents is non-empty', () => {
    const cases = [
      { input: 1, output: 1 },
      { input: 1, output: 1, cacheRead: 5 },
      { input: 1, output: 1, cacheRead: 0 },
      { input: 1, output: 1, cacheWrite: 5 },
    ];
    for (const tokens of cases) {
      const r = computeTokenCost(tokens, SONNET);
      expect(r.complete).toBe(r.unpricedComponents.length === 0);
    }
  });
});

describe('roundToMicroUsd', () => {
  it('rounds to whole micro-USD', () => {
    expect(roundToMicroUsd(0.0000025)).toBe(0.000003);
  });

  it('biases upward on a half micro-USD, which is a recorded decision', () => {
    // Math.round rounds half away from zero. Pinned so the bias is deliberate
    // rather than an artefact someone "fixes" without noticing the ledger.
    expect(roundToMicroUsd(0.0000015)).toBe(0.000002);
  });

  it('leaves an already-whole micro-USD value untouched', () => {
    expect(roundToMicroUsd(18.0)).toBe(18.0);
    expect(roundToMicroUsd(0.000123)).toBe(0.000123);
  });

  it('is not applied by computeTokenCost', () => {
    // The separation is the point: the core stays exact.
    const { costUsd } = computeTokenCost(
      { input: 1, output: 0 },
      { inputPer1M: 2.5, outputPer1M: 0 }
    );
    expect(costUsd).not.toBe(roundToMicroUsd(costUsd));
  });
});
