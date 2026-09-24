/**
 * Gateway-first acceptance suite (#6610, epic #6612).
 *
 * Drives the REAL gateway code — env reading, discovery, the per-model
 * adapters, the `api:<endpoint>` arm, the consensus_vote MCP tool, the usage
 * log and the decision-cost rollup — against a fake OpenAI-spec gateway on
 * loopback, over real HTTP. Nothing mocks the `openai` SDK. No agent CLI is
 * available: CLI detection is mocked to report none, and the global spawn
 * guard fails any test that launches one.
 *
 * Each epic child adds its case here. A case the code cannot pass yet is an
 * `it.todo` naming the issue that fills it in, or asserts TODAY's behaviour
 * with a note naming the issue that changes it — never a wished-for result.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { discoverModels, readOpenAICompatEnv } from '../../adapters/openai-compat-adapter.js';
import { _resetGatewayCatalogs, getGatewayCatalog } from '../../adapters/sdk/gateway-catalog.js';
import {
  createUnifiedRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from '../../adapters/unified-registry.js';
import { _resetGatewaySlotCatalog } from '../../adapters/gateway-family-slots.js';
import { SdkAdapter } from '../../adapters/sdk/sdk-adapter.js';
import {
  ROLE_TO_TASK_CATEGORY,
  resolveAdapterForRole,
} from '../../mcp/tools/create-expert-routing.js';
import { executeExpert } from '../../pipeline/expert-bridge.js';
import { createDefaultDeps, registerCreateExpertTool } from '../../mcp/tools/create-expert.js';
import { registerExecuteExpertTool } from '../../mcp/tools/execute-expert.js';
import { wireGateway } from '../../cli-server-gateway.js';
import { ErrorCode, type ILogger, type IModelAdapter } from '../../core/index.js';
import { loadUsageEvents } from '../../learning/usage-log.js';
import { createServer } from '../../mcp/server.js';
import { registerConsensusVoteTool, registerTools } from '../../mcp/tools/index.js';
import {
  checkGatewayHealth,
  gatewaySlotWarnings,
  gatewayVerdict,
} from '../../cli/doctor-gateway.js';
import { formatGatewayReport } from '../../cli/doctor-gateway-report.js';
import { isAllHealthy, type CliCheckResult } from '../../cli/doctor.js';
import {
  SCRIPTED_USAGE,
  echoModelScript,
  startFakeGateway,
  type ChatRequestBody,
  type FakeGateway,
} from './fake-gateway.js';
import {
  THREE_FAMILY_CATALOG,
  THREE_FAMILY_CHAT_IDS,
  familyOf,
  oversizedCatalog,
} from './three-family-catalog.js';

// The expert stage passes an MCP config to CLI experts; none is needed here.
vi.mock('../../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: () => Promise.resolve({ configPath: '/tmp/mcp.json', cleanup: vi.fn() }),
}));

// No agent CLI is installed on a gateway-only host.
vi.mock('../../cli-adapters/factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli-adapters/factory.js')>();
  return {
    ...actual,
    isCliAvailable: vi.fn(() => Promise.resolve(false)),
    getAvailableClis: vi.fn(() => Promise.resolve([])),
  };
});

const GATEWAY_KEY = 'fake-gateway-key-6610';

function silentLogger(): ILogger & { readonly warnings: string[] } {
  const warnings: string[] = [];
  const logger = {
    warnings,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn((message: string, context?: unknown) => {
      warnings.push(context === undefined ? message : `${message} ${JSON.stringify(context)}`);
    }),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: (): ILogger => logger,
  };
  return logger;
}

let gateway: FakeGateway;
let dataDir: string;

beforeAll(async () => {
  gateway = await startFakeGateway();
  dataDir = mkdtempSync(join(tmpdir(), 'nexus-gateway-acceptance-'));
  vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', GATEWAY_KEY);
  vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
  vi.stubEnv('NEXUS_DATA_DIR', dataDir);
  vi.stubEnv('NEXUS_BILLING_MODE', 'api');
  // Undeclared on purpose: the cost cases assert what an undeclared gateway records.
  vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', undefined);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_ENDPOINT', undefined);
  vi.stubEnv('NEXUS_OPENCODE_CONFIG', undefined);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  _resetGatewayCatalogs();
  await gateway.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// Reset AFTER each test too: a nested describe's beforeAll runs before the
// next top-level beforeEach, so it would otherwise see the last test's script.
function resetGateway(): void {
  gateway.setCatalog(THREE_FAMILY_CATALOG);
  gateway.setScript(echoModelScript);
  gateway.clearRequests();
}
beforeEach(resetGateway);
afterEach(resetGateway);

/** Discover through the real bootstrap entry and return the per-model adapters. */
async function wireFromEnv(): Promise<readonly IModelAdapter[]> {
  const logger = silentLogger();
  const adapters = await wireGateway(logger, createUnifiedRegistry({ logger }));
  if (adapters === undefined) {
    throw new Error(`gateway did not wire: ${logger.warnings.join(' | ')}`);
  }
  return adapters;
}

