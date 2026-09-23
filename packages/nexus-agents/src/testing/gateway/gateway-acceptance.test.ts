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
import { createUnifiedRegistry } from '../../adapters/unified-registry.js';
import { wireGateway } from '../../cli-server-gateway.js';
import { ErrorCode, type ILogger, type IModelAdapter } from '../../core/index.js';
import { loadUsageEvents } from '../../learning/usage-log.js';
import { createServer } from '../../mcp/server.js';
import { registerConsensusVoteTool, registerTools } from '../../mcp/tools/index.js';
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
      expect.objectContaining({ distinctFamilies: 1, distinctModels: 4 })
    );
    expect(vote.panelWarning).toContain('answering seats ran openai models');
  });
});

// ============================================================================
// 4. Family-slot routing (#6604 — PR #6623 fills these in)
// ============================================================================

describe('family-slot routing with no CLIs installed (#6604)', () => {
  it.todo('run_dev_pipeline runs its expert stage on the gateway model of the slot family');
  it.todo('orchestrate dispatches each worker to the gateway model of its slot family');
  it.todo('execute_expert runs on the gateway model of the expert slot family');
});
