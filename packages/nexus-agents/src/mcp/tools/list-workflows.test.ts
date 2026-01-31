/**
 * Tests for list_workflows MCP tool.
 *
 * @module mcp/tools/list-workflows.test
 * (Source: Issue #436 - Add discoverability tools)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerListWorkflowsTool, type ListWorkflowsDeps } from './list-workflows.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import type { IWorkflowEngine } from '../../core/index.js';

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

// Mock workflow engine with templates
function createMockWorkflowEngine(): IWorkflowEngine {
  return {
    listTemplates: vi.fn().mockResolvedValue([
      {
        name: 'code-review',
        version: '1.0.0',
        path: '/templates/code-review.yaml',
        description: 'Code review workflow',
        category: 'development',
      },
      {
        name: 'security-audit',
        version: '1.0.0',
        path: '/templates/security-audit.yaml',
        description: 'Security audit workflow',
        category: 'security',
      },
      {
        name: 'test-generation',
        version: '1.0.0',
        path: '/templates/test-generation.yaml',
        description: 'Test generation workflow',
        category: 'development',
      },
    ]),
    loadTemplate: vi.fn(),
    execute: vi.fn(),
    getStatus: vi.fn(),
    cancel: vi.fn(),
  };
}

// Handler type alias for cleaner test code
type ToolHandler = (
  args: unknown
) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

describe('list_workflows tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockWorkflowEngine: IWorkflowEngine;
  let deps: ListWorkflowsDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    mockWorkflowEngine = createMockWorkflowEngine();
    deps = {
      workflowEngine: mockWorkflowEngine,
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('registerListWorkflowsTool', () => {
    it('should register the tool with the server', () => {
      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'list_workflows',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should return list of available workflows', async () => {
      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');

      expect(parsed.count).toBe(3);
      expect(parsed.workflows).toBeInstanceOf(Array);
      expect(parsed.categories).toEqual(['development', 'security']);

      // Check structure
      const workflow = parsed.workflows[0];
      expect(workflow).toHaveProperty('name');
      expect(workflow).toHaveProperty('version');
      expect(workflow).toHaveProperty('description');
      expect(workflow).toHaveProperty('category');
    });

    it('should filter by category', async () => {
      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({ category: 'development' });
      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
        count: number;
        workflows: Array<{ category: string }>;
      };

      expect(parsed.count).toBe(2);
      expect(parsed.workflows.every((w) => w.category === 'development')).toBe(true);
    });

    it('should filter by category case-insensitively', async () => {
      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({ category: 'SECURITY' });
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');

      expect(parsed.count).toBe(1);
      expect(parsed.workflows[0].name).toBe('security-audit');
    });

    it('should return names only when format is "names"', async () => {
      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({ format: 'names' });
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');

      expect(parsed.count).toBe(3);
      const workflow = parsed.workflows[0];
      expect(workflow.name).toBeDefined();
      expect(workflow.version).toBeDefined();
      expect(workflow.description).toBeUndefined();
      expect(workflow.category).toBeUndefined();
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });

    it('should handle empty workflow list', async () => {
      const emptyEngine = createMockWorkflowEngine();
      (emptyEngine.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      deps.workflowEngine = emptyEngine;

      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({});
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');

      expect(parsed.count).toBe(0);
      expect(parsed.workflows).toEqual([]);
    });

    it('should handle workflow engine errors', async () => {
      const errorEngine = createMockWorkflowEngine();
      (errorEngine.listTemplates as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Engine unavailable')
      );
      deps.workflowEngine = errorEngine;

      registerListWorkflowsTool(
        mockServer as unknown as Parameters<typeof registerListWorkflowsTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as ToolHandler;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Engine unavailable');
    });
  });
});
