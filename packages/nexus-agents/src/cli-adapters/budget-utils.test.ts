/**
 * Tests for budget-utils utilities
 *
 * @module cli-adapters/budget-utils.test
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateCost, formatTokens } from './budget-utils.js';
import { resolveCliCostPer1M } from '../config/model-config-helpers.js';

describe('budget-utils', () => {
  // #4168: the former hardcoded `TOKEN_COSTS` table now resolves through the
  // registry via `resolveCliCostPer1M` (single authoritative source). These
  // assertions preserve the original intent (each CLI is priced, output > input).
  describe('per-CLI token costs (registry-backed)', () => {
    it('has cost data for claude', () => {
      const c = resolveCliCostPer1M('claude');
      expect(c.input).toBeGreaterThan(0);
      expect(c.output).toBeGreaterThan(0);
    });

    it('has cost data for gemini', () => {
      const c = resolveCliCostPer1M('gemini');
      expect(c.input).toBeGreaterThan(0);
      expect(c.output).toBeGreaterThan(0);
    });

    it('has cost data for codex', () => {
      const c = resolveCliCostPer1M('codex');
      expect(c.input).toBeGreaterThan(0);
      expect(c.output).toBeGreaterThan(0);
    });

    it('output costs are higher than input costs', () => {
      // This is a common pricing pattern - outputs cost more than inputs
      expect(resolveCliCostPer1M('claude').output).toBeGreaterThan(
        resolveCliCostPer1M('claude').input
      );
      expect(resolveCliCostPer1M('gemini').output).toBeGreaterThan(
        resolveCliCostPer1M('gemini').input
      );
      expect(resolveCliCostPer1M('codex').output).toBeGreaterThan(
        resolveCliCostPer1M('codex').input
      );
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens at approximately 4 chars per token', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75, ceil = 1
      expect(estimateTokens('abcd')).toBe(1); // 4/4 = 1
      expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25, ceil = 2
    });

    it('handles longer content', () => {
      const content = 'a'.repeat(1000);
      expect(estimateTokens(content)).toBe(250); // 1000/4 = 250
    });

    it('rounds up fractional tokens', () => {
      expect(estimateTokens('a')).toBe(1); // 1/4 = 0.25, ceil = 1
      expect(estimateTokens('ab')).toBe(1); // 2/4 = 0.5, ceil = 1
      expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75, ceil = 1
    });

    it('handles empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  // #4168: costs now come from registry pricing for each CLI's default model
  // (claude→claude-fable-5 $10/$50, gemini→gemini-3-pro $2/$12, codex→gpt-5.5
  // $5/$30 per 1M), not the old static table — numbers updated deliberately.
  describe('estimateCost', () => {
    it('calculates cost for claude', () => {
      // 1M input at $10.00 + 1M output at $50.00 = $60.00 (claude-fable-5)
      const cost = estimateCost('claude', 1_000_000, 1_000_000);
      expect(cost).toBe(60.0);
    });

    it('calculates cost for gemini', () => {
      // 1M input at $2.00 + 1M output at $12.00 = $14.00 (gemini-3-pro)
      const cost = estimateCost('gemini', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(14.0, 4);
    });

    it('calculates cost for codex', () => {
      // 1M input at $5.00 + 1M output at $30.00 = $35.00 (gpt-5.5)
      const cost = estimateCost('codex', 1_000_000, 1_000_000);
      expect(cost).toBe(35.0);
    });

    it('scales linearly with tokens', () => {
      const cost1 = estimateCost('claude', 500_000, 500_000);
      const cost2 = estimateCost('claude', 1_000_000, 1_000_000);
      expect(cost2).toBeCloseTo(cost1 * 2, 6);
    });

    it('returns 0 for zero tokens', () => {
      expect(estimateCost('claude', 0, 0)).toBe(0);
    });

    it('handles input-only cost', () => {
      const cost = estimateCost('claude', 1_000_000, 0);
      expect(cost).toBe(10.0); // Only input cost (claude-fable-5 $10/1M)
    });

    it('handles output-only cost', () => {
      const cost = estimateCost('claude', 0, 1_000_000);
      expect(cost).toBe(50.0); // Only output cost (claude-fable-5 $50/1M)
    });

    it('handles small token counts', () => {
      // 1000 input + 1000 output for claude (claude-fable-5)
      const cost = estimateCost('claude', 1000, 1000);
      // (1000/1M) * 10 + (1000/1M) * 50 = 0.01 + 0.05 = 0.06
      expect(cost).toBeCloseTo(0.06, 6);
    });
  });

  describe('formatTokens', () => {
    it('formats numbers under 1000 as-is', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(1)).toBe('1');
      expect(formatTokens(100)).toBe('100');
      expect(formatTokens(999)).toBe('999');
    });

    it('formats thousands with K suffix', () => {
      expect(formatTokens(1000)).toBe('1.0K');
      expect(formatTokens(1500)).toBe('1.5K');
      expect(formatTokens(10000)).toBe('10.0K');
      expect(formatTokens(999999)).toBe('1000.0K');
    });

    it('formats millions with M suffix', () => {
      expect(formatTokens(1_000_000)).toBe('1.0M');
      expect(formatTokens(1_500_000)).toBe('1.5M');
      expect(formatTokens(10_000_000)).toBe('10.0M');
    });

    it('rounds to one decimal place', () => {
      expect(formatTokens(1234)).toBe('1.2K');
      expect(formatTokens(1256)).toBe('1.3K');
      expect(formatTokens(1_234_567)).toBe('1.2M');
    });
  });
});
