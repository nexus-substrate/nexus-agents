/**
 * Tests for list_experts MCP tool.
 *
 * @module mcp/tools/list-experts.test
 * (Source: Issue #436 - Add discoverability tools)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerListExpertsTool, type ListExpertsDeps } from './list-experts.js';
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

describe('list_experts tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ListExpertsDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('registerListExpertsTool', () => {
    it('should register the tool with the server', () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'list_experts',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should return list of available experts', async () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      const calls = mockServer.registerTool.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const handler = calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      expect(handler).toBeDefined();

      const result = await handler({});
      expect(result.isError).toBeUndefined();

      const text = result.content[0]?.text ?? '{}';
      expect(text).not.toBe('{}');
      const parsed = JSON.parse(text);

      expect(parsed.count).toBeGreaterThan(0);
      expect(parsed.experts).toBeInstanceOf(Array);
      expect(parsed.experts.length).toBe(12); // 10 built-in experts

      // Check structure
      const expert = parsed.experts[0];
      expect(expert).toHaveProperty('role');
      expect(expert).toHaveProperty('name');
      expect(expert).toHaveProperty('description');
      expect(expert).toHaveProperty('capabilities');
    });

    it('should include all built-in expert types', async () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ content: Array<{ text: string }> }>;
      const result = await handler({});
      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
        experts: Array<{ role: string }>;
      };

      const roles = parsed.experts.map((e) => e.role);
      expect(roles).toContain('code_expert');
      expect(roles).toContain('architecture_expert');
      expect(roles).toContain('security_expert');
      expect(roles).toContain('documentation_expert');
      expect(roles).toContain('testing_expert');
      expect(roles).toContain('devops_expert');
    });

    it('should return names only when format is "names"', async () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ content: Array<{ text: string }> }>;
      const result = await handler({ format: 'names' });
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');

      expect(parsed.experts.length).toBe(12);
      const expert = parsed.experts[0];
      expect(expert.role).toBeDefined();
      expect(expert.name).toBeDefined();
      expect(expert.description).not.toBe('');
      expect(expert.description).toMatch(/\.$/);
      expect(expert.capabilities).toEqual([]);
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      // registerTool signature: (name, options, handler)
      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });

    it('should handle invalid format parameter', async () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      // registerTool signature: (name, options, handler)
      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ format: 'invalid' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('should register with outputSchema (Issue #1117)', () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      const config = mockServer.registerTool.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(config).toHaveProperty('outputSchema');
      const schema = config['outputSchema'] as Record<string, unknown>;
      expect(schema).toHaveProperty('experts');
      expect(schema).toHaveProperty('count');
    });

    it('should return structuredContent alongside content (Issue #1117)', async () => {
      registerListExpertsTool(
        mockServer as unknown as Parameters<typeof registerListExpertsTool>[0],
        deps
      );

      type StructuredResult = {
        content: Array<{ text: string }>;
        structuredContent?: Record<string, unknown>;
      };
      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<StructuredResult>;
      const result = await handler({});

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc['count']).toBe(12);
      expect(Array.isArray(sc['experts'])).toBe(true);
    });
  });
});