function adapterFor(adapters: readonly IModelAdapter[], id: string): IModelAdapter {
  const found = adapters.find((a) => a.modelId === id);
  if (found === undefined) throw new Error(`no discovered adapter for ${id}`);
  return found;
}

const ask = { messages: [{ role: 'user' as const, content: 'one question' }] };

// ============================================================================
// 1. Discovery (#6605, #6600 — merged in #6617)
// ============================================================================

describe('discovery over HTTP (#6605, #6600)', () => {
  it('keeps each chat model once, verbatim and in listing order, and drops non-chat models', async () => {
    const adapters = await wireFromEnv();

    expect(adapters.map((a) => a.modelId)).toEqual(THREE_FAMILY_CHAT_IDS);
    expect(new Set(THREE_FAMILY_CHAT_IDS.map(familyOf))).toEqual(
      new Set(['openai', 'anthropic', 'google'])
    );
  });

  it('registers the discovered models as one api:<endpoint> arm catalogue', async () => {
    await wireFromEnv();
    expect(getGatewayCatalog('api:openai-compat')).toEqual(THREE_FAMILY_CHAT_IDS);
  });

  it('sends the key as a bearer token, and the fixture records no credential', async () => {
    await wireFromEnv();

    const listing = gateway.requests.find((r) => r.path === '/v1/models');
    expect(listing?.method).toBe('GET');
    expect(listing?.hadAuthorization).toBe(true);
    expect(JSON.stringify(listing?.headers)).not.toContain(GATEWAY_KEY);
  });

  it('refuses a catalogue above the 256 cap and names the allowlist variable', async () => {
    gateway.setCatalog(oversizedCatalog(300));
    const config = readOpenAICompatEnv();
    if (config === null) throw new Error('gateway env not read');

    const result = await discoverModels(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('above the 256 cap');
      expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_MODELS');
    }
  });

  it('applies the allowlist before the cap, and a non-chat entry stays excluded', async () => {
    gateway.setCatalog(oversizedCatalog(300));
    vi.stubEnv(
      'NEXUS_OPENAI_COMPAT_MODELS',
      'gpt-5.2, claude*, models/gemini-*, gemini-embedding-001'
    );
    try {
      const adapters = await wireFromEnv();
      expect(adapters.map((a) => a.modelId)).toEqual([
        'gpt-5.2',
        'claude-opus-4-1-20250805',
        'claude_4_5_opus',
        'models/gemini-2.5-flash',
      ]);
    } finally {
      vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', undefined);
    }
  });
});

// ============================================================================
// 2. Response fidelity (#6607 — merged in #6620)
// ============================================================================

