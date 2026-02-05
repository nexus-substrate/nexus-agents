/**
 * Tests for Memory Query Tool
 *
 * @module mcp/tools/memory-query.test
 */

import { describe, it, expect } from 'vitest';
import { MemoryQueryInputSchema, type MemoryQueryInput } from './memory-query.js';

// ============================================================================
// Schema Tests
// ============================================================================

describe('memory-query', () => {
  describe('MemoryQueryInputSchema', () => {
    it('should validate minimal input', () => {
      const input = { query: 'test search' };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('test search');
        expect(result.data.limit).toBe(10); // default
        expect(result.data.source).toBe('all'); // default
      }
    });

    it('should validate full input', () => {
      const input: MemoryQueryInput = {
        query: 'memory retrieval',
        limit: 25,
        source: 'belief',
      };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('memory retrieval');
        expect(result.data.limit).toBe(25);
        expect(result.data.source).toBe('belief');
      }
    });

    it('should reject empty query', () => {
      const input = { query: '' };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject query over 500 chars', () => {
      const input = { query: 'x'.repeat(501) };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject limit over 50', () => {
      const input = { query: 'test', limit: 51 };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject limit under 1', () => {
      const input = { query: 'test', limit: 0 };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should validate all source types', () => {
      const sources = ['session', 'belief', 'agentic', 'typed', 'all'] as const;

      for (const source of sources) {
        const input = { query: 'test', source };
        const result = MemoryQueryInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid source', () => {
      const input = { query: 'test', source: 'invalid' };
      const result = MemoryQueryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
