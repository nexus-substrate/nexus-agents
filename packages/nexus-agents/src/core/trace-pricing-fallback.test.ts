/**
 * Tests for the catalogue price fallback (#4406).
 *
 * `lookupCanonicalPricing` read only the static in-tree matrix, so a model the
 * registry priced perfectly well came back unpriced. A missing price is not
 * free: cost ceilings are documented as fail-closed for unpriced candidates, so
 * reporting "unknown" when a public list price is available is the worse answer.
 *
 * @module core/trace-pricing-fallback.test
 */

import { describe, it, expect } from 'vitest';
import { calculateCost, priceBasisFor, priceBasisCaveat } from './trace-pricing.js';

describe('catalogue price fallback (#4406)', () => {
  it('prices a model the in-tree matrix does not carry', () => {
    // gpt-4o is absent from in-tree data but present in the models.dev tier at
    // 2.5 / 10. Before the fallback this returned undefined.
    expect(calculateCost('gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(12.5, 5);
  });

  it('still prefers the curated in-tree price when there is one', () => {
    // In-tree stays authoritative — the fallback is a fallback, not an override.
    expect(calculateCost('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBeCloseTo(18, 5);
  });

  it('returns undefined for a model no source knows', () => {
    // The fallback must not manufacture a price. Unknown stays unknown.
    expect(calculateCost('definitely-not-a-real-model-xyz', 1_000_000, 1_000_000)).toBeUndefined();
  });

  it('scales with token counts', () => {
    const full = calculateCost('gpt-4o', 1_000_000, 1_000_000);
    const half = calculateCost('gpt-4o', 500_000, 500_000);

    expect(full).toBeDefined();
    expect(half).toBeCloseTo((full as number) / 2, 5);
  });

  it('charges input and output at their own rates', () => {
    // 2.5 in / 10 out — an output-only call must not be priced at the input rate.
    const inputOnly = calculateCost('gpt-4o', 1_000_000, 0);
    const outputOnly = calculateCost('gpt-4o', 0, 1_000_000);

    expect(inputOnly).toBeCloseTo(2.5, 5);
    expect(outputOnly).toBeCloseTo(10, 5);
  });
});

describe('price provenance (#4406)', () => {
  it('reports a known price as list-derived', () => {
    expect(priceBasisFor('gpt-4o')).toBe('list');
  });

  it('reports an unknown model as unknown', () => {
    expect(priceBasisFor('definitely-not-a-real-model-xyz')).toBe('unknown');
  });

  it('carries a caveat for list prices', () => {
    // The number is the vendor's advertised rate, not one verified against the
    // operator's account — an enterprise contract or gateway bills differently.
    const caveat = priceBasisCaveat('list');

    expect(caveat).toBeDefined();
    expect(caveat).toContain('contract');
  });

  it('has no caveat when there is no price to caveat', () => {
    expect(priceBasisCaveat('unknown')).toBeUndefined();
  });
});
