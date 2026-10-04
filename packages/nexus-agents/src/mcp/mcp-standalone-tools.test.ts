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
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation/types';

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
  registerConsensusVoteTool,
  registerDelegateToModelTool,
  registerListWorkflowsTool,
} from './tools/index.js';
import type { IWorkflowEngine } from '../core/index.js';
import { VERSION } from '../version.js';

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

// Populate the same paper shape used by research-helpers-synthesize.test.ts.
// Only the data boundary is stubbed: the synthesis and MCP handlers stay real.
vi.mock('../cli/research-helpers-io.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli/research-helpers-io.js')>()),
  loadPapersRegistry: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      schema_version: '1.0',
      papers: {
        'paper-1': {
          title: 'Paper A',
          authors: ['Test Author'],
          source: 'arxiv',
          arxiv_id: 'test-1',
          url: 'https://arxiv.org/abs/test-1',
          publication_date: '2025-01-01',
          venue: null,
          topics: ['memory'],
          tags: ['llm'],
          reviewed_date: '2025-01-01',
          reviewed_in: 'test',
          summary: 'Summary of Paper A',
          key_findings: ['Finding from Paper A'],
          relevance: 'high',
          implementation_status: 'not-started',
          techniques_extracted: ['technique-1'],
          priority: 'P2',
        },
      },
    },
  }),
}));

// arXiv availability must not decide whether the real research_add handler is
// covered. Match the existing helper's successful dry-run result shape.
vi.mock('../cli/research-helpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli/research-helpers.js')>()),
  addResearchPaper: vi.fn().mockResolvedValue({
    success: true,
    paperId: 'arxiv-2401.12345',
    title: 'Round trip paper',
    message: 'Would add paper',
    dryRun: true,
  }),
}));

// Deterministic voter-boundary fixtures exercise the REAL vote computation,
// response builder, and MCP handler without invoking model adapters.
vi.mock('../cli/voter-agents.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/voter-agents.js')>();
  return {
    ...actual,
    collectRealVotes: vi.fn((options: Parameters<typeof actual.collectRealVotes>[0]) =>
      Promise.resolve(
        options.roles.map((role) => ({
          role,
          vote: { decision: 'reject' as const, confidence: 0.9, reasoning: 'Fixture rejection' },
          processingTimeMs: 1,
          source: 'llm' as const,
        }))
      )
    ),
  };
});
vi.mock('./tools/consensus-vote-completed-recording.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tools/consensus-vote-completed-recording.js')>()),
  recordCompletedVote: vi.fn().mockResolvedValue({
    costSummary: undefined,
    voteRecord: { persisted: false, reason: 'write-failed', detail: 'Fixture recording disabled' },
  }),
}));
vi.mock('../consensus/correlation-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../consensus/correlation-persistence.js')>()),
  saveCorrelationData: vi.fn().mockReturnValue({ ok: true, value: undefined }),
}));

// ============================================================================
// Test Infrastructure
// ============================================================================

interface TestContext {
  client: Client;
  strictOutputSchemas: ReadonlyMap<string, z.ZodObject>;
  cleanup: () => Promise<void>;
}

