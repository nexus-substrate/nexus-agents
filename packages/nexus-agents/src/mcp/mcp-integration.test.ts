/**
 * MCP Server Integration Tests
 *
 * End-to-end tests validating the full MCP protocol contract:
 * server startup, tool registration, tool invocation, and error handling.
 * Uses InMemoryTransport for deterministic, fast testing.
 *
 * @module mcp/mcp-integration.test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from './server.js';
import {
  registerTools,
  registerDelegateToModelTool,
  registerListExpertsTool,
  registerListWorkflowsTool,
  registerConsensusVoteTool,
  registerWeatherReportTool,
} from './tools/index.js';
import type { IWorkflowEngine } from '../core/index.js';

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  toolNames: readonly string[];
  cleanup: () => Promise<void>;
}

/** Registered tool names for this integration test. */
const INTEGRATION_TOOLS = [
  'delegate_to_model',
  'list_experts',
  'list_workflows',
  'consensus_vote',
  'weather_report',
] as const;

async function setupMcpServer(): Promise<TestContext> {
  const serverResult = createServer();
  if (!serverResult.ok) throw new Error(serverResult.error.message);

  const { server, logger } = serverResult.value;

  // Initialize shared tool infrastructure (logger, rate limiter)
  const infra = registerTools(server, { logger });

  // Stub workflow engine that returns empty template list
  const stubEngine = {
    listTemplates: () => Promise.resolve({ ok: true, value: [] }),
  } as unknown as IWorkflowEngine;

  // Register lightweight tools that work without model adapters
  registerDelegateToModelTool(server, {
    logger: infra.logger,
    rateLimiter: infra.rateLimiter,
  });
  registerListExpertsTool(server, {
    logger: infra.logger,
    rateLimiter: infra.rateLimiter,
  });
  registerListWorkflowsTool(server, {
    logger: infra.logger,
    rateLimiter: infra.rateLimiter,
    workflowEngine: stubEngine,
  });
  registerConsensusVoteTool(server, {
    logger: infra.logger,
    rateLimiter: infra.rateLimiter,
  });
  registerWeatherReportTool(server, {
    logger: infra.logger,
    rateLimiter: infra.rateLimiter,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    toolNames: INTEGRATION_TOOLS,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MCP Server Integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupMcpServer();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // --------------------------------------------------------------------------
  // Server Identity
  // --------------------------------------------------------------------------

  it('reports server name and version', () => {
    const info = ctx.client.getServerVersion();
    expect(info).toBeDefined();
    expect(info?.name).toBe('nexus-agents');
  });

  // --------------------------------------------------------------------------
  // Tool Discovery
  // --------------------------------------------------------------------------

  it('lists all registered tools via protocol', async () => {
    const result = await ctx.client.listTools();
    const names = result.tools.map((t) => t.name);

    for (const tool of ctx.toolNames) {
      expect(names).toContain(tool);
    }
  });

  it('each tool has a description', async () => {
    const result = await ctx.client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('each tool has a valid input schema', async () => {
    const result = await ctx.client.listTools();
    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  // --------------------------------------------------------------------------
  // Tool Invocation — delegate_to_model
  // --------------------------------------------------------------------------

  it('delegate_to_model returns model recommendation', async () => {
    const result = await ctx.client.callTool({
      name: 'delegate_to_model',
      arguments: { task: 'Write a unit test for auth middleware' },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    const first = content[0];
    expect(first).toBeDefined();
    const parsed = JSON.parse(first?.text ?? '') as Record<string, unknown>;
    expect(parsed).toHaveProperty('recommended_model');
    expect(parsed).toHaveProperty('reasoning');
  });

  // --------------------------------------------------------------------------
  // Tool Invocation — list_experts
  // --------------------------------------------------------------------------

  it('list_experts returns available expert roles', async () => {
    const result = await ctx.client.callTool({
      name: 'list_experts',
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    const parsed = JSON.parse(first?.text ?? '') as Record<string, unknown>;
    expect(parsed).toHaveProperty('experts');
    const experts = parsed['experts'] as unknown[];
    expect(experts.length).toBeGreaterThanOrEqual(7);
  });

  // --------------------------------------------------------------------------
  // Tool Invocation — list_workflows
  // --------------------------------------------------------------------------

  it('list_workflows returns response', async () => {
    const result = await ctx.client.callTool({
      name: 'list_workflows',
      arguments: {},
    });
    // Response may be success or error depending on engine availability
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Tool Invocation — weather_report
  // --------------------------------------------------------------------------

  it('weather_report returns per-CLI data', async () => {
    const result = await ctx.client.callTool({
      name: 'weather_report',
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    const parsed = JSON.parse(first?.text ?? '') as Record<string, unknown>;
    // Weather report returns serialized report with CLI weather entries
    expect(parsed).toHaveProperty('cliWeather');
  });

  // --------------------------------------------------------------------------
  // Input Validation — Zod at Transport Level
  // --------------------------------------------------------------------------

  it('rejects delegate_to_model with empty task', async () => {
    const result = await ctx.client.callTool({
      name: 'delegate_to_model',
      arguments: { task: '' },
    });
    expect(result.isError).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Rate Limiting via Transport
  // --------------------------------------------------------------------------

  it('rate limiter allows normal request volume', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await ctx.client.callTool({
        name: 'list_experts',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // consensus_vote — simulateVotes fails closed outside test runners (#4170)
  // --------------------------------------------------------------------------

  it('consensus_vote rejects simulateVotes outside a test runner — sync and async modes (#4170)', async () => {
    const originalVitest = process.env['VITEST'];
    const originalNodeEnv = process.env['NODE_ENV'];
    const originalAllowSimulate = process.env['NEXUS_ALLOW_SIMULATE'];
    // Simulate a non-test-runner process: the guard reads the env at call time.
    delete process.env['VITEST'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['NEXUS_ALLOW_SIMULATE'];
    try {
      const syncResult = await ctx.client.callTool({
        name: 'consensus_vote',
        arguments: { proposal: 'Approve this change', simulateVotes: true },
      });
      expect(syncResult.isError).toBe(true);
      const syncText = (syncResult.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(syncText).toContain('NEXUS_ALLOW_SIMULATE');

      // Async mode must reject IDENTICALLY — the gate sits in the sync prelude
      // before runAsJob, so no pending envelope (and no background random vote)
      // ever escapes.
      const asyncResult = await ctx.client.callTool({
        name: 'consensus_vote',
        arguments: { proposal: 'Approve this change', simulateVotes: true, mode: 'async' },
      });
      expect(asyncResult.isError).toBe(true);
      const asyncText = (asyncResult.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(asyncText).toContain('NEXUS_ALLOW_SIMULATE');
    } finally {
      if (originalVitest === undefined) delete process.env['VITEST'];
      else process.env['VITEST'] = originalVitest;
      if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = originalNodeEnv;
      if (originalAllowSimulate === undefined) delete process.env['NEXUS_ALLOW_SIMULATE'];
      else process.env['NEXUS_ALLOW_SIMULATE'] = originalAllowSimulate;
    }
  });
});
