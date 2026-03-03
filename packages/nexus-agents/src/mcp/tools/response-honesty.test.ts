/**
 * Tool Response Honesty Contract Tests
 *
 * Verifies that MCP tools accurately report success/failure.
 * See CODING_STANDARDS.md §5.4 for the full contract.
 *
 * @module mcp/tools/response-honesty.test
 * (Source: Issue #992 — Tool response honesty contract)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from '../server.js';
import { registerTools, registerExecuteExpertTool, registerRunGraphWorkflowTool } from './index.js';
import type { Expert } from '../../agents/index.js';

// Mock adapter availability — this test is about honesty contracts, not adapter detection
vi.mock('../middleware/adapter-availability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/adapter-availability.js')>();
  return { ...actual, requireAdapterAvailable: () => Promise.resolve(undefined) };
});

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  expertRegistry: Map<string, Expert>;
  cleanup: () => Promise<void>;
}

/** Creates a mock expert that always fails execution. */
function createFailingExpert(role: string): Expert {
  return {
    id: `${role}-fail`,
    role,
    capabilities: ['task_execution'] as const,
    state: 'idle',
    expertConfig: {
      id: `${role}-fail`,
      name: `${role} Failing`,
      role,
      systemPrompt: 'Mock prompt',
      capabilities: ['task_execution'],
    },
    name: `${role} Failing`,
    metadata: undefined,
    execute: vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new Error('Model returned empty response'),
      })
    ),
  } as unknown as Expert;
}

async function setupServer(): Promise<TestContext> {
  const serverResult = createServer();
  if (!serverResult.ok) throw new Error(serverResult.error.message);
  const { server, logger } = serverResult.value;

  const infra = registerTools(server, { logger });
  const baseDeps = { logger: infra.logger, rateLimiter: infra.rateLimiter };
  const expertRegistry = new Map<string, Expert>();

  registerExecuteExpertTool(server, { ...baseDeps, expertRegistry });
  registerRunGraphWorkflowTool(server, { ...baseDeps, rateLimiter: infra.rateLimiter });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'honesty-test', version: '1.0.0' });
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
// Honesty Contract Tests
// ============================================================================

describe('Tool Response Honesty Contract (§5.4)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupServer();
  });

  beforeEach(() => {
    // Reset vi.fn() mocks between tests — vitest 4 restoreAllMocks only resets vi.spyOn()
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // --------------------------------------------------------------------------
  // Rule 1: Never report success when the action failed
  // --------------------------------------------------------------------------

  describe('Rule 1: Failed actions must return isError=true', () => {
    it(
      'execute_expert returns isError when expert execution fails',
      { timeout: MCP_TASK_TIMEOUT },
      async () => {
        const failingExpert = createFailingExpert('code_expert');
        ctx.expertRegistry.set('failing-expert', failingExpert);

        const result = await ctx.client.callTool({
          name: 'execute_expert',
          arguments: {
            expertId: 'failing-expert',
            task: 'Review this code',
          },
        });

        // Honesty contract: failed execution MUST set isError=true
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
        expect(text).toContain('failed');
      }
    );

    it(
      'run_graph_workflow returns isError for invalid workflow',
      { timeout: MCP_TASK_TIMEOUT },
      async () => {
        const result = await ctx.client.callTool({
          name: 'run_graph_workflow',
          arguments: { workflow: 'nonexistent-workflow-xyz' },
        });

        // Honesty contract: unknown workflow MUST set isError=true
        expect(result.isError).toBe(true);
      }
    );
  });

  // --------------------------------------------------------------------------
  // Rule 3: Error propagation, not absorption
  // --------------------------------------------------------------------------

  describe('Rule 3: Domain errors propagate to MCP response', () => {
    it(
      'execute_expert does not wrap domain errors in ok:true',
      { timeout: MCP_TASK_TIMEOUT },
      async () => {
        const failingExpert = createFailingExpert('security_expert');
        ctx.expertRegistry.set('wrapped-error-test', failingExpert);

        const result = await ctx.client.callTool({
          name: 'execute_expert',
          arguments: {
            expertId: 'wrapped-error-test',
            task: 'Audit this module',
          },
        });

        // The error message should be surfaced, not hidden in a success JSON
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
        // Should contain the original error, not a generic wrapper
        expect(text.toLowerCase()).toContain('model returned empty response');
      }
    );
  });
});