describe('response fidelity over HTTP (#6607)', () => {
  let adapters: readonly IModelAdapter[];

  beforeAll(async () => {
    adapters = await wireFromEnv();
  });

  it('dispatches the id exactly as listed and returns the text', async () => {
    const id = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

    const result = await adapterFor(adapters, id).complete(ask);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toEqual([{ type: 'text', text: `reply from ${id}` }]);
    }
    expect((gateway.chatRequests()[0]?.body as ChatRequestBody).model).toBe(id);
  });

  it('a content_filter finish is an error, not an answer', async () => {
    gateway.setScript(() => ({ kind: 'content_filter', partial: 'The first half of' }));

    const result = await adapterFor(adapters, 'gpt-5.2').complete(ask);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.context?.['reason']).toBe('content_filter');
  });

  it('an empty choices array is an error, not an empty answer', async () => {
    gateway.setScript(() => ({ kind: 'empty_choices' }));

    const result = await adapterFor(adapters, 'vertex_ai/gemini-2.5-pro').complete(ask);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.context?.['reason']).toBe('no_choices');
  });

  it('returns parallel tool calls whole and sends every tool result back', async () => {
    const adapter = adapterFor(adapters, 'models/gemini-2.5-flash');
    gateway.setScript(() => ({
      kind: 'tool_calls',
      calls: [
        { id: 'call_oslo', name: 'weather', arguments: '{"city":"Oslo"}' },
        { id: 'call_lima', name: 'weather', arguments: '{"city":"Lima"}' },
      ],
    }));

    const first = await adapter.complete(ask);

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.content).toEqual([
      { type: 'tool_use', id: 'call_oslo', name: 'weather', input: { city: 'Oslo' } },
      { type: 'tool_use', id: 'call_lima', name: 'weather', input: { city: 'Lima' } },
    ]);

    gateway.setScript(echoModelScript);
    await adapter.complete({
      messages: [
        ...ask.messages,
        { role: 'assistant', content: first.value.content },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_oslo', content: 'Oslo: 4C' },
            { type: 'tool_result', tool_use_id: 'call_lima', content: 'Lima: 19C' },
          ],
        },
      ],
    });

    const sent = (gateway.chatRequests()[1]?.body as ChatRequestBody).messages;
    expect(sent.filter((m) => m.role === 'tool')).toEqual([
      { role: 'tool', tool_call_id: 'call_oslo', content: 'Oslo: 4C' },
      { role: 'tool', tool_call_id: 'call_lima', content: 'Lima: 19C' },
    ]);
  });

  it('waits out a 429 Retry-After and then answers', async () => {
    gateway.setScript((model, body, attempt) =>
      attempt === 1
        ? { kind: 'rate_limited', retryAfterSeconds: 1 }
        : echoModelScript(model, body, attempt)
    );

    const result = await adapterFor(adapters, 'claude_4_5_opus').complete(ask);

    expect(result.ok).toBe(true);
    const [limited, retried] = gateway.chatRequests();
    expect(gateway.chatRequests()).toHaveLength(2);
    expect((retried?.receivedAt ?? 0) - (limited?.receivedAt ?? 0)).toBeGreaterThanOrEqual(900);
  });

  it('a persistent 429 is a rate-limit error carrying the stated horizon', async () => {
    gateway.setScript(() => ({ kind: 'rate_limited', retryAfterSeconds: 1 }));

    const result = await adapterFor(adapters, 'gpt-4o-mini').complete(ask);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      expect(result.error.context?.['retryAfterMs']).toBe(1000);
    }
    // One request plus the SDK's two retries.
    expect(gateway.chatRequests()).toHaveLength(3);
  });
});

// ============================================================================
// 3 + 5. A 7-seat consensus_vote through the gateway, and its cost records
// ============================================================================

const VoteResponse = z.object({
  decision: z.string(),
  voteCounts: z.object({ approve: z.number(), error: z.number() }),
  panelDiversity: z.object({ distinctModels: z.number(), distinctFamilies: z.number() }),
  panelWarning: z.string().optional(),
  votes: z.array(z.object({ role: z.string(), modelUsed: z.string().optional() })),
  costSummary: z.object({
    voterCount: z.number(),
    measuredVoters: z.number(),
    unmeasuredVoters: z.number(),
    totalInputTokens: z.number(),
    totalCostUsd: z.number(),
    priceBasis: z.string().optional(),
    perVoter: z.array(z.object({ role: z.string(), model: z.string().optional() })),
  }),
});

