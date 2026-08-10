/**
 * Tests for trace-pricing utilities
 *
 * All pricing is derived from the canonical model registry
 * (config/in-tree-data.ts via getDefaultRegistry()). No legacy model table.
 *
 * @module core/trace-pricing.test
 */

import { describe, it, expect } from 'vitest';
import { calculateCost } from './trace-pricing.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../config/in-tree-data.js';

describe('trace-pricing', () => {
  describe('calculateCost — canonical registry', () => {
    it('calculates cost for canonical model by id', () => {
      // claude-sonnet: $3/1M input, $15/1M output
      const cost = calculateCost('claude-sonnet', 1_000_000, 1_000_000);
      expect(cost).toBe(3 + 15);
    });

    it('calculates cost for canonical model by cliModelName', () => {
      // gemini-2.5-pro is cliModelName for gemini-pro: $1.25/1M input, $10/1M output
      const cost = calculateCost('gemini-2.5-pro', 1_000_000, 1_000_000);
      expect(cost).toBe(1.25 + 10);
    });

    it('calculates cost for canonical model by cliAlias', () => {
      // 'opus' is cliAlias for claude-opus
      const cost = calculateCost('opus', 1_000_000, 1_000_000);
      expect(cost).toBe(5 + 25);
    });

    it('calculates cost for small token counts', () => {
      // claude-sonnet: $3/1M input, $15/1M output
      const cost = calculateCost('claude-sonnet', 1000, 1000);
      expect(cost).toBeCloseTo(0.003 + 0.015, 6);
    });

    it('handles zero tokens', () => {
      const cost = calculateCost('claude-sonnet', 0, 0);
      expect(cost).toBe(0);
    });

    it('handles only input tokens', () => {
      const cost = calculateCost('claude-sonnet', 1_000_000, 0);
      expect(cost).toBe(3);
    });

    it('handles only output tokens', () => {
      const cost = calculateCost('claude-sonnet', 0, 1_000_000);
      expect(cost).toBe(15);
    });

    it('returns undefined for unknown model', () => {
      const cost = calculateCost('unknown-model-xyz', 1000, 1000);
      expect(cost).toBeUndefined();
    });

    it('matches model by prefix (versioned model name)', () => {
      // 'claude-sonnet-4-6' is the cliModelName for claude-sonnet
      // A versioned suffix like 'claude-sonnet-4-6-extra' should still match
      const cliModelName = DEFAULT_MODEL_CAPABILITIES.models.find(
        (m) => m.id === 'claude-sonnet'
      )?.cliModelName;
      expect(cliModelName).toBeDefined();
      if (cliModelName !== undefined) {
        const cost = calculateCost(cliModelName, 1_000_000, 1_000_000);
        expect(cost).toBe(3 + 15);
      }
    });

    it('calculates all canonical models have pricing', () => {
      for (const m of DEFAULT_MODEL_CAPABILITIES.models) {
        if (m.pricing === undefined) continue;
        // Skip free models (e.g., OpenRouter free tier) — zero cost is correct
        if (m.pricing.inputPer1M === 0 && m.pricing.outputPer1M === 0) continue;
        const cost = calculateCost(m.id, 1_000_000, 1_000_000);
        expect(cost, `${m.id} should have cost`).toBeDefined();
        expect(cost, `${m.id} should have positive cost`).toBeGreaterThan(0);
      }
    });

    it('resolves codex models by cliModelName', () => {
      // codex-5.3 has cliModelName 'gpt-5.4': $2.5/1M input, $15/1M output
      const cost = calculateCost('gpt-5.4', 1_000_000, 1_000_000);
      expect(cost).toBe(2.5 + 15);
    });

    it('prices legacy models the catalogue still lists (#4406)', () => {
      // This previously asserted `undefined` for these ids, on the reasoning
      // that they are "no longer supported". That conflated two separate
      // questions: whether we can PRICE a model and whether we should OFFER it.
      //
      // Absence of a price is a bad way to express end-of-life. It is also
      // actively harmful: cost ceilings are documented as fail-closed for
      // unpriced candidates, so an unpriced model gets rejected for the wrong
      // reason, and historical records of real spend cannot be costed at all.
      // Lifecycle belongs in the `deprecated` / `replacedBy` fields.
      expect(calculateCost('gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(12.5, 5);
      expect(calculateCost('gpt-3.5-turbo', 1_000_000, 1_000_000)).toBeDefined();
    });

    it('still returns undefined for a model no source has ever priced', () => {
      // The fallback must not manufacture a number.
      expect(calculateCost('definitely-not-a-real-model-xyz', 1000, 1000)).toBeUndefined();
    });
  });
});
