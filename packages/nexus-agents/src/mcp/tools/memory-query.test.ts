/**
 * Tests for Memory Query Tool
 *
 * Tests schema validation AND handler logic with mocked ToolMemoryManager.
 *
 * @module mcp/tools/memory-query.test
 * (Source: Issue #856)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryQueryInputSchema,
  registerMemoryQueryTool,
  type MemoryQueryInput,
} from './memory-query.js';

// Mock getToolMemory at module level
const mockQueryAll = vi.fn();
const mockQueryBySource = vi.fn();
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({ queryAll: mockQueryAll, queryBySource: mockQueryBySource }),
}));

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
        expect(result.data.limit).toBe(10);
        expect(result.data.source).toBe('all');
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
      const result = MemoryQueryInputSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('should reject query over 500 chars', () => {
      const result = MemoryQueryInputSchema.safeParse({ query: 'x'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 50', () => {
      const result = MemoryQueryInputSchema.safeParse({ query: 'test', limit: 51 });
      expect(result.success).toBe(false);
    });

    it('should reject limit under 1', () => {
      const result = MemoryQueryInputSchema.safeParse({ query: 'test', limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should validate all source types', () => {
      const sources = ['session', 'belief', 'agentic', 'typed', 'adaptive', 'all'] as const;
      for (const source of sources) {
        const result = MemoryQueryInputSchema.safeParse({ query: 'test', source });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid source', () => {
      const result = MemoryQueryInputSchema.safeParse({ query: 'test', source: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Handler Tests (Issue #856)
  // ============================================================================

  describe('handler logic', () => {
    type SdkCallback = (
      args: unknown,
      extra: unknown
    ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
    let registeredHandler: SdkCallback;

    beforeEach(() => {
      mockQueryAll.mockReset();
      mockQueryBySource.mockReset();

      // Register tool with a mock server to capture the handler
      const mockServer = {
        registerTool: (_name: string, _schema: unknown, handler: SdkCallback) => {
          registeredHandler = handler;
        },
      };
      const mockRateLimiter = {
        tryAcquire: () => true,
        getState: () => ({ remaining: 99, nextTokenMs: 0 }),
      };

      registerMemoryQueryTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        {
          rateLimiter:
            mockRateLimiter as unknown as import('../middleware/rate-limiter.js').RateLimiter,
        }
      );
    });

    it('returns results for a valid query', async () => {
      const mockResults = [
        {
          source: 'session',
          type: 'learning',
          content: 'test pattern',
          relevance: 0.8,
          timestamp: new Date(),
        },
        {
          source: 'belief',
          type: 'belief',
          content: 'test belief',
          relevance: 0.6,
          timestamp: new Date(),
        },
      ];
      mockQueryBySource.mockResolvedValue(mockResults);

      const result = await registeredHandler({ query: 'test search' }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.query).toBe('test search');
      expect(parsed.count).toBe(2);
      expect(parsed.source).toBe('all');
    });

    it('dispatches to specific backend when source is set', async () => {
      const mockResults = [
        {
          source: 'session',
          type: 'learning',
          content: 'session data',
          relevance: 0.8,
          timestamp: new Date(),
        },
      ];
      mockQueryBySource.mockResolvedValue(mockResults);

      const result = await registeredHandler({ query: 'test', source: 'session' }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.count).toBe(1);
      expect(parsed.source).toBe('session');
      // Verify queryBySource was called with 'session' source, not 'all'
      expect(mockQueryBySource).toHaveBeenCalledWith(
        'session',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('returns validation error for invalid input', async () => {
      const result = await registeredHandler({ query: '' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Validation error');
    });

    it('returns error when queryBySource throws', async () => {
      mockQueryBySource.mockRejectedValue(new Error('Backend unavailable'));

      const result = await registeredHandler({ query: 'test' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Memory query failed');
    });

    it('returns empty results when no matches', async () => {
      mockQueryBySource.mockResolvedValue([]);

      const result = await registeredHandler({ query: 'nonexistent' }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.count).toBe(0);
      expect(parsed.results).toEqual([]);
    });

    it('omits expandedQuery when no reflection occurs (Issue #1397)', async () => {
      mockQueryBySource.mockResolvedValue([]);

      const result = await registeredHandler({ query: 'simple query' }, {});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
      expect(parsed['query']).toBe('simple query');
      expect(parsed['expandedQuery']).toBeUndefined();
    });
  });
});