/** Run a full 7-seat consensus_vote over the MCP tool on `adapters`. */
async function runSevenSeatVote(
  adapters: readonly IModelAdapter[]
): Promise<z.infer<typeof VoteResponse>> {
  gateway.clearRequests();
  gateway.setScript(() => ({
    kind: 'text',
    content: JSON.stringify({
      decision: 'approve',
      reasoning: 'Scripted approval from the fake gateway.',
      confidence: 0.8,
    }),
  }));

  const created = createServer();
  if (!created.ok) throw new Error(created.error.message);
  const { server } = created.value;
  const { rateLimiter } = registerTools(server, { logger: silentLogger() });
  registerConsensusVoteTool(server, {
    logger: silentLogger(),
    rateLimiter,
    gatewayAdapters: adapters,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'gateway-acceptance', version: '1.0.0' });
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: 'consensus_vote',
      arguments: {
        proposal: 'Adopt the gateway as the only model channel for this host.',
        quickMode: false,
        dispatch: 'sync',
      },
    });
    return VoteResponse.parse(result.structuredContent);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('a 7-seat consensus_vote with no CLIs installed', () => {
  let vote: z.infer<typeof VoteResponse>;
  let servedModels: readonly string[];

  beforeAll(async () => {
    vote = await runSevenSeatVote(await wireFromEnv());
    servedModels = gateway.chatRequests().map((r) => (r.body as ChatRequestBody).model);
  }, 25_000);

  it('seats all seven voters on gateway models and reaches a decision', () => {
    expect(vote.voteCounts).toEqual(expect.objectContaining({ approve: 7, error: 0 }));
    expect(vote.decision).toBe('approved');
    expect(vote.costSummary.voterCount).toBe(7);
  });

  it('every seat was served by the fake gateway, one request per seat', () => {
    const seatModels = vote.costSummary.perVoter.map((v) => v.model);
    expect([...servedModels].sort()).toEqual([...seatModels].sort());
  });

  // #6606: seats are dealt across FAMILIES first, then across models within a
  // family. Round-robin over the listing order used to seat five OpenAI, two
  // Anthropic and no Google model on this recorded catalogue.
  it('deals the seven seats across all three families (#6606)', () => {
    const seatModels = vote.costSummary.perVoter.map((v) => v.model ?? '<none>');
    const families = seatModels.map(familyOf);
    expect(families.filter((f) => f === 'anthropic')).toHaveLength(3);
    expect(families.filter((f) => f === 'openai')).toHaveLength(2);
    expect(families.filter((f) => f === 'google')).toHaveLength(2);
    // Twelve chat models for seven seats: no model sits twice.
    expect(new Set(seatModels).size).toBe(7);
  });

  it('reports the families and models that voted, and names each seat model (#6606)', () => {
    expect(vote.panelDiversity).toEqual(
      expect.objectContaining({ distinctFamilies: 3, distinctModels: 7 })
    );
    // `votes[]` carries the role LABEL and `perVoter` the role key, so compare
    // the seat models as a multiset; every vote entry must name one.
    const voteModels = vote.votes.map((v) => v.modelUsed ?? '<none>');
    const costModels = vote.costSummary.perVoter.map((v) => v.model ?? '<missing>');
    expect(voteModels).toHaveLength(7);
    expect([...voteModels].sort()).toEqual([...costModels].sort());
    expect(vote.panelWarning ?? '').not.toContain('single model family');
  });

  it('marks every seat unpriced when NEXUS_GATEWAY_COST is undeclared', () => {
    expect(vote.costSummary.measuredVoters).toBe(0);
    expect(vote.costSummary.unmeasuredVoters).toBe(7);
    expect(vote.costSummary.totalCostUsd).toBe(0);
    expect(vote.costSummary.priceBasis).toBe('unknown');
    // The tokens were measured even though the price was not.
    expect(vote.costSummary.totalInputTokens).toBe(7 * SCRIPTED_USAGE.prompt_tokens);
  });

  it('writes each gateway call to the usage log as unpriced, never as a real $0', () => {
    const { events } = loadUsageEvents();
    const seatModels = new Set(vote.costSummary.perVoter.map((v) => v.model));
    const voteEvents = events.filter((e) => seatModels.has(e.modelId) && e.success);

    expect(voteEvents.length).toBeGreaterThanOrEqual(7);
    for (const event of voteEvents) {
      expect(event).toEqual(
        expect.objectContaining({
          priced: false,
          usdCost: 0,
          inputTokens: SCRIPTED_USAGE.prompt_tokens,
          outputTokens: SCRIPTED_USAGE.completion_tokens,
        })
      );
      expect(event.priceSource).toBeUndefined();
    }
  });
});

