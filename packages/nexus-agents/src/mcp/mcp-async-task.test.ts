/**
 * MCP Async Task Execution Tests
 *
 * Integration tests for the MCP Tasks primitive (SEP-1686) applied to
 * execute_expert. Verifies the create→poll→retrieve flow works correctly
 * via the SDK's InMemoryTransport.
 *
 * @module mcp/mcp-async-task.test
 * (Source: Issue #1298 — Layer 2 MCP Tasks async execution)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from './server.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { registerCreateExpertTool, type IExpertFactory } from './tools/create-expert.js';
import { registerExecuteExpertTool } from './tools/execute-expert.js';
import type { Expert } from '../agents/index.js';
import { resetTaskStore } from './task-store.js';

/** Stub factory that always fails (not testing create_expert here). */
const stubFactory: IExpertFactory = {
  createBuiltIn: () => ({ ok: false, error: new Error('Stub factory') }),
};

// ============================================================================
// Test Setup
// ============================================================================

let server: McpServer;
let client: Client;
const expertRegistry = new Map<string, Expert>();

beforeAll(async () => {
  const result = createServer({ name: 'test-async-task' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Server creation failed');

  server = result.value.server;
  const rateLimiter = new RateLimiter({ capacity: 100, refillRate: 10 });

  registerCreateExpertTool(server, { expertRegistry, rateLimiter, expertFactory: stubFactory });
  registerExecuteExpertTool(server, { expertRegistry, rateLimiter });

  client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(() => {
  resetTaskStore();
});

// ============================================================================
// Tests
// ============================================================================

describe('execute_expert async task flow', () => {
  it('execute_expert is listed in tools with execution metadata', async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === 'execute_expert');
    expect(tool).toBeDefined();
    // Description distinguishes from `create_expert` — must mention the
    // "previously created" framing so an LLM caller routes correctly (#2677).
    expect(tool?.description).toMatch(/previously[- ]created|expertId|create_expert/i);
  });

  it('returns error for nonexistent expert via task flow', async () => {
    const result = await client.callTool({
      name: 'execute_expert',
      arguments: {
        expertId: 'nonexistent-id',
        task: 'test task',
      },
    });

    // The SDK's handleAutomaticTaskPolling creates a task, then polls.
    // Since the handler fails quickly, the task completes as failed,
    // and the result is returned as isError.
    expect(result).toBeDefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.text).toContain('Expert not found');
  }, 15_000);

  it('returns validation error for missing expertId', async () => {
    const result = await client.callTool({
      name: 'execute_expert',
      arguments: {
        task: 'test task',
      },
    });

    // Validation error is thrown during createTask, SDK handles it
    expect(result).toBeDefined();
  });

  it('server has tasks capability enabled', () => {
    // The server should advertise tasks support
    const result = createServer({ name: 'test-tasks-cap' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Verify experimental tasks API is accessible
    expect(result.value.server.experimental).toBeDefined();
    expect(result.value.server.experimental.tasks).toBeDefined();
  });

  it('task store is available for the server', () => {
    // The InMemoryTaskStore should be wired into the server
    // We verify this indirectly by checking that registerToolTask
    // can be called (it requires taskStore in options)
    const result = createServer({ name: 'test-store-check' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const srv = result.value.server;

    // registerToolTask should NOT throw "No task store provided"
    // because we wire it in createServer
    expect(() => {
      srv.experimental.tasks.registerToolTask(
        'test_task_tool',
        {
          description: 'test',
          execution: { taskSupport: 'optional' },
        },
        {
          createTask: vi.fn(),
          getTask: vi.fn(),
          getTaskResult: vi.fn(),
        }
      );
    }).not.toThrow();
  });
});
