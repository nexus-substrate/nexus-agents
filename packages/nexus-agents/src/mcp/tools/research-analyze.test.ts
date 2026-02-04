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
  type ResearchAnalyzeDeps,
} from './research-analyze.js';
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
});
