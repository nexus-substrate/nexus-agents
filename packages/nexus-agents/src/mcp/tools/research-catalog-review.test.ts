/**
 * Tests for research_catalog_review MCP tool.
 *
 * @module mcp/tools/research-catalog-review.test
 * (Source: Research System Enhancement - Phase 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchCatalogReviewTool,
  ResearchCatalogReviewInputSchema,
  type ResearchCatalogReviewDeps,
} from './research-catalog-review.js';
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

describe('research_catalog_review tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ResearchCatalogReviewDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('ResearchCatalogReviewInputSchema', () => {
    it('should accept valid list action', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({ action: 'list' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('list');
      }
    });

    it('should accept approve action with identifier and topic', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({
        action: 'approve',
        identifier: '2401.12345',
        topic: 'agents',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('approve');
        expect(result.data.identifier).toBe('2401.12345');
        expect(result.data.topic).toBe('agents');
      }
    });

    it('should accept approve action with createIssue option', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({
        action: 'approve',
        identifier: '2401.12345',
        createIssue: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('approve');
        expect(result.data.createIssue).toBe(true);
      }
    });

    it('should accept dismiss action with identifier', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({
        action: 'dismiss',
        identifier: '2401.12345',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('dismiss');
        expect(result.data.identifier).toBe('2401.12345');
      }
    });

    it('should accept valid flush action', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({ action: 'flush' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('flush');
      }
    });

    it('should reject invalid action', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({ action: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing action', () => {
      const result = ResearchCatalogReviewInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('registerResearchCatalogReviewTool', () => {
    it('should register the tool with correct name', () => {
      registerResearchCatalogReviewTool(
        mockServer as unknown as Parameters<typeof registerResearchCatalogReviewTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_catalog_review',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerResearchCatalogReviewTool(
        mockServer as unknown as Parameters<typeof registerResearchCatalogReviewTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ action: 'list' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });
  });
});
