/**
 * Tests for research_synthesize MCP tool.
 *
 * @module mcp/tools/research-synthesize.test
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchSynthesizeTool,
  ResearchSynthesizeInputSchema,
} from './research-synthesize.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../cli/research-helpers-synthesize.js', () => ({
  synthesizeResearch: vi.fn(),
}));

vi.mock('../middleware/tool-error-handler.js', () => ({
  withToolError: vi.fn((_msg: string, _logger: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: vi.fn((_name: string, handler: unknown) => handler),
  toSdkCallback: vi.fn((handler: unknown) => handler),
  getToolTimeout: vi.fn(() => 30000),
}));

vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: vi.fn((handler: unknown) => handler),
}));

// ============================================================================
// Tests
// ============================================================================

describe('research-synthesize', () => {
  describe('ResearchSynthesizeInputSchema', () => {
    it('accepts empty object', () => {
      const result = ResearchSynthesizeInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts topic filter', () => {
      const result = ResearchSynthesizeInputSchema.safeParse({ topic: 'memory' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topic).toBe('memory');
      }
    });

    it('rejects non-string topic', () => {
      const result = ResearchSynthesizeInputSchema.safeParse({ topic: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('registerResearchSynthesizeTool', () => {
    let mockServer: { registerTool: ReturnType<typeof vi.fn> };
    let mockRateLimiter: RateLimiter;

    beforeEach(() => {
      mockServer = { registerTool: vi.fn() };
      mockRateLimiter = {
        tryConsume: vi.fn().mockReturnValue({ ok: true, value: undefined }),
      } as unknown as RateLimiter;
    });

    it('registers tool with correct name', () => {
      registerResearchSynthesizeTool(mockServer as unknown as McpServer, {
        rateLimiter: mockRateLimiter,
      });
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_synthesize',
        expect.objectContaining({ description: expect.any(String) }),
        expect.any(Function)
      );
    });

    it('includes synthesis description', () => {
      registerResearchSynthesizeTool(mockServer as unknown as McpServer, {
        rateLimiter: mockRateLimiter,
      });
      const call = mockServer.registerTool.mock.calls[0] as unknown[];
      if (call === undefined) return;
      const meta = call[1] as { description: string };
      expect(meta.description).toContain('Synthesize');
      expect(meta.description).toContain('topic clusters');
    });
  });
});