describe('a 7-seat consensus_vote on a one-family gateway (#6606)', () => {
  let vote: z.infer<typeof VoteResponse>;

  beforeAll(async () => {
    const openaiOnly = (await wireFromEnv()).filter((a) => familyOf(a.modelId) === 'openai');
    vote = await runSevenSeatVote(openaiOnly);
  }, 25_000);

  it('reports one family over several models and carries the collapsed-panel warning', () => {
    expect(vote.panelDiversity).toEqual(
      expect.objectContaining({ distinctFamilies: 1, distinctModels: 5 })
    );
    expect(vote.panelWarning).toContain('answering seats ran openai models');
  });
});

// ============================================================================
// 4. Family-slot routing (#6604 — PR #6623 fills these in)
// ============================================================================

/**
 * The model each vendor slot resolves to on the recorded catalogue. Every row
 * carries a `created` stamp, so within the flagship tier the newest wins: the
 * dated gpt-5.2 snapshot, claude_4_5_opus and gemini-3-pro-preview.
 */
const FAMILY_SLOT_MODEL = {
  codex: 'gpt-5.2-2025-12-11',
  claude: 'claude_4_5_opus',
  gemini: 'gemini-3-pro-preview',
} as const;
type FamilySlot = keyof typeof FAMILY_SLOT_MODEL;

function isFamilySlot(value: unknown): value is FamilySlot {
  return typeof value === 'string' && value in FAMILY_SLOT_MODEL;
}

