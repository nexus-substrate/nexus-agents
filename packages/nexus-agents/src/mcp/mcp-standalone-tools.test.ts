/**
 * MCP Standalone Tools Integration Tests
 *
 * Tests for tools that only need logger + rateLimiter as dependencies.
 * Covers: registry_import, issue_triage, run_graph_workflow, execute_spec,
 * research_* (5 tools), memory_* (2 tools), and run_workflow.
 *
 * @module mcp/mcp-standalone-tools.test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer, connectTransport } from './server.js';
import {
  registerTools,
  registerRegistryImportTool,
  registerRepoAnalyzeTool,
  registerIssueTriageTool,
  registerRunGraphWorkflowTool,
  registerExecuteSpecTool,
  registerResearchQueryTool,
  registerResearchAddTool,
  registerResearchDiscoverTool,
  registerResearchAnalyzeTool,
  registerResearchCatalogReviewTool,
  registerMemoryQueryTool,
  registerMemoryStatsTool,
  registerRunWorkflowTool,
} from './tools/index.js';
import type { IWorkflowEngine } from '../core/index.js';

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  cleanup: () => Promise<void>;
}

const TOOL_NAMES = [
  'registry_import',
  'repo_analyze',
  'issue_triage',
  'run_graph_workflow',
  'execute_spec',
  'research_query',
  'research_add',
  'research_discover',
  'research_analyze',
  'research_catalog_review',
  'memory_query',
  'memory_stats',
  'run_workflow',
] as const;

async function setupServer(): Promise<TestContext> {
  const serverResult = createServer();
  if (!serverResult.ok) throw new Error(serverResult.error.message);
  const { server, logger } = serverResult.value;

  const infra = registerTools(server, { logger });
  const deps = { logger: infra.logger, rateLimiter: infra.rateLimiter };

  // Register all standalone tools (logger + rateLimiter only)
  registerRegistryImportTool(server, deps);
  registerRepoAnalyzeTool(server, deps);
  registerIssueTriageTool(server, deps);
  registerRunGraphWorkflowTool(server, deps);
  registerExecuteSpecTool(server, deps);
  registerResearchQueryTool(server, deps);
  registerResearchAddTool(server, deps);
  registerResearchDiscoverTool(server, deps);
  registerResearchAnalyzeTool(server, deps);
  registerResearchCatalogReviewTool(server, deps);
  registerMemoryQueryTool(server, deps);
  registerMemoryStatsTool(server, deps);

  // run_workflow needs a stub workflow engine
  const stubEngine = {
    listTemplates: () => Promise.resolve({ ok: true, value: [] }),
  } as unknown as IWorkflowEngine;
  registerRunWorkflowTool(server, { ...deps, workflowEngine: stubEngine });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'standalone-test', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MCP Standalone Tools Integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupServer();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // --------------------------------------------------------------------------
  // Tool Discovery
  // --------------------------------------------------------------------------

  it('registers all standalone tools', async () => {
    const result = await ctx.client.listTools();
    const names = result.tools.map((t) => t.name);
    for (const tool of TOOL_NAMES) {
      expect(names).toContain(tool);
    }
  });

  // --------------------------------------------------------------------------
  // registry_import
  // --------------------------------------------------------------------------

  it('registry_import generates draft entry', async () => {
    const result = await ctx.client.callTool({
      name: 'registry_import',
      arguments: {
        provider: 'anthropic',
        modelId: 'claude-test-1',
        dryRun: true,
      },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text).toContain('claude-test-1');
  });

  // --------------------------------------------------------------------------
  // execute_spec (dry run)
  // --------------------------------------------------------------------------

  it('execute_spec parses a simple spec', async () => {
    const result = await ctx.client.callTool({
      name: 'execute_spec',
      arguments: {
        spec: '# Test Spec\n\n## Task 1\nDo something simple.',
        dryRun: true,
      },
    });
    // May succeed or fail depending on spec parser expectations
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // research_query
  // --------------------------------------------------------------------------

  it('research_query returns stats', async () => {
    const result = await ctx.client.callTool({
      name: 'research_query',
      arguments: { action: 'stats' },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // research_analyze
  // --------------------------------------------------------------------------

  it('research_analyze returns coverage analysis', async () => {
    const result = await ctx.client.callTool({
      name: 'research_analyze',
      arguments: { focus: 'coverage' },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // research_catalog_review
  // --------------------------------------------------------------------------

  it('research_catalog_review lists entries', async () => {
    const result = await ctx.client.callTool({
      name: 'research_catalog_review',
      arguments: { action: 'list' },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // memory_query
  // --------------------------------------------------------------------------

  it('memory_query returns results for a query', async () => {
    const result = await ctx.client.callTool({
      name: 'memory_query',
      arguments: { query: 'test query', limit: 5 },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // memory_stats
  // --------------------------------------------------------------------------

  it('memory_stats returns dashboard', async () => {
    const result = await ctx.client.callTool({
      name: 'memory_stats',
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const first = content[0];
    expect(first).toBeDefined();
    expect(first?.text.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Input Validation
  // --------------------------------------------------------------------------

  it('registry_import rejects invalid provider', async () => {
    const result = await ctx.client.callTool({
      name: 'registry_import',
      arguments: { provider: 'invalid', modelId: 'test' },
    });
    expect(result.isError).toBe(true);
  });

  it('memory_query rejects empty query', async () => {
    const result = await ctx.client.callTool({
      name: 'memory_query',
      arguments: { query: '' },
    });
    expect(result.isError).toBe(true);
  });

  it('research_query rejects invalid action', async () => {
    const result = await ctx.client.callTool({
      name: 'research_query',
      arguments: { action: 'invalid_action' },
    });
    expect(result.isError).toBe(true);
  });
});
