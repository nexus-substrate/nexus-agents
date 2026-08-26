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

// #4629: this test reached a real CLI binary through the CLI-detection layer.
// resolveReflection() asks the registry for a default adapter, and the
// auto-adapter probes every CLI to find one, so `opencode --version` and
// `opencode auth list` were actually spawned. Stub the factory so detection
// answers "nothing available"; the registry, retriever, and keyword-fallback
// path under test stay real. Keep this a full module replacement — with an
// `importOriginal` spread the real module still wins for auto-adapter's own
// import and the spawns come back.
vi.mock('../../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn(),
  createAllAdapters: vi.fn(() => new Map()),
  isCliAvailable: vi.fn().mockResolvedValue(false),
  getAvailableClis: vi.fn().mockResolvedValue([]),
}));

// Mock getToolMemory at module level
const mockQueryAll = vi.fn();
const mockQueryBySource = vi.fn();
// #4999: the availability accessors are part of the surface memory_query now
// reads — the response says which backends answered, so a mock without them
// would make every coverage assertion vacuous.
const backendsInstalled = { agentic: true, adaptive: true, typed: true };
let mockErroredBackends: readonly string[] = [];
const mockAvailability = {
  isAgenticMemoryAvailable: (): boolean => backendsInstalled.agentic,
  isAdaptiveMemoryAvailable: (): boolean => backendsInstalled.adaptive,
  isTypedMemoryAvailable: (): boolean => backendsInstalled.typed,
};
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    queryAll: mockQueryAll,
    queryBySource: mockQueryBySource,
    // #4999: the search reports which backends threw. A mock without this
    // makes every coverage assertion below vacuous — the third time this mock
    // has had to grow with the surface, which is itself a seam worth watching.
    queryWithStatus: async (
      source: string,
      query: string,
      limit?: number
    ): Promise<{ results: unknown; errored: readonly string[] }> => ({
      results: await mockQueryBySource(source, query, limit),
      errored: mockErroredBackends,
    }),
    ...mockAvailability,
  }),
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

    describe('memory_query discloses backend coverage (#4999)', () => {
      // Asserted on the RESPONSE, not on a helper: `count: 0` was the same
      // observation whether nothing matched or the SQLite-backed stores were
      // absent, so the only assertion that means anything is what a caller reads.
      beforeEach(() => {
        backendsInstalled.agentic = true;
        backendsInstalled.adaptive = true;
        backendsInstalled.typed = true;
        // Reset alongside the install flags: a test that sets this and does
        // not clear it makes every later assertion order-dependent.
        mockErroredBackends = [];
      });

      it('names the backends that are not installed', async () => {
        backendsInstalled.agentic = false;
        backendsInstalled.typed = false;
        mockQueryBySource.mockResolvedValue([]);

        const result = await registeredHandler({ query: 'routing' }, {});
        const body = JSON.parse(result.content[0]?.text ?? '{}') as {
          count: number;
          searched: string[];
          unavailable: string[];
        };

        expect(body.count).toBe(0);
        expect(body.unavailable).toEqual(['agentic', 'typed']);
        expect(body.searched).toEqual(['session', 'belief', 'adaptive']);
      });

      it('names a backend that was installed but threw (#4999)', async () => {
        // Distinct from `unavailable`: the store is here, it just could not
        // answer. Each helper swallows its failure into an empty result set, so
        // a corrupted SQLite file read exactly like a store with no matches.
        mockErroredBackends = ['agentic', 'typed'];
        mockQueryBySource.mockResolvedValue([]);

        const result = await registeredHandler({ query: 'routing' }, {});
        const body = JSON.parse(result.content[0]?.text ?? '{}') as {
          count: number;
          errored: string[];
          unavailable: string[];
        };

        expect(body.count).toBe(0);
        expect(body.errored).toEqual(['agentic', 'typed']);
        // The stores are installed — this is not the unavailable case.
        expect(body.unavailable).toEqual([]);
      });

      it('reports no errors when every backend answered', async () => {
        // The pair: a healthy search must not imply failures.
        mockErroredBackends = [];
        mockQueryBySource.mockResolvedValue([]);

        const result = await registeredHandler({ query: 'routing' }, {});
        const body = JSON.parse(result.content[0]?.text ?? '{}') as { errored: string[] };

        expect(body.errored).toEqual([]);
      });

      it('reports no gaps on a complete install', async () => {
        // The pair: a full install must not report phantom missing stores.
        mockQueryBySource.mockResolvedValue([]);

        const result = await registeredHandler({ query: 'routing' }, {});
        const body = JSON.parse(result.content[0]?.text ?? '{}') as { unavailable: string[] };

        expect(body.unavailable).toEqual([]);
      });
    });
  });
});