describe('family-slot routing with no CLIs installed (#6604)', () => {
  let emptyBin: string;

  beforeAll(async () => {
    // No agent binary on PATH either: the router's arms are gateway-served.
    emptyBin = mkdtempSync(join(tmpdir(), 'nexus-gateway-no-clis-'));
    vi.stubEnv('PATH', emptyBin);
    // opencode is multi-vendor and has no family slot (#6626).
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'opencode');
    // Plan billing: no api:<vendor> arms beside the slots. A declared gateway
    // cost, so the budget filter admits the gateway-served slot arms.
    vi.stubEnv('NEXUS_BILLING_MODE', undefined);
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    resetGlobalRegistry();
    await wireFromEnv();
  });

  afterAll(() => {
    vi.stubEnv('PATH', process.env['PATH']);
    vi.stubEnv('NEXUS_DISABLED_CLIS', undefined);
    vi.stubEnv('NEXUS_BILLING_MODE', 'api');
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    resetGlobalRegistry();
    _resetGatewaySlotCatalog();
    rmSync(emptyBin, { recursive: true, force: true });
  });

  const servedModels = (): string[] =>
    gateway.chatRequests().map((r) => (r.body as ChatRequestBody).model);

  it('run_dev_pipeline runs its expert stage on the gateway model of the slot family', async () => {
    const result = await executeExpert('code', 'write a CSV parser');

    expect(result.success).toBe(true);
    expect(isFamilySlot(result.cli)).toBe(true);
    if (!isFamilySlot(result.cli)) return;
    expect(result.model).toBe(FAMILY_SLOT_MODEL[result.cli]);
    expect(servedModels()).toEqual([FAMILY_SLOT_MODEL[result.cli]]);
  });

  it('orchestrate dispatches each worker to the gateway model of its slot family', async () => {
    const registry = getGlobalRegistry();
    const slotsSeen = new Set<string>();
    for (const [role, category] of Object.entries(ROLE_TO_TASK_CATEGORY)) {
      const slot = registry.getRouting(category)?.primaryCli;
      if (!isFamilySlot(slot)) throw new Error(`${role} routes to ${String(slot)}`);
      slotsSeen.add(slot);
      gateway.clearRequests();

      const adapter = resolveAdapterForRole(role, undefined, silentLogger());
      const result = await adapter?.complete(ask);

      expect({ role, ok: result?.ok, served: servedModels() }).toEqual({
        role,
        ok: true,
        served: [FAMILY_SLOT_MODEL[slot]],
      });
    }
    expect([...slotsSeen].sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it('execute_expert runs on the gateway model of the expert slot family', async () => {
    const created = createServer();
    if (!created.ok) throw new Error(created.error.message);
    const { server } = created.value;
    const logger = silentLogger();
    const { rateLimiter } = registerTools(server, { logger });
    const createDeps = createDefaultDeps(rateLimiter, logger);
    registerCreateExpertTool(server, createDeps);
    registerExecuteExpertTool(server, {
      expertRegistry: createDeps.expertRegistry,
      logger,
      rateLimiter,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'gateway-acceptance-experts', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      const made = await client.callTool({
        name: 'create_expert',
        arguments: { role: 'security_expert', modelPreference: 'claude-opus' },
      });
      // create_expert answers in text content: the created expert as JSON.
      const [first] = z
        .object({ content: z.array(z.object({ text: z.string() })) })
        .parse(made).content;
      const { expertId } = z
        .object({ expertId: z.string() })
        .parse(JSON.parse(first?.text ?? 'null'), { error: () => String(first?.text) });
      gateway.clearRequests();

      await client.callTool({
        name: 'execute_expert',
        arguments: { expertId, task: 'review the auth flow' },
      });

      expect(servedModels().length).toBeGreaterThan(0);
      expect(new Set(servedModels())).toEqual(new Set([FAMILY_SLOT_MODEL.claude]));
    } finally {
      await client.close();
      await server.close();
    }
  });
});

// ============================================================================
// 5. The unpinned default and the opencode slot (#6626)
// ============================================================================

describe('the unpinned default and the opencode slot with no CLIs installed (#6626)', () => {
  const bootLogger = silentLogger();

  beforeAll(async () => {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY']) {
      vi.stubEnv(key, undefined);
    }
    // Named on purpose and absent from the catalogue: it must never be sent.
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'gpt-9-not-in-catalogue');
    // Registration logs the slot mapping, default included, so the operator
    // sees the warning at boot.
    _resetGatewaySlotCatalog();
    await wireGateway(bootLogger, createUnifiedRegistry({ logger: bootLogger }));
  });

  afterAll(() => {
    vi.stubEnv('NEXUS_CUSTOM_MODEL', undefined);
    _resetGatewaySlotCatalog();
  });

  /** The model of every request that named one, whatever the endpoint. */
  const requestedModels = (): string[] =>
    gateway.requests.flatMap((r) => {
      const model: unknown = (r.body as { model?: unknown } | undefined)?.model;
      return typeof model === 'string' ? [model] : [];
    });

  it('sends the unpinned default to the top-ranked anthropic flagship, not NEXUS_CUSTOM_MODEL', async () => {
    const registry = createUnifiedRegistry({ logger: silentLogger() });

    const result = await registry.getAdapterForModel('no-such-registry-model').complete(ask);

    expect(new Set(requestedModels())).toEqual(new Set([FAMILY_SLOT_MODEL.claude]));
    expect(bootLogger.warnings.join('\n')).toContain(
      'NEXUS_CUSTOM_MODEL: ignored: the model is not in the gateway catalogue'
    );
    // The custom-openai adapter calls chat completions by default (#6645).
    expect(gateway.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /v1/chat/completions',
    ]);
    expect(result.ok ? result.value.content : result.error.message).toEqual([
      { type: 'text', text: `reply from ${FAMILY_SLOT_MODEL.claude}` },
    ]);
  });

  it('refuses a pinned opencode slot with no binary instead of running another model', async () => {
    const registry = createUnifiedRegistry({ logger: silentLogger() });

    const result = await registry.getAdapterForCli('opencode').complete(ask);

    // The resilient adapter reports the refusal generically; what matters is
    // that no model was sent (before #6626, NEXUS_CUSTOM_MODEL was).
    expect(result.ok).toBe(false);
    expect(requestedModels()).toEqual([]);
  });
});

