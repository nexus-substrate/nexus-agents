/**
 * Tests for research_analyze MCP tool.
 *
 * @module mcp/tools/research-analyze.test
 * (Source: Research System Enhancement - Phase 1D)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchAnalyzeTool,
  ResearchAnalyzeInputSchema,
  analyzeGaps,
  type ResearchAnalyzeDeps,
} from './research-analyze.js';
import { loadTechniquesRegistry, loadPapersRegistry } from '../../cli/research-helpers.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

vi.mock('../../cli/research-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/research-helpers.js')>();
  return {
    ...actual,
    loadTechniquesRegistry: vi.fn(),
    loadPapersRegistry: vi.fn(),
  };
});

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

describe('research_analyze tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ResearchAnalyzeDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('ResearchAnalyzeInputSchema', () => {
    it('should accept valid gaps focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({ focus: 'gaps' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus).toBe('gaps');
      }
    });

    it('should accept trends focus with topic filter', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({
        focus: 'trends',
        topic: 'multi-agent',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus).toBe('trends');
        expect(result.data.topic).toBe('multi-agent');
      }
    });

    it('should accept valid priorities focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({ focus: 'priorities' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus).toBe('priorities');
      }
    });

    it('should accept valid stale focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({ focus: 'stale' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus).toBe('stale');
      }
    });

    it('should accept valid coverage focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({ focus: 'coverage' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus).toBe('coverage');
      }
    });

    it('should reject invalid focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({ focus: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing focus', () => {
      const result = ResearchAnalyzeInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('registerResearchAnalyzeTool', () => {
    it('should register the tool with correct name', () => {
      registerResearchAnalyzeTool(
        mockServer as unknown as Parameters<typeof registerResearchAnalyzeTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_analyze',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerResearchAnalyzeTool(
        mockServer as unknown as Parameters<typeof registerResearchAnalyzeTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ focus: 'gaps' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });
  });

  describe('analyzeGaps refuses when a registry could not be read (#5925)', () => {
    const okTechniques = {
      ok: true as const,
      value: {
        techniques: {
          t1: { name: 'Chain of thought', topic: 'prompting', source_papers: ['p1'] },
        },
      },
    };

    beforeEach(() => {
      vi.mocked(loadTechniquesRegistry).mockResolvedValue(
        okTechniques as unknown as Awaited<ReturnType<typeof loadTechniquesRegistry>>
      );
    });

    it('reports failure when the papers registry cannot be read', async () => {
      // Before this, a failed papers load fell through to `{}`, so
      // `topicPaperCount` was empty, EVERY topic cleared the `< 2` filter, and
      // the tool reported a maximal under-researched list under success: true.
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error('papers.yaml is unreadable'),
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await analyzeGaps();

      expect(result.success).toBe(false);
      expect(result.analysis).toMatchObject({ error: expect.stringContaining('papers') });
    });

    it('names WHICH registry failed, not always techniques', async () => {
      // `failureResponse` hard-coded 'Failed to load techniques registry', so
      // gating on papers without parameterising it would have reported the
      // wrong cause — a second misreport hiding behind the fix for the first.
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error('boom'),
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await analyzeGaps();

      expect(result.analysis).toMatchObject({ error: 'Failed to load papers registry' });
    });

    it('still succeeds when both registries read cleanly', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: { papers: { p1: { topics: ['prompting'] } } },
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await analyzeGaps();

      expect(result.success).toBe(true);
      expect(result.analysis).not.toMatchObject({ error: expect.any(String) });
    });
  });
});
