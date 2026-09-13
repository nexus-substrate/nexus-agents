/**
 * #6123: `supply_chain_tradeoff_panel` threads the caller's target project
 * into every seat's SYSTEM prompt and discloses which source named it, exactly
 * as `consensus_vote` does since #6110.
 *
 * The handler, the resolver and `collectRealVotes` are real; the module mock
 * only pins a capturing adapter onto the collector so the assertion reads the
 * prompt the model would have seen. The default row points `process.cwd()` at
 * a directory outside any repository so it never depends on this checkout's
 * own remote, and pins the prompts to the seven-prompt snapshot from #6110.
 *
 * @module mcp/tools/supply-chain-tradeoff-panel-project.test
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CompletionRequest, ILogger, IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { VoterRole } from '../../cli/vote-types.js';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';

const captured: { requests: CompletionRequest[] } = { requests: [] };

/** A reasoning body that parses into an approve on the one axis under test. */
const AXIS_APPROVES = JSON.stringify({
  axes: { security: { decision: 'approve', reason: 'fine' } },
});

/** An adapter that approves everything and records every request it receives. */
function capturingAdapter(): IModelAdapter {
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: [],
    complete: vi.fn().mockImplementation((request: CompletionRequest) => {
      captured.requests.push(request);
      return Promise.resolve({
        ok: true,
        value: {
          content: JSON.stringify({
            decision: 'approve',
            reasoning: AXIS_APPROVES,
            confidence: 0.8,
          }),
          usage: {},
          stopReason: 'end_turn',
          model: 'test-model',
        },
      });
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

// The REAL collector, handed a uniform capturing adapter so every seat's
// prompt is built by the production path and read back here.
vi.mock('../../cli/voter-agents.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/voter-agents.js')>();
  return {
    ...actual,
    collectRealVotes: (opts: Parameters<typeof actual.collectRealVotes>[0]) =>
      actual.collectRealVotes({
        ...opts,
        adapter: capturingAdapter(),
        timeoutMs: 5_000,
        maxRetries: 0,
        interAgentDelayMs: 0,
      }),
  };
});
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import {
  QUICK_PANEL,
  SupplyChainTradeoffPanelInputSchema,
  registerSupplyChainTradeoffPanelTool,
  type SupplyChainTradeoffPanelResponse,
} from './supply-chain-tradeoff-panel.js';

type Handler = (
  args: unknown,
  ctx: { logger: ReturnType<typeof createLogger> }
) => Promise<{ content: Array<{ text: string }> }>;

function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _schema: unknown, cb: Handler) => {
      handler = cb;
    },
  };
  registerSupplyChainTradeoffPanelTool(server as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const FIXTURE_PATH = join(import.meta.dirname, '../../cli/__fixtures__/voter-prompts.default.json');

function defaultSnapshot(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('fixture is not an object');
  return parsed as Record<string, string>;
}

/** The system prompt of every captured request, in request order. */
function systemPrompts(): string[] {
  return captured.requests.map((request) => {
    const system = request.messages.find((m) => m.role === 'system');
    if (system === undefined || typeof system.content !== 'string') {
      throw new Error('vote request carried no string system prompt');
    }
    return system.content;
  });
}

/** The role whose default prompt matches this system prompt, or undefined. */
function roleOf(prompt: string, snapshot: Record<string, string>): VoterRole | undefined {
  return (Object.keys(snapshot) as VoterRole[]).find((role) => snapshot[role] === prompt);
}

const ARGS = { proposal: 'Adopt dep X?', quickMode: true, simulate: false, axes: ['security'] };

describe('supply_chain_tradeoff_panel threads the target project into the voter prompts (#6123)', () => {
  let cwd: string;
  let logger: ReturnType<typeof createLogger>;
  let infoSpy: MockInstance<ILogger['info']>;

  beforeEach(() => {
    cwd = mkdtempOutsideRepo('nexus-6123-sc-');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    captured.requests = [];
    logger = createLogger({ tool: 'sc-project.test' });
    infoSpy = vi.spyOn(logger, 'info');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
  });

  async function run(args: Record<string, unknown>): Promise<SupplyChainTradeoffPanelResponse> {
    const result = await captureHandler()(args, { logger });
    return JSON.parse(result.content[0]!.text) as SupplyChainTradeoffPanelResponse;
  }

  it('the input schema accepts the same project shape as consensus_vote', () => {
    const parse = (project: string): boolean =>
      SupplyChainTradeoffPanelInputSchema.safeParse({ ...ARGS, project }).success;
    expect(parse('acme/widgets')).toBe(true);
    expect(parse('@acme/widgets')).toBe(true);
    expect(parse('evil; rm -rf /')).toBe(false);
  });

  it("project 'acme/widgets': no seat's system prompt mentions nexus-agents", async () => {
    const response = await run({ ...ARGS, project: 'acme/widgets' });
    // Every seat parsed as a live vote — an errored seat would be re-run by the
    // #5578 retry and double the request count, hiding a prompt defect.
    expect(response.votes.map((v) => v.source)).toEqual(QUICK_PANEL.map(() => 'llm'));
    const prompts = systemPrompts();
    expect(prompts).toHaveLength(QUICK_PANEL.length);
    for (const prompt of prompts) {
      expect(prompt).toContain('acme/widgets');
      expect(prompt).not.toContain('nexus-agents');
    }
    expect(response.project).toEqual({ name: 'acme/widgets', source: 'input' });
  });

  it('no project: the quick-panel prompts equal the pinned default snapshot, source default', async () => {
    const response = await run(ARGS);
    const snapshot = defaultSnapshot();
    const prompts = systemPrompts();
    expect(prompts).toHaveLength(QUICK_PANEL.length);
    const roles = prompts.map((prompt) => roleOf(prompt, snapshot));
    expect(roles).not.toContain(undefined);
    expect(new Set(roles)).toEqual(new Set(QUICK_PANEL));
    expect(response.project).toEqual({ name: 'nexus-agents', source: 'default' });
  });

  it('logs the resolution once per run', async () => {
    await run({ ...ARGS, project: 'acme/widgets' });
    const lines = infoSpy.mock.calls.filter((call) => call[0] === 'Voter project resolved');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[1]).toEqual({ project: 'acme/widgets', source: 'input' });
  });
});