// ============================================================================
// 6. doctor --gateway (#6609)
// ============================================================================

describe('doctor --gateway on a gateway-only host (#6609)', () => {
  const noCli = (name: CliCheckResult['name']): CliCheckResult => ({
    name,
    installed: false,
    authenticated: false,
    authState: 'unverified',
    version: 'N/A',
    versionStatus: 'unsupported',
  });
  const healthyHost = {
    nodeSupported: true,
    hasAuthMethod: true,
    mcpServerReady: true,
    installFreshness: { state: 'aligned' as const, version: '1.0.0' },
    scratchSpace: [],
    clis: (['claude', 'gemini', 'codex', 'opencode'] as const).map(noCli),
  };

  it('measures the fake gateway: counts, family census, and the slots the router uses', async () => {
    const health = await checkGatewayHealth();

    expect(health.state).toBe('healthy');
    if (health.state !== 'healthy') return;
    expect(health.listedCount).toBe(THREE_FAMILY_CATALOG.length);
    expect(health.chatCount).toBe(THREE_FAMILY_CHAT_IDS.length);
    expect(health.census).toEqual({ anthropic: 4, openai: 5, google: 3, unknown: 0 });
    // The same models the #6604 cases above see the router dispatch to.
    expect(health.slots).toEqual(FAMILY_SLOT_MODEL);
    expect(health.probes).toBe('skipped');
    expect(gateway.chatRequests()).toHaveLength(0);
    expect(formatGatewayReport(health).join('\n')).not.toContain(GATEWAY_KEY);
  });

  it('passes the verdict with no CLI installed', async () => {
    const gatewayTerm = gatewayVerdict(await checkGatewayHealth());

    expect(gatewayTerm).toBe('pass');
    expect(isAllHealthy({ ...healthyHost, gateway: gatewayTerm })).toBe(true);
  });

  it('--probe sends one completion per family, to that family', async () => {
    const health = await checkGatewayHealth({ probe: true });

    const served = gateway.chatRequests().map((r) => familyOf((r.body as ChatRequestBody).model));
    expect(served).toEqual(['anthropic', 'openai', 'google']);
    expect(gatewayVerdict(health)).toBe('pass');
  });

  it('an OpenAI-only gateway passes, naming the claude and gemini slots unavailable (#6658)', async () => {
    gateway.setCatalog(THREE_FAMILY_CATALOG.filter((r) => r.owned_by === 'openai'));

    const health = await checkGatewayHealth({ probe: true });
    const gatewayTerm = gatewayVerdict(health);

    // codex is served, so the host passes — but not silently.
    expect(gatewayTerm).toBe('pass');
    expect(isAllHealthy({ ...healthyHost, gateway: gatewayTerm })).toBe(true);
    expect(gatewaySlotWarnings(health, healthyHost.clis)).toEqual([
      'claude slot unavailable: not installed, and the gateway has no anthropic model',
      'gemini slot unavailable: not installed, and the gateway has no google model',
      'opencode slot unavailable: not installed, and the gateway has no opencode slot',
    ]);
    // Only the served family was probed.
    const served = gateway.chatRequests().map((r) => familyOf((r.body as ChatRequestBody).model));
    expect(served).toEqual(['openai']);
  });

  it('a gateway that serves no slot fails the verdict (#6658)', async () => {
    gateway.setCatalog([
      { id: 'mistral-large-2411', object: 'model', created: 1731000000, owned_by: 'mistral' },
    ]);

    const gatewayTerm = gatewayVerdict(await checkGatewayHealth());

    expect(gatewayTerm).toBe('fail');
    expect(isAllHealthy({ ...healthyHost, gateway: gatewayTerm })).toBe(false);
  });

  it('fails the verdict, naming the host, when the gateway is unreachable', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'http://127.0.0.1:1/v1');
    try {
      const health = await checkGatewayHealth();

      expect(gatewayVerdict(health)).toBe('fail');
      expect(isAllHealthy({ ...healthyHost, gateway: gatewayVerdict(health) })).toBe(false);
      expect(formatGatewayReport(health).join('\n')).toContain('Gateway 127.0.0.1: FAILED');
    } finally {
      vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
    }
  });
});

