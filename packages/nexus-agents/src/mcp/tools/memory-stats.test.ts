/**
 * Tests for Memory Stats Tool
 *
 * @module mcp/tools/memory-stats.test
 */

import { describe, it, expect } from 'vitest';
import { MemoryStatsInputSchema, type MemoryStatsInput } from './memory-stats.js';

// ============================================================================
// Schema Tests
// ============================================================================

describe('memory-stats', () => {
  describe('MemoryStatsInputSchema', () => {
    it('should validate empty input with defaults', () => {
      const input = {};
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(true); // default
        expect(result.data.includePromotion).toBe(true); // default
      }
    });

    it('should validate full input', () => {
      const input: MemoryStatsInput = {
        includeDecay: false,
        includePromotion: false,
      };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
        expect(result.data.includePromotion).toBe(false);
      }
    });

    it('should validate partial input', () => {
      const input = { includeDecay: false };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDecay).toBe(false);
        expect(result.data.includePromotion).toBe(true); // default
      }
    });

    it('should reject non-boolean includeDecay', () => {
      const input = { includeDecay: 'yes' };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject non-boolean includePromotion', () => {
      const input = { includePromotion: 1 };
      const result = MemoryStatsInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
