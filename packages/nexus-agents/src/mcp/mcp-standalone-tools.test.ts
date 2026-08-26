/**
 * MCP Standalone Tools Integration Tests
 *
 * Tests for tools that only need logger + rateLimiter as dependencies.
 * Covers: registry_import, issue_triage, run_graph_workflow, execute_spec,
 * research_* (5 tools), memory_* (2 tools), and run_workflow.
 *
 * @module mcp/mcp-standalone-tools.test
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  registerListExpertsTool,
  registerWeatherReportTool,
  registerResearchAddSourceTool,
  registerSurveyOssLandscapeTool,
  registerVendorPublishingAuditTool,
  registerCompareDataFeedsTool,
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
  // #5045: these six declare an `outputSchema` and need nothing but the base
  // deps, so leaving them off this server left their protocol boundary
  // untested for no reason.
  registerListExpertsTool(server, deps);
  registerWeatherReportTool(server, deps);
  registerResearchAddSourceTool(server, deps);
  registerSurveyOssLandscapeTool(server, deps);
  registerVendorPublishingAuditTool(server, deps);
  registerCompareDataFeedsTool(server, deps);

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
  // #5045: compare_data_feeds needs two real files to get past input
  // validation. They live in a temp dir, never the repo — an earlier draft let
  // research_add_source persist into docs/research/registry/ and the suite
  // then failed on its own second run.
  const feedDir = mkdtempSync(join(tmpdir(), 'nexus-feed-'));

  beforeAll(async () => {
    writeFileSync(join(feedDir, 'a.json'), JSON.stringify([{ id: 'x', license: 'MIT' }]));
    writeFileSync(join(feedDir, 'b.json'), JSON.stringify([{ id: 'x', license: 'Apache-2.0' }]));
    ctx = await setupServer();
  });

  afterAll(async () => {
    await ctx.cleanup();
    rmSync(feedDir, { recursive: true, force: true });
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
   * Minimal arguments per schema-declaring tool. The list of tools is derived
   * from the server, not written here, so a newly registered tool with an
   * `outputSchema` fails this suite until someone adds its arguments — the
   * previous hardcoded list could silently stop covering anything.
   */
  const ROUND_TRIP_ARGS: Readonly<Record<string, Record<string, unknown>>> = {
    memory_query: { query: 'round trip', source: 'session' },
    memory_stats: {},
    memory_write: { key: 'rt-key', content: 'round-trip', backend: 'session' },
    research_add: { arxivId: '2401.12345', dryRun: true },
    research_add_source: {
      url: 'https://example.invalid/rt-source',
      name: 'round trip',
      type: 'product_docs',
      // #5045: without this the call persists to docs/research/registry/ and
      // the second run of the suite fails as a duplicate — a gate must not
      // depend on the repo state its own previous run left behind.
      dryRun: true,
    },
    research_analyze: { focus: 'coverage' },
    research_catalog_review: { action: 'list' },
    research_discover: { topic: 'round trip' },
    research_query: { action: 'stats' },
    research_synthesize: {},
    list_experts: { format: 'names' },
    survey_oss_landscape: { query: 'round trip' },
    vendor_publishing_audit: { vendor: 'anthropic' },
    compare_data_feeds: {
      feedAPath: join(feedDir, 'a.json'),
      feedBPath: join(feedDir, 'b.json'),
      keyPath: 'id',
      compareFields: ['license'],
    },
  };

  /**
   * Tools whose round-trip call returns an error envelope rather than
   * structured content, so their `outputSchema` genuinely goes unchecked here:
   *
   * - `research_synthesize` — the paper registry is empty in the test env, so
   *   it answers "No papers found in registry" as an error envelope.
   *
   * Naming them is the point. Counting an unstructured response as a pass
   * would make this a check that cannot fail, which is the same shape of hole
   * #5045 exists to close. Four tools sat here in the first draft; three were
   * my own bad arguments, found only because the list was printed.
   */
  const KNOWN_UNSTRUCTURED: readonly string[] = ['research_synthesize'];

  /**
   * A response field missing from a tool's declared `outputSchema` does not go
   * unreported — the SDK validates structured content with
   * `additionalProperties: false`, so EVERY call fails with -32602 and the tool
   * becomes unusable. #5044 shipped exactly that and was caught only because
   * `memory_query` happened to be one of the few tools round-tripped here.
   *
   * The tool's own tests cannot see it: they call the registered handler
   * directly and never cross the protocol. So the guard has to be a real client
   * call, and the pass condition is narrow on purpose — a business failure is
   * fine, an output-schema violation is not.
   *
   * The third bucket is the point of the disclosure: a call that returns no
   * structured content at all has nothing to validate, so counting it as a pass
   * would be a check that cannot fail. Those tools are named in the failure
   * message instead of being silently credited.
   */
  it('every tool declaring an outputSchema returns content that satisfies it (#5045)', async () => {
    const listed = await ctx.client.listTools();
    const schemaTools = listed.tools.filter((t) => t.outputSchema !== undefined);
    expect(schemaTools.length).toBeGreaterThan(0);

    // The reverse direction: a tool that *drops* its outputSchema silently
    // stops being validated by the SDK. Nothing else would notice, so the
    // argument table doubles as the pinned list of what must still declare one.
    const schemaNames = new Set(schemaTools.map((t) => t.name));
    expect(Object.keys(ROUND_TRIP_ARGS).filter((n) => !schemaNames.has(n))).toEqual([]);

    const missingArgs: string[] = [];
    const violations: string[] = [];
    const notExercised: string[] = [];

    for (const tool of schemaTools) {
      const args = ROUND_TRIP_ARGS[tool.name];
      if (args === undefined) {
        missingArgs.push(tool.name);
        continue;
      }
      try {
        const result = await ctx.client.callTool({ name: tool.name, arguments: args });
        if (result.structuredContent === undefined) notExercised.push(tool.name);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        if (message.includes('output schema') || message.includes('-32602')) {
          violations.push(`${tool.name}: ${message}`);
        }
      }
    }

    expect(violations).toEqual([]);
    // A new schema-declaring tool must be given arguments here, or it is not
    // covered — and an uncovered tool is exactly how #5044 shipped.
    expect(missingArgs).toEqual([]);
    // Pinned rather than warned: a tool that stops returning structured
    // content stops being covered, and a silent drop is how the gap reopens.
    // Shrinking this list is always safe; growing it needs a reason in review.
    expect(notExercised.sort()).toEqual([...KNOWN_UNSTRUCTURED].sort());
  }, 120_000);

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