// ============================================================================
// 7. The single-model custom-openai adapter's API surface (#6645)
// ============================================================================

describe('the single-model custom-openai adapter over HTTP (#6645)', () => {
  const id = 'gpt-5.2';
  const routes = (): string[] => gateway.requests.map((r) => `${r.method} ${r.path}`);

  afterEach(() => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', undefined);
  });

  // The default (chat completions) is asserted end to end by section 5's
  // unpinned-default case; this one covers the opt-in.
  it('posts to /v1/responses only when NEXUS_CUSTOM_API_SURFACE=responses', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    const adapter = new SdkAdapter({ providerId: 'custom-openai', modelId: id }, silentLogger());

    const result = await adapter.complete(ask);

    // This fake gateway serves chat completions only, so the opted-in surface 404s.
    expect(routes()).toEqual(['POST /v1/responses']);
    expect(result.ok ? 'ok' : result.error.message).toContain('/v1/responses');
  });
});

// ============================================================================
// 8. The direct OpenAI adapter pointed at a gateway by OPENAI_BASE_URL (#6654)
// ============================================================================

describe('the direct OpenAI adapter with OPENAI_BASE_URL (#6654)', () => {
  const id = 'gpt-5.2';
  const routes = (): string[] => gateway.requests.map((r) => `${r.method} ${r.path}`);

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-TESTFAKE-direct-NOT-REAL-6654');
  });

  afterEach(() => {
    vi.stubEnv('OPENAI_BASE_URL', undefined);
    vi.stubEnv('OPENAI_API_KEY', undefined);
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', undefined);
    vi.unstubAllGlobals();
  });

  it('posts to /v1/chat/completions when OPENAI_BASE_URL names a non-OpenAI host', async () => {
    vi.stubEnv('OPENAI_BASE_URL', gateway.baseUrl);
    const adapter = new SdkAdapter({ providerId: 'openai', modelId: id }, silentLogger());

    const result = await adapter.complete(ask);

    expect(routes()).toEqual(['POST /v1/chat/completions']);
    expect(result.ok).toBe(true);
  });

  it('honours NEXUS_CUSTOM_API_SURFACE=responses against that host', async () => {
    vi.stubEnv('OPENAI_BASE_URL', gateway.baseUrl);
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'responses');
    const adapter = new SdkAdapter({ providerId: 'openai', modelId: id }, silentLogger());

    await adapter.complete(ask);

    expect(routes()).toEqual(['POST /v1/responses']);
  });

  /** The one request the adapter sends toward api.openai.com, captured without the network. */
  async function captureOpenAiRequest(): Promise<{ url: string; body: string }> {
    const seen: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      seen.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'captured', type: 'invalid_request' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      );
    });
    const adapter = new SdkAdapter({ providerId: 'openai', modelId: id }, silentLogger());
    await adapter.complete(ask);
    vi.unstubAllGlobals();
    const [only, ...rest] = seen;
    if (only === undefined || rest.length > 0) {
      throw new Error(`expected exactly one request, saw ${String(seen.length)}`);
    }
    return only;
  }

  it('keeps the Responses surface with no OPENAI_BASE_URL, ignoring the override', async () => {
    vi.stubEnv('OPENAI_BASE_URL', undefined);
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'chat');

    const captured = await captureOpenAiRequest();

    expect(captured.url).toBe('https://api.openai.com/v1/responses');
    expect(routes()).toEqual([]);
  });

  it('sends the same request whether OPENAI_BASE_URL is unset or names api.openai.com', async () => {
    vi.stubEnv('OPENAI_BASE_URL', undefined);
    const unset = await captureOpenAiRequest();

    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', 'chat');
    const explicit = await captureOpenAiRequest();

    expect(unset.body).toContain('"input"');
    expect(explicit).toEqual(unset);
  });
});