function strictOutputViolations(
  declared: z.ZodObject | undefined,
  advertised: JsonSchemaType,
  payload: unknown
): string[] {
  expect(declared, 'registration schema was not captured').toBeDefined();
  const violations: string[] = [];
  const parsed = declared?.safeParse(payload);
  if (parsed?.success === false) violations.push(parsed.error.message);
  // Validate the ORIGINAL protocol payload against every declared object in
  // the advertised schema. Records and unknown payloads stay intentionally open.
  const validate = new AjvJsonSchemaValidator().getValidator(advertised);
  const strictResult = validate(payload);
  if (!strictResult.valid) violations.push(strictResult.errorMessage);
  return violations;
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
  const registrations = vi.spyOn(server, 'registerTool');

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

  // run_workflow and list_workflows need a stub workflow engine
  // `IWorkflowEngine.listTemplates` is declared as `Promise<WorkflowTemplate[]>`
  // (core/types/workflow.ts:219) — a bare array, not a Result. The previous
  // `{ ok, value }` stub passed only because nothing in this suite called it;
  // list_workflows does, and crashed on `templates.map`.
  const stubEngine = {
    listTemplates: () =>
      Promise.resolve([
        {
          name: 'code-review',
          version: '1.0.0',
          path: '/templates/code-review.yaml',
          description: 'Code review workflow',
          category: 'development',
        },
      ]),
  } as unknown as IWorkflowEngine;
  registerRunWorkflowTool(server, {
    ...deps,
    workflowEngine: stubEngine,
    resolveExecutionEngine: (): IWorkflowEngine => stubEngine,
  });
  registerListWorkflowsTool(server, { ...deps, workflowEngine: stubEngine });
  // #5052 follow-up: these three declare an `outputSchema` and are registered
  // on the production server, so a response-field addition to any of them
  // would have broken every call with the round-trip suite still green. Their
  // optional deps (notifier, gateway adapters, feedback integration) are not
  // needed to exercise the protocol boundary.
  registerConsensusVoteTool(server, deps);
  registerDelegateToModelTool(server, deps);

  const strictOutputSchemas = new Map<string, z.ZodObject>();
  const registered = registrations.mock.calls as unknown as Array<
    [string, { outputSchema?: z.ZodObject | z.ZodRawShape }]
  >;
  for (const [name, config] of registered) {
    const schema = config.outputSchema;
    if (schema === undefined) continue;
    // Registration accepts either an object schema or a raw object shape.
    strictOutputSchemas.set(
      name,
      schema instanceof z.ZodObject ? schema.strict() : z.strictObject(schema)
    );
  }
  registrations.mockRestore();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connectResult = await connectTransport(server, serverTransport, logger);
  if (!connectResult.ok) throw new Error(connectResult.error.message);

  const client = new Client({ name: 'standalone-test', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    strictOutputSchemas,
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
  // #5045: compare_data_feeds needs real files under cwd to pass its path guard.
  // Keep them in a disposable directory, removed after the suite; never write
  // test data into the persistent research registry.
  const feedDir = mkdtempSync(join(process.cwd(), '.nexus-feed-'));

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

  it('strict registration preserves the advertised output schema (#7042)', async () => {
    const listed = await ctx.client.listTools();
    expect(ctx.strictOutputSchemas.size).toBeGreaterThan(0);
    for (const tool of listed.tools) {
      const schema = ctx.strictOutputSchemas.get(tool.name);
      if (schema === undefined) continue;
      // Output JSON conversion already declares additionalProperties:false
      // for a stripping object. Strict parsing must preserve that contract.
      expect(tool.outputSchema, tool.name).toEqual(
        z.toJSONSchema(z.object(schema.shape), { target: 'draft-7', io: 'output' })
      );
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
    weather_report: {},
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
    list_experts: { format: 'full' },
    survey_oss_landscape: { query: 'round trip' },
    vendor_publishing_audit: { vendor: 'anthropic' },
    list_workflows: { format: 'full' },
    consensus_vote: { proposal: 'round trip', quickMode: true },
    delegate_to_model: { task: 'round trip', model: 'claude-haiku' },
    compare_data_feeds: {
      feedAPath: join(feedDir, 'a.json'),
      feedBPath: join(feedDir, 'b.json'),
      keyPath: 'id',
      compareFields: ['license'],
    },
  };

  it('compare_data_feeds reads its fixture and returns measured differences', async () => {
    const result = await ctx.client.callTool({
      name: 'compare_data_feeds',
      arguments: ROUND_TRIP_ARGS['compare_data_feeds'],
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      counts: { entriesInA: 1, entriesInB: 1, inBoth: 1, fieldDifferences: 1 },
    });
  });

  /**
   * #5008: a tool result that does not name the build it came from cannot be
   * used as evidence about a specific version. The MCP server is normally a
   * pinned global install, so the build answering a call is routinely not the
   * one in the working tree — and nothing in the response said which.
   *
   * The stamp rides in `_meta`, never `structuredContent`: the latter is
   * validated against `outputSchema` with `additionalProperties: false`, so an
   * undeclared field there breaks every call (#5044/#5045). `_meta` is the
   * spec's out-of-band channel and is never schema-validated, which is why the
   * error envelope already lives there (#2649).
   */
  it('every tool result names the build that produced it (#5008)', async () => {
    const listed = await ctx.client.listTools();
    const unstamped: string[] = [];

    for (const tool of listed.tools) {
      const args = ROUND_TRIP_ARGS[tool.name];
      if (args === undefined) continue;
      const result = await ctx.client.callTool({ name: tool.name, arguments: args });
      const build = (result._meta as Record<string, unknown> | undefined)?.['nexus-agents/build'];
      if ((build as { version?: unknown } | undefined)?.version !== VERSION) {
        unstamped.push(tool.name);
      }
    }

    expect(unstamped).toEqual([]);
  }, 120_000);

  it('keeps the error envelope alongside the build stamp (#5008)', async () => {
    // The stamp is merged into `_meta`, which already carries the #2649 error
    // envelope. Replacing `_meta` instead of extending it would silently strip
    // every structured error — a regression no other test here would catch,
    // since the envelope lives on the failure path.
    // Needs a call that genuinely FAILS. It used to use research_synthesize,
    // whose schema violation supplied the error for free — so #5134's fix broke
    // this test, and the fixture was a bug. An invalid-argument call is a real
    // error source that does not depend on anything being broken: `template` is
    // required, and omitting it fails validation before the handler runs.
    const result = await ctx.client.callTool({
      name: 'run_workflow',
      arguments: { action: 'execute', template: 'no-such-template-5134', inputs: {} },
    });

    const meta = result._meta as Record<string, unknown> | undefined;
    expect(result.isError).toBe(true);
    expect(meta?.['nexus-agents/error']).toBeDefined();
    expect((meta?.['nexus-agents/build'] as { version?: string } | undefined)?.version).toBe(
      VERSION
    );
  });

  /**
   * Async dispatch is a SECOND response shape: `runAsJob` returns
   * `{status:'pending', jobId}` rather than the tool's ordinary payload, and
   * `ROUND_TRIP_ARGS` only ever exercises the first. #5066 was exactly that
   * gap — `consensus_vote` declared an `outputSchema` its async envelope could
   * not satisfy, so every `mode: 'async'` call failed with -32602.
   *
   * The set is DERIVED from each tool's advertised input schema rather than
   * hand-listed: any tool offering `mode: 'async'` must appear here with
   * arguments, so one gaining async dispatch later cannot quietly go
   * uncovered. Tools without an `outputSchema` today are covered anyway —
   * gaining one is precisely how the break would return.
   */
  const ASYNC_ARGS: Readonly<Record<string, Record<string, unknown>>> = {
    consensus_vote: { proposal: 'round trip', quickMode: true },
    // The spec parser needs a heading; without one the call fails as a
    // business error and never reaches the async dispatch under test.
    execute_spec: { spec: '# Round trip\n\nA spec used only to reach async dispatch.' },
    run_graph_workflow: { workflow: 'round-trip' },
    // Found by the derivation, not by me: it advertises async mode and was
    // absent from the hand-written list this replaced.
    run_workflow: { action: 'execute', template: 'round-trip', inputs: {} },
  };

  function offersAsyncMode(tool: { inputSchema?: unknown }): boolean {
    const mode = (
      tool.inputSchema as { properties?: Record<string, { enum?: unknown[] }> } | undefined
    )?.properties?.['mode'];
    return mode?.enum?.includes('async') === true;
  }

  it('async dispatch satisfies each tool outputSchema (#5066)', async () => {
    const listed = await ctx.client.listTools();
    const asyncTools = listed.tools.filter(offersAsyncMode).map((t) => t.name);
    expect(asyncTools.length).toBeGreaterThan(0);
    // A tool that advertises async mode and has no arguments here is not
    // covered, and an uncovered tool is how #5066 shipped.
    expect(asyncTools.filter((n) => ASYNC_ARGS[n] === undefined)).toEqual([]);

    const violations: string[] = [];
    for (const name of asyncTools) {
      let result: unknown;
      let thrown = '';
      try {
        result = await ctx.client.callTool({
          name,
          arguments: { ...ASYNC_ARGS[name], mode: 'async' },
        });
      } catch (error: unknown) {
        thrown = error instanceof Error ? error.message : JSON.stringify(error);
      }
      const violation = schemaViolationIn(result, thrown);
      if (violation !== '') violations.push(`${name}: ${violation}`);
      const schema = listed.tools.find((tool) => tool.name === name)?.outputSchema;
      if (schema !== undefined) {
        const structured = (result as { structuredContent?: unknown } | undefined)
          ?.structuredContent;
        const validate = new AjvJsonSchemaValidator().getValidator(schema as JsonSchemaType);
        const strictResult = validate(structured);
        if (!strictResult.valid) violations.push(`${name}: ${strictResult.errorMessage}`);
      }
    }

    expect(violations).toEqual([]);
  }, 120_000);

  it('a second response shape also satisfies the outputSchema (#5066)', async () => {
    // The round-trip above calls each tool once with default arguments, so it
    // only ever sees ONE of a tool's response shapes. `consensus_vote` has two:
    // the vote result, and the `{status:'pending', jobId}` envelope from
    // `runAsJob`. The async envelope carried no structured content at all, so
    // every `mode: 'async'` call — the mode the tool's own description
    // recommends for 7-voter panels — failed with -32602.
    let result: unknown;
    let thrown = '';
    try {
      result = await ctx.client.callTool({
        name: 'consensus_vote',
        arguments: { proposal: 'round trip', quickMode: true, mode: 'async' },
      });
    } catch (error: unknown) {
      thrown = error instanceof Error ? error.message : JSON.stringify(error);
    }

    expect(schemaViolationIn(result, thrown)).toBe('');
  }, 60_000);

  /**
   * A schema violation reaches the caller in one of two ways, and the first
   * draft of this suite only knew about one of them (#5066): the SDK may
   * throw, or it may hand back `isError: true` with the message in the text
   * content. A test that only catches throws passes on the second form.
   */
  function schemaViolationIn(result: unknown, thrown: string): string {
    const texts = (result as { content?: { text?: string }[] } | undefined)?.content ?? [];
    const haystack = [thrown, ...texts.map((c) => c.text ?? '')].join(' ');
    return /output schema|-32602/.test(haystack) ? haystack : '';
  }

  function fixtureFailureIn(result: unknown, thrown: string): string {
    const schemaViolation = schemaViolationIn(result, thrown);
    if (schemaViolation !== '') return schemaViolation;
    return typeof result === 'object' &&
      result !== null &&
      'isError' in result &&
      result.isError === true
      ? 'fixture returned a business error'
      : '';
  }

  // Every schema-declaring tool must emit measured structured content.
  const KNOWN_UNSTRUCTURED: readonly string[] = [];

  /**
   * The SDK's non-strict Zod parse strips undeclared keys during validation,
   * but forwards the original structuredContent. Validate that payload against
   * the advertised JSON Schema independently, as a validating client would.
   *
   * The tool's own tests cannot see it: they call the registered handler
   * directly and never cross the protocol. So the guard has to be a real client
   * call, and the pass condition is narrow on purpose — every fixture must produce a
   * successful structured payload.
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
    const callFailed: string[] = [];
    const notExercised: string[] = [];

    for (const tool of schemaTools) {
      const args = ROUND_TRIP_ARGS[tool.name];
      if (args === undefined) {
        missingArgs.push(tool.name);
        continue;
      }
      let result: Awaited<ReturnType<typeof ctx.client.callTool>> | undefined;
      let thrown = '';
      try {
        result = await ctx.client.callTool({ name: tool.name, arguments: args });
      } catch (error: unknown) {
        // Every thrown error counts, not only the ones naming a schema. An
        // earlier version matched two substrings and silently credited the
        // tool for anything else — a timeout, a transport fault — which is the
        // same shape of hole this suite exists to close.
        thrown = error instanceof Error ? error.message : JSON.stringify(error);
      }
      // #5066: the SDK delivers a violation as an `isError` RESULT as often as
      // it throws. Checked before the unstructured bucket, because a violation
      // has no structured content either — and for a tool already in
      // KNOWN_UNSTRUCTURED it would otherwise be credited as expected.
      const violation = fixtureFailureIn(result, thrown);
      if (violation !== '') {
        callFailed.push(`${tool.name}: ${violation}`);
      } else if (thrown !== '') {
        callFailed.push(`${tool.name}: ${thrown}`);
      } else if (result?.structuredContent === undefined) {
        notExercised.push(tool.name);
      } else {
        callFailed.push(
          ...strictOutputViolations(
            ctx.strictOutputSchemas.get(tool.name),
            tool.outputSchema as JsonSchemaType,
            result.structuredContent
          ).map((message) => `${tool.name}: ${message}`)
        );
      }
    }

    // A protocol-level throw means the call did not complete: a schema
    // violation (-32602), a transport fault, a timeout. Fixture business errors
    // also fail: they cannot provide evidence about a success output schema.
    expect(callFailed).toEqual([]);
    // A new schema-declaring tool must be given arguments here, or it is not
    // covered — and an uncovered tool is exactly how #5044 shipped.
    expect(missingArgs).toEqual([]);
    // Pinned rather than warned: a tool that stops returning structured
    // content stops being covered, and a silent drop is how the gap reopens.
    // Shrinking this list is always safe; growing it needs a reason in review.
    // Registry/network fixtures now ensure research_synthesize/research_add
    // emit structured content, so neither is allowed an exemption.
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
