/**
 * Tests for budget-utils utilities
 *
 * @module cli-adapters/budget-utils.test
 */

import { describe, it, expect } from 'vitest';
import { TOKEN_COSTS, estimateTokens, estimateCost, formatTokens } from './budget-utils.js';

describe('budget-utils', () => {
  describe('TOKEN_COSTS', () => {
    it('has cost data for claude', () => {
      expect(TOKEN_COSTS.claude).toBeDefined();
      expect(TOKEN_COSTS.claude.input).toBeGreaterThan(0);
      expect(TOKEN_COSTS.claude.output).toBeGreaterThan(0);
    });

    it('has cost data for gemini', () => {
      expect(TOKEN_COSTS.gemini).toBeDefined();
      expect(TOKEN_COSTS.gemini.input).toBeGreaterThan(0);
      expect(TOKEN_COSTS.gemini.output).toBeGreaterThan(0);
    });

    it('has cost data for codex', () => {
      expect(TOKEN_COSTS.codex).toBeDefined();
      expect(TOKEN_COSTS.codex.input).toBeGreaterThan(0);
      expect(TOKEN_COSTS.codex.output).toBeGreaterThan(0);
    });

    it('output costs are higher than input costs', () => {
      // This is a common pricing pattern - outputs cost more than inputs
      expect(TOKEN_COSTS.claude.output).toBeGreaterThan(TOKEN_COSTS.claude.input);
      expect(TOKEN_COSTS.gemini.output).toBeGreaterThan(TOKEN_COSTS.gemini.input);
      expect(TOKEN_COSTS.codex.output).toBeGreaterThan(TOKEN_COSTS.codex.input);
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

  describe('estimateCost', () => {
    it('calculates cost for claude', () => {
      // 1M input tokens at $3.00 + 1M output tokens at $15.00 = $18.00
      const cost = estimateCost('claude', 1_000_000, 1_000_000);
      expect(cost).toBe(18.0);
    });

    it('calculates cost for gemini', () => {
      // 1M input tokens at $0.075 + 1M output tokens at $0.30 = $0.375
      const cost = estimateCost('gemini', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.375, 4);
    });

    it('calculates cost for codex', () => {
      // 1M input tokens at $2.50 + 1M output tokens at $10.00 = $12.50
      const cost = estimateCost('codex', 1_000_000, 1_000_000);
      expect(cost).toBe(12.5);
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
      expect(cost).toBe(3.0); // Only input cost
    });

    it('handles output-only cost', () => {
      const cost = estimateCost('claude', 0, 1_000_000);
      expect(cost).toBe(15.0); // Only output cost
    });

    it('handles small token counts', () => {
      // 1000 input + 1000 output for claude
      const cost = estimateCost('claude', 1000, 1000);
      // (1000/1M) * 3 + (1000/1M) * 15 = 0.003 + 0.015 = 0.018
      expect(cost).toBeCloseTo(0.018, 6);
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
