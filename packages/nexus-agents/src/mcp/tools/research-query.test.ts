/**
 * Tests for research_query MCP tool.
 *
 * @module mcp/tools/research-query.test
 * (Source: Research System Enhancement - Phase 1A)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchQueryTool,
  ResearchQueryInputSchema,
  type ResearchQueryDeps,
} from './research-query.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

// Mock McpServer
interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  registerTool: ReturnType<typeof vi.fn>;
}

function createMockServer(): MockServer {
  return {
    tool: vi.fn(),
    registerTool: vi.fn(),
  };
}

// Create a permissive rate limiter for tests
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

// Create a rate limiter that blocks all requests
function createBlockingRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 0,
    refillRate: 0,
    refillIntervalMs: 60000,
  });
}

describe('research_query tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ResearchQueryDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('ResearchQueryInputSchema', () => {
    it('should accept valid status action', () => {
      const result = ResearchQueryInputSchema.safeParse({ action: 'status' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('status');
      }
    });

    it('should accept valid overlap action with techniqueId', () => {
      const result = ResearchQueryInputSchema.safeParse({
        action: 'overlap',
        techniqueId: 'test-id',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('overlap');
        expect(result.data.techniqueId).toBe('test-id');
      }
    });

    it('should accept valid stats action', () => {
      const result = ResearchQueryInputSchema.safeParse({ action: 'stats' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('stats');
      }
    });

    it('should accept valid search action with query', () => {
      const result = ResearchQueryInputSchema.safeParse({
        action: 'search',
        query: 'orchestration',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('search');
        expect(result.data.query).toBe('orchestration');
      }
    });

    it('should reject invalid action', () => {
      const result = ResearchQueryInputSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing action', () => {
      const result = ResearchQueryInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('registerResearchQueryTool', () => {
    it('should register the tool with correct name', () => {
      registerResearchQueryTool(
        mockServer as unknown as Parameters<typeof registerResearchQueryTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_query',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerResearchQueryTool(
        mockServer as unknown as Parameters<typeof registerResearchQueryTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ action: 'status' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });
  });
});

describe('outputSchema declares every key ResearchQueryResponse returns (#5141)', () => {
  /**
   * The round-trip check in mcp-standalone-tools.test.ts cannot catch a gap
   * here. It calls `research_query` once, with `action: 'stats'` — an action
   * that never sets `rejectionNotice`. The field is only populated by
   * `handleStatus`/`handleOverlap` when the technique carries a recorded
   * rejection (#4555), so the defect was DATA-dependent and invisible to a
   * single fixed call.
   *
   * This pins the property with no data and no action branch: the declared key
   * set must equal ResearchQueryResponse's. Same guard shape as
   * research-synthesize.test.ts (#5134).
   */
  const RESPONSE_KEYS = ['action', 'data', 'rejectionNotice', 'success'] as const;

  it('declares exactly the keys ResearchQueryResponse carries', () => {
    const server = { registerTool: vi.fn() };
    registerResearchQueryTool(
      server as unknown as Parameters<typeof registerResearchQueryTool>[0],
      {} as Parameters<typeof registerResearchQueryTool>[1]
    );

    const call = server.registerTool.mock.calls[0] as unknown[];
    const meta = call[1] as { outputSchema?: Record<string, unknown> };
    const declared = Object.keys(meta.outputSchema ?? {}).sort();

    // Both directions: undeclared-but-returned is the -32602; declared-but-never
    // -returned is a claim nothing supports.
    expect(declared).toEqual([...RESPONSE_KEYS]);
  });
});
