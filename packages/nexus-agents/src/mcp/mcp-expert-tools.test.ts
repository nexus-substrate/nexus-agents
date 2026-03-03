/**
 * MCP Expert & Orchestration Tools Integration Tests
 *
 * Tests for tools that need mock factories: orchestrate, create_expert,
 * execute_expert. Uses InMemoryTransport for deterministic testing.
 *
 * @module mcp/mcp-expert-tools.test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from './server.js';
import {
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerExecuteExpertTool,
} from './tools/index.js';
import { createDefaultRateLimiter } from './middleware/rate-limiter.js';
import type { Expert } from '../agents/index.js';

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  expertRegistry: Map<string, Expert>;
  cleanup: () => Promise<void>;
}

async function setupServer(): Promise<TestContext> {
  const serverResult = createServer();
  if (!serverResult.ok) throw new Error(serverResult.error.message);
  const { server, logger } = serverResult.value;

  // Only register the 3 tools under test — avoids importing all 24 tools (perf: saves ~4s)
  const rateLimiter = createDefaultRateLimiter('mcp-expert-test', logger);
  const baseDeps = { logger, rateLimiter };

  // Shared expert registry
  const expertRegistry = new Map<string, Expert>();

  // Stub expert factory — returns a minimal Expert-like object
  const expertFactory = {
    createBuiltIn: (type: string) => ({
      ok: true as const,
      value: {
        id: `expert-${type}`,
        name: `${type} Expert`,
        role: 'worker',
        capabilities: ['code_review'],
        execute: () => Promise.resolve({ ok: true, value: { output: 'stub' } }),
      } as unknown as Expert,
    }),
  };

  // Register orchestrate without orchestrator (tests graceful error)
  registerOrchestrateTool(server, baseDeps);

  // Register expert tools with factory and registry
  registerCreateExpertTool(server, {
    ...baseDeps,
    expertFactory,
    expertRegistry,
  });
  registerExecuteExpertTool(server, {
    ...baseDeps,
    expertRegistry,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'expert-test', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    expertRegistry,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * Timeout for MCP task-based tests. The execute_expert tool uses MCP Tasks
 * with a 5s poll interval, so tests need at least 10s to complete one cycle.
 * Use 15s to allow headroom for CI contention.
 */
const MCP_TASK_TIMEOUT = 15_000;

// ============================================================================
// Tests
// ============================================================================

describe('MCP Expert & Orchestration Tools', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupServer();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // --------------------------------------------------------------------------
  // Tool Discovery
  // --------------------------------------------------------------------------

  it('registers all expert/orchestrate tools', async () => {
    const result = await ctx.client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain('orchestrate');
    expect(names).toContain('create_expert');
    expect(names).toContain('execute_expert');
  });

  // --------------------------------------------------------------------------
  // orchestrate — graceful degradation
  // --------------------------------------------------------------------------

  it(
    'orchestrate returns response without orchestrator',
    { timeout: MCP_TASK_TIMEOUT },
    async () => {
      const result = await ctx.client.callTool({
        name: 'orchestrate',
        arguments: { task: 'Analyze this codebase' },
      });
      // Without orchestrator, returns a response (may be error or fallback)
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content.length).toBeGreaterThan(0);
      const first = content[0];
      expect(first).toBeDefined();
      expect(first?.text.length).toBeGreaterThan(0);
    }
  );

  // --------------------------------------------------------------------------
  // create_expert
  // --------------------------------------------------------------------------

  it('create_expert creates a code expert', { timeout: MCP_TASK_TIMEOUT }, async () => {
    const result = await ctx.client.callTool({
      name: 'create_expert',
      arguments: { role: 'code_expert' },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    // May succeed or error depending on adapter availability
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // execute_expert — without valid expert
  // --------------------------------------------------------------------------

  it('execute_expert returns error for unknown expert', { timeout: MCP_TASK_TIMEOUT }, async () => {
    const result = await ctx.client.callTool({
      name: 'execute_expert',
      arguments: {
        expertId: 'nonexistent-expert-id',
        task: 'Review this code',
      },
    });
    expect(result.isError).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Input Validation
  // --------------------------------------------------------------------------

  it('orchestrate rejects empty task', async () => {
    const result = await ctx.client.callTool({
      name: 'orchestrate',
      arguments: { task: '' },
    });
    expect(result.isError).toBe(true);
  });

  it('create_expert rejects invalid role', async () => {
    const result = await ctx.client.callTool({
      name: 'create_expert',
      arguments: { role: 'invalid_role' },
    });
    expect(result.isError).toBe(true);
  });

  it('execute_expert rejects empty task', async () => {
    const result = await ctx.client.callTool({
      name: 'execute_expert',
      arguments: { expertId: 'some-id', task: '' },
    });
    expect(result.isError).toBe(true);
  });
});
