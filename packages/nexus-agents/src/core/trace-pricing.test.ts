/**
 * Tests for trace-pricing utilities
 *
 * @module core/trace-pricing.test
 */

import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, calculateCost } from './trace-pricing.js';

describe('trace-pricing', () => {
  describe('MODEL_PRICING', () => {
    it('contains Anthropic Claude models', () => {
      expect(MODEL_PRICING['claude-opus-4']).toBeDefined();
      expect(MODEL_PRICING['claude-sonnet-4']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-sonnet']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-haiku']).toBeDefined();
      expect(MODEL_PRICING['claude-3-opus']).toBeDefined();
      expect(MODEL_PRICING['claude-3-sonnet']).toBeDefined();
      expect(MODEL_PRICING['claude-3-haiku']).toBeDefined();
    });

    it('contains OpenAI models', () => {
      expect(MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
      expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
      expect(MODEL_PRICING['gpt-4']).toBeDefined();
      expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined();
      expect(MODEL_PRICING['o1']).toBeDefined();
      expect(MODEL_PRICING['o1-mini']).toBeDefined();
    });

    it('contains Google Gemini models', () => {
      expect(MODEL_PRICING['gemini-2.0-flash']).toBeDefined();
      expect(MODEL_PRICING['gemini-1.5-pro']).toBeDefined();
      expect(MODEL_PRICING['gemini-1.5-flash']).toBeDefined();
    });

    it('has correct pricing structure', () => {
      const pricing = MODEL_PRICING['claude-sonnet-4'];
      expect(pricing).toHaveProperty('inputPer1M');
      expect(pricing).toHaveProperty('outputPer1M');
      expect(typeof pricing?.inputPer1M).toBe('number');
      expect(typeof pricing?.outputPer1M).toBe('number');
    });

    it('has positive pricing values', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPer1M, `${model} input price`).toBeGreaterThan(0);
        expect(pricing.outputPer1M, `${model} output price`).toBeGreaterThan(0);
      }
    });

    it('has output prices >= input prices', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.outputPer1M, `${model} output >= input`).toBeGreaterThanOrEqual(
          pricing.inputPer1M
        );
      }
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for known model', () => {
      // claude-sonnet-4: $3/1M input, $15/1M output
      const cost = calculateCost('claude-sonnet-4', 1_000_000, 1_000_000);
      expect(cost).toBe(3 + 15);
    });

    it('calculates cost for small token counts', () => {
      // claude-sonnet-4: $3/1M input, $15/1M output
      // 1000 tokens = $0.003 input, $0.015 output
      const cost = calculateCost('claude-sonnet-4', 1000, 1000);
      expect(cost).toBeCloseTo(0.003 + 0.015, 6);
    });

    it('handles zero tokens', () => {
      const cost = calculateCost('claude-sonnet-4', 0, 0);
      expect(cost).toBe(0);
    });

    it('handles only input tokens', () => {
      // claude-sonnet-4: $3/1M input
      const cost = calculateCost('claude-sonnet-4', 1_000_000, 0);
      expect(cost).toBe(3);
    });

    it('handles only output tokens', () => {
      // claude-sonnet-4: $15/1M output
      const cost = calculateCost('claude-sonnet-4', 0, 1_000_000);
      expect(cost).toBe(15);
    });

    it('returns undefined for unknown model', () => {
      const cost = calculateCost('unknown-model', 1000, 1000);
      expect(cost).toBeUndefined();
    });

    it('matches model with version suffix (partial match)', () => {
      // claude-sonnet-4-20250514 should match claude-sonnet-4
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000, 1_000_000);
      expect(cost).toBe(3 + 15);
    });

    it('matches gpt-4o with suffix', () => {
      // gpt-4o: $2.5/1M input, $10/1M output
      const cost = calculateCost('gpt-4o-2024-05-13', 1_000_000, 1_000_000);
      expect(cost).toBe(2.5 + 10);
    });

    it('matches gemini models with suffix', () => {
      // gemini-2.0-flash: $0.1/1M input, $0.4/1M output
      const cost = calculateCost('gemini-2.0-flash-exp', 1_000_000, 1_000_000);
      expect(cost).toBe(0.1 + 0.4);
    });

    it('calculates expensive model costs correctly', () => {
      // claude-opus-4: $15/1M input, $75/1M output
      const cost = calculateCost('claude-opus-4', 100_000, 50_000);
      // Input: 0.1 * 15 = 1.5
      // Output: 0.05 * 75 = 3.75
      expect(cost).toBeCloseTo(1.5 + 3.75, 6);
    });

    it('calculates cheap model costs correctly', () => {
      // gemini-1.5-flash: $0.075/1M input, $0.3/1M output
      const cost = calculateCost('gemini-1.5-flash', 10_000_000, 5_000_000);
      // Input: 10 * 0.075 = 0.75
      // Output: 5 * 0.3 = 1.5
      expect(cost).toBeCloseTo(0.75 + 1.5, 6);
    });

    it('handles large realistic conversation', () => {
      // Typical conversation: 10k input, 2k output
      // claude-3-5-haiku: $0.8/1M input, $4/1M output
      const cost = calculateCost('claude-3-5-haiku', 10_000, 2_000);
      // Input: 0.01 * 0.8 = 0.008
      // Output: 0.002 * 4 = 0.008
      expect(cost).toBeCloseTo(0.016, 6);
    });
  });
});
