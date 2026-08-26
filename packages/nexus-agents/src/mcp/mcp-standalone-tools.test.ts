/**
 * MCP Standalone Tools Integration Tests
 *
 * Tests for tools that only need logger + rateLimiter as dependencies.
 * Covers: registry_import, issue_triage, run_graph_workflow, execute_spec,
 * research_* (5 tools), memory_* (2 tools), and run_workflow.
 *
 * @module mcp/mcp-standalone-tools.test
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  registerResearchSynthesizeTool,
  registerMemoryQueryTool,
  registerMemoryStatsTool,
  registerMemoryWriteTool,
  registerRunWorkflowTool,
} from './tools/index.js';
import type { IWorkflowEngine } from '../core/index.js';

// #4629: this test reached a real CLI binary through the CLI-detection layer.
// The memory_query call below runs reflective retrieval, which asks the
// registry for a default adapter, and the auto-adapter probes every CLI to
// find one, so `opencode --version` and `opencode auth list` were actually
// spawned. Stub the factory so detection answers "nothing available"; every
// tool under test stays real. Keep this a full module replacement — with an
// `importOriginal` spread the real module still wins for auto-adapter's own
// import and the spawns come back.
vi.mock('../cli-adapters/factory.js', () => ({
  createCliAdapter: vi.fn(),
  createAllAdapters: vi.fn(() => new Map()),
  isCliAvailable: vi.fn().mockResolvedValue(false),
  getAvailableClis: vi.fn().mockResolvedValue([]),
}));

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
  'research_synthesize',
  'memory_query',
  'memory_stats',
  'memory_write',
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
  registerResearchSynthesizeTool(server, deps);
  registerMemoryQueryTool(server, deps);
  registerMemoryStatsTool(server, deps);
  registerMemoryWriteTool(server, deps);

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
  // Output-schema round-trip (#5045)
  // --------------------------------------------------------------------------

  /**
   * A response field missing from a tool's declared `outputSchema` does not go
   * unreported — the SDK validates structured content with
   * `additionalProperties: false`, so EVERY call fails with -32602 and the tool
   * becomes unusable. #5044 shipped exactly that and was caught only because
   * `memory_query` happens to be round-tripped here.
   *
   * The tool's own tests cannot see it: they call the registered handler
   * directly and never cross the protocol. So the guard has to be a real client
   * call, and the assertion is narrow on purpose — a business failure is fine,
   * an output-schema violation is not.
   */
  const SCHEMA_ROUND_TRIP: readonly { name: string; args: Record<string, unknown> }[] = [
    { name: 'memory_write', args: { key: 'rt-key', content: 'round-trip', backend: 'session' } },
    { name: 'research_synthesize', args: {} },
    { name: 'run_workflow', args: { action: 'list' } },
    { name: 'research_add', args: { title: 'rt', url: 'https://example.invalid/rt' } },
  ];

  for (const { name, args } of SCHEMA_ROUND_TRIP) {
    it(`${name} response satisfies its declared outputSchema`, async () => {
      let failure = '';
      try {
        await ctx.client.callTool({ name, arguments: args });
      } catch (error: unknown) {
        failure = error instanceof Error ? error.message : JSON.stringify(error);
      }

      // A tool may legitimately refuse these arguments; what it may not do is
      // return structured content its own schema rejects.
      expect(failure).not.toContain('output schema');
      expect(failure).not.toContain('-32602');
    });
  }

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
