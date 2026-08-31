/**
 * Tests for research_add MCP tool.
 *
 * @module mcp/tools/research-add.test
 * (Source: Research System Enhancement - Phase 1B)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchAddTool,
  ResearchAddInputSchema,
  type ResearchAddDeps,
} from './research-add.js';
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

describe('research_add tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ResearchAddDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('ResearchAddInputSchema', () => {
    it('should accept valid arxivId', () => {
      const result = ResearchAddInputSchema.safeParse({ arxivId: '2401.12345' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arxivId).toBe('2401.12345');
      }
    });

    it('should accept arxivId with all optional fields', () => {
      const result = ResearchAddInputSchema.safeParse({
        arxivId: '2401.12345',
        topic: 'agents',
        priority: 'P1',
        dryRun: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.arxivId).toBe('2401.12345');
        expect(result.data.topic).toBe('agents');
        expect(result.data.priority).toBe('P1');
        expect(result.data.dryRun).toBe(true);
      }
    });

    it('should reject invalid arxivId format', () => {
      const result = ResearchAddInputSchema.safeParse({ arxivId: 'not-an-id' });
      expect(result.success).toBe(false);
    });

    it('should reject missing arxivId', () => {
      const result = ResearchAddInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should default dryRun to false', () => {
      const result = ResearchAddInputSchema.safeParse({ arxivId: '2401.12345' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dryRun).toBe(false);
      }
    });
  });

  describe('registerResearchAddTool', () => {
    it('should register the tool with correct name', () => {
      registerResearchAddTool(
        mockServer as unknown as Parameters<typeof registerResearchAddTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_add',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerResearchAddTool(
        mockServer as unknown as Parameters<typeof registerResearchAddTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ arxivId: '2401.12345' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });
  });
});

describe('outputSchema declares exactly the keys the response carries (#5288)', () => {
  /**
   * The round-trip check in `mcp-standalone-tools.test.ts` cannot guard this
   * tool. Its output shape is NETWORK-dependent: `addResearchPaper` fetches
   * arXiv metadata — and `dryRun` suppresses the registry write, not the fetch
   * — so it emits structured content when arxiv.org answers and a
   * `toolStructuredError` envelope with none when it does not. CI is the second
   * case often enough to fail intermittently, on PRs touching nothing near it.
   *
   * So `research_add` now sits in that suite's `DATA_DEPENDENT_STRUCTURED`
   * list, exempt from the strict comparison. That exemption removes coverage,
   * and this restores it deterministically with no network at all: the declared
   * key set must equal the one `handleResearchAdd` returns.
   *
   * Same instrument and same reasoning as `research-synthesize.test.ts`, which
   * covers the registry-state version of this problem.
   */
  const RESPONSE_KEYS = ['dryRun', 'message', 'paperId', 'success', 'title'] as const;

  it('declares exactly the keys the handler returns', () => {
    const server = { registerTool: vi.fn() };
    registerResearchAddTool(
      server as unknown as Parameters<typeof registerResearchAddTool>[0],
      { rateLimiter: createTestRateLimiter() }
    );

    const call = server.registerTool.mock.calls[0] as unknown[];
    const meta = call[1] as { outputSchema?: Record<string, unknown> };
    const declared = Object.keys(meta.outputSchema ?? {}).sort();

    // Both directions. The SDK applies `additionalProperties: false`, so a
    // returned-but-undeclared key is a hard -32602 for any validating client;
    // and a declared-but-never-returned key is a claim nothing supports.
    expect(declared).toEqual([...RESPONSE_KEYS]);
  });
});
