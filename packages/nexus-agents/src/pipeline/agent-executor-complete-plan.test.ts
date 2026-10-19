/** #7411: real requests/CLI bridge/durable record; transport and metadata are fixtures. */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliTask, ICliAdapter } from '../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';
import { ResilientAdapter } from '../adapters/resilient-adapter.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import type { VoterRole } from '../cli/vote-types.js';
import type { IModelAdapter, CompletionRequest } from '../core/index.js';
import { ok } from '../core/index.js';
import { createVoteStage, buildVoteProposal } from './agent-executor-vote.js';
import { createBudgetGuard } from './budget-guard.js';
import { readVoteRecords, VOTE_RECORDS_PATH_ENV } from '../audit/vote-record-store.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';
import { resetCorrelationTracker } from '../mcp/tools/consensus-vote.js';
import { getVoterRoles } from '../cli/voter-roles.js';
import { ConsensusVoteInputSchema } from '../mcp/tools/consensus-vote-types.js';
import { resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import { PANEL_PROMPT_OVERHEAD_TOKENS } from '../mcp/tools/pr-review-panel-budget.js';
import { extractBoundArtifact, MAX_VOTE_ARTIFACT_BYTES } from '../cli/vote-artifact.js';

const transport = vi.hoisted<{
  tasks: CliTask[];
  requests: CompletionRequest[];
  enforces: boolean;
  expertCalls: number;
  window: number | undefined;
  model: string;
  lazy: boolean;
  unavailable: boolean;
  detectionFails: boolean;
  expertPrompt: string;
  omitSeat: boolean;
}>(() => ({
  tasks: [],
  requests: [],
  enforces: true,
  expertCalls: 0,
  window: 1_000_000,
  model: 'claude-fable-5',
  lazy: false,
  unavailable: false,
  detectionFails: false,
  expertPrompt: '',
  omitSeat: false,
}));
vi.mock('./expert-bridge.js', () => ({
  executeExpert: (_role: string, prompt: string) => {
    transport.expertPrompt = prompt;
    transport.expertCalls++;
    const bound = extractBoundArtifact(prompt);
    return Promise.resolve({
      success: true,
      text: JSON.stringify({
        decision: 'approve',
        confidence: 0.9,
        reasoning: 'Fixture',
        ...(bound !== undefined
          ? { artifactReadiness: 'ready', boundArtifactDigest: bound.digest }
          : {}),
      }),
    });
  },
}));
function recordingAdapter(): CliToModelAdapter {
  const cli: ICliAdapter = {
    name: 'claude',
    transport: 'subprocess',
    capabilities: DEFAULT_CAPABILITIES.claude,
    enforcesReadOnlyAnalysis: transport.enforces,
    execute: (task) => {
      transport.tasks.push(task);
      const bound = extractBoundArtifact(task.content);
      return Promise.resolve(
        ok({
          text: JSON.stringify({
            decision: 'approve',
            confidence: 0.9,
            reasoning: 'Fixture transport answer',
            ...(bound !== undefined
              ? { artifactReadiness: 'ready', boundArtifactDigest: bound.digest }
              : {}),
          }),
          model: transport.model,
        })
      );
    },
    getModelInfo: () => ({
      id: transport.model,
      name: 'fixture',
      contextWindow: transport.window ?? 1_000_000,
      maxOutput: 4000,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    }),
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
  return new CliToModelAdapter(cli);
}
vi.mock('../cli/voter-adapter-resolve.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli/voter-adapter-resolve.js')>()),
  resolveAdapter: () =>
    transport.unavailable
      ? { error: 'Fixture no adapter' }
      : {
          adapter: transport.lazy
            ? new ResilientAdapter({ preferredCli: 'claude' })
            : recordingAdapter(),
        },
  resolveAdapterOrFail: () => ({ adapter: recordingAdapter() }),
}));
vi.mock('../adapters/auto-adapter.js', () => ({
  createAutoAdapter: () => {
    if (transport.detectionFails)
      return Promise.reject(new Error('Fixture metadata detection unavailable'));
    return Promise.resolve({
      adapter: recordingAdapter(),
      source: 'cli',
      name: 'claude',
      reason: 'Fixture detection',
    });
  },
}));
vi.mock('../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../adapters/gateway-rediscovery.js', () => ({
  ensureGatewayDiscovered: () => Promise.resolve(),
  gatewayDiscoveryGeneration: () => 0,
}));
const collector = vi.hoisted<{
  pinned: boolean;
  assigned: ReadonlyMap<VoterRole, IModelAdapter> | undefined;
}>(() => ({ pinned: false, assigned: undefined }));
vi.mock('../cli/voter-agents.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/voter-agents.js')>();
  return {
    ...actual,
    assignPanelSeats: async (...args: Parameters<typeof actual.assignPanelSeats>) => {
      const seats = await actual.assignPanelSeats(...args);
      if (transport.omitSeat) seats.delete(args[1].roles[0] as VoterRole);
      collector.assigned = seats;
      return seats;
    },
    collectRealVotes: (options: Parameters<typeof actual.collectRealVotes>[0]) => {
      collector.pinned =
        options.roleAdapters !== undefined &&
        options.roleAdapters === collector.assigned &&
        options.roleAdapters.size === options.roles.length;
      return actual.collectRealVotes({
        ...options,
        interAgentDelayMs: 0,
        maxRetries: 0,
        erroredRoleBackoffMs: 0,
      });
    },
  };
});

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
function stage(quickMode = false): ReturnType<typeof createVoteStage> {
  return createVoteStage({
    config: { quickMode, votingStrategy: 'supermajority' },
    guard: createBudgetGuard(),
    startStage: vi.fn(),
  });
}

function requestTextBytes(request: CompletionRequest): number {
  return request.messages.reduce((bytes, message) => {
    if (typeof message.content !== 'string') throw new Error('Expected textual voter request');
    return bytes + Buffer.byteLength(message.content, 'utf8');
  }, 0);
}

describe('complete pipeline plan delivery (#7411)', () => {
  let directory: string;
  let ledger: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'complete-plan-vote-'));
    ledger = join(directory, 'votes.jsonl');
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, ledger);
    resetNexusDataDirCache();
    resetOutcomeStore();
    resetCorrelationTracker();
    transport.tasks = [];
    transport.requests = [];
    const complete = CliToModelAdapter.prototype.complete;
    vi.spyOn(CliToModelAdapter.prototype, 'complete').mockImplementation(function (
      this: CliToModelAdapter,
      request: CompletionRequest
    ): ReturnType<CliToModelAdapter['complete']> {
      transport.requests.push(request);
      return complete.call(this, request);
    });
    transport.enforces = true;
    transport.expertCalls = 0;
    transport.window = 1_000_000;
    transport.model = 'claude-fable-5';
    transport.lazy = false;
    transport.unavailable = false;
    transport.detectionFails = false;
    transport.expertPrompt = '';
    collector.pinned = false;
    collector.assigned = undefined;
    transport.omitSeat = false;
    const registry = getDefaultRegistry();
    const entry = registry.getEntry.bind(registry);
    vi.spyOn(registry, 'getEntry').mockImplementation((model) => {
      const result = entry(model);
      if (model !== transport.model) return result;
      const { contextWindow: _window, ...rest } = result;
      return transport.window === undefined ? rest : { ...rest, contextWindow: transport.window };
    });
  });
  afterEach(() => {
    resetOutcomeStore();
    vi.restoreAllMocks();
    resetCorrelationTracker();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    rmSync(directory, { recursive: true, force: true });
  });

  it('delivers the exact full Unicode plan to all seven real requests and hashes the supplied proposal', async () => {
    const plan = `${'Require TDD and no writes outside scratch.\n'.repeat(200)}FINAL-REVIEW-SENTINEL café 🌍`;
    const research = 'r'.repeat(10_000);
    const result = await stage()(plan, research);
    expect(result).toMatchObject({ kind: 'approved' });
    expect(collector.pinned).toBe(true);
    expect(transport.tasks).toHaveLength(getVoterRoles(false).length);
    expect(transport.requests).toHaveLength(7);
    for (const request of transport.requests) {
      const user = request.messages.find((message) => message.role === 'user');
      expect(user?.content).toContain(plan);
      expect(request.accessMode).toBe('read-only-analysis');
      expect(request.maxTokens).toBe(4000);
      // Canonical reserve covers supplied scaffolding and the requested output budget.
      // This checks request metadata, not native CLI enforcement of that cap.
      const nonPlanBytes =
        requestTextBytes(request) - Buffer.byteLength(buildVoteProposal(plan, research), 'utf8');
      expect(nonPlanBytes / 3.5 + (request.maxTokens ?? 0)).toBeLessThan(
        PANEL_PROMPT_OVERHEAD_TOKENS
      );
    }
    const proposal = buildVoteProposal(plan, research);
    expect(proposal).toContain(`sha256:${digest(plan)} ${String(Buffer.byteLength(plan))} bytes`);
    for (const task of transport.tasks) {
      expect(task.content).toContain(proposal);
      expect(task.content).toContain(plan);
      expect(task.content).toContain('FINAL-REVIEW-SENTINEL café 🌍');
      expect(task.accessMode).toBe('read-only-analysis');
    }
    const records = readVoteRecords(ledger).records;
    expect(records).toHaveLength(1);
    expect(records[0]?.proposalHash).toBe(digest(proposal));
    // The stored display excerpt is intentionally bounded; its hash must NOT be used.
    expect(records[0]?.proposal.length).toBeLessThan(proposal.length);
    expect(records[0]?.proposalHash).not.toBe(digest(records[0]?.proposal ?? ''));
  });

  it.each([
    ['empty', '', /empty/i],
    ['NUL', 'plan\0hidden', /NUL|binary/i],
    ['lone high surrogate', 'plan\ud800', /UTF-8|surrogate/i],
    ['lone low surrogate', 'plan\udc00', /UTF-8|surrogate/i],
    ['cap + 1', `${'é'.repeat(MAX_VOTE_ARTIFACT_BYTES / 2)}x`, /262145.*262144/],
  ])(
    'rejects %s before any transport and creates no decision record',
    async (_name, plan, error) => {
      expect(() => buildVoteProposal(plan, '')).toThrow(error);
      const result = await stage()(plan, '');
      expect(result.kind).toBe('no_quorum');
      expect(transport.tasks).toHaveLength(0);
      expect(readVoteRecords(ledger).records).toHaveLength(0);
    }
  );

  it('accepts exactly the Unicode byte cap without replacing or clipping', () => {
    const plan = '🌍'.repeat(MAX_VOTE_ARTIFACT_BYTES / 4);
    const proposal = buildVoteProposal(plan, '');
    expect(proposal).toContain(plan);
    expect(proposal).toContain(`sha256:${digest(plan)} ${String(MAX_VOTE_ARTIFACT_BYTES)} bytes`);
  });

  it('refuses quick mode when its supplemental check cannot consume the complete proposal', async () => {
    const result = await stage(true)('x'.repeat(5000) + 'FINAL', '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.expertCalls).toBe(0);
    expect(result.kind === 'no_quorum' && result.reason).toMatch(/quick|contrarian|complete/i);
    expect(transport.tasks).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it.each([undefined, PANEL_PROMPT_OVERHEAD_TOKENS, PANEL_PROMPT_OVERHEAD_TOKENS + 10])(
    'fails closed before completions for insufficient or unknown context %s',
    async (window) => {
      transport.window = window;
      const result = await stage()('x'.repeat(14_202), '');
      expect(result.kind).toBe('no_quorum');
      expect(result.kind === 'no_quorum' && result.reason).toMatch(
        /context|budget|window|capacity/i
      );
      expect(transport.tasks).toHaveLength(0);
      expect(readVoteRecords(ledger).records).toHaveLength(0);
    }
  );

  it('does not treat pending-detection as known capacity', async () => {
    transport.model = 'pending-detection';
    const result = await stage()('x'.repeat(14_202), '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.tasks).toHaveLength(0);
  });

  it('resolves pending CLI metadata through the existing lazy adapter without a warmup completion', async () => {
    transport.lazy = true;
    const result = await stage()('x'.repeat(14_202) + 'END', '');
    expect(result).toMatchObject({ kind: 'approved' });
    expect(collector.pinned).toBe(true);
    expect(transport.tasks).toHaveLength(7);
    for (const task of transport.tasks) expect(task.content).toContain('x'.repeat(14_202) + 'END');
  });

  it('does not fall back to guessed capacity when no panel can be assigned', async () => {
    transport.unavailable = true;
    const result = await stage()('x'.repeat(14_202), '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.tasks).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('fails closed if lazy detection cannot resolve a model', async () => {
    transport.lazy = true;
    transport.detectionFails = true;
    const result = await stage()('x'.repeat(14_202), '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.requests).toHaveLength(0);
    expect(transport.tasks).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('supports complete small quick proposals at the supplemental boundary and refuses boundary + 1', async () => {
    const overhead = buildVoteProposal('x'.repeat(1000), '').length - 1000;
    const plan = 'x'.repeat(2000 - overhead);
    expect(buildVoteProposal(plan, '').length).toBe(2000);
    const result = await stage(true)(plan, '');
    expect(result).toMatchObject({ kind: 'approved' });
    expect(transport.tasks).toHaveLength(3);
    expect(transport.expertPrompt).toContain(buildVoteProposal(plan, ''));
    transport.tasks = [];
    transport.requests = [];
    transport.expertCalls = 0;
    const unsupported = await stage(true)(plan + 'x', '');
    expect(unsupported.kind).toBe('no_quorum');
    expect(transport.requests).toHaveLength(0);
    expect(transport.tasks).toHaveLength(0);
    expect(transport.expertCalls).toBe(0);
  });

  it('keeps simulated large plans explicit rather than measuring a model window', async () => {
    transport.unavailable = true;
    const vote = createVoteStage({
      config: { simulateVotes: true, quickMode: false },
      guard: createBudgetGuard(),
      startStage: vi.fn(),
    });
    await vote('x'.repeat(14_202), '');
    expect(transport.requests).toHaveLength(0);
    expect(transport.tasks).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });

  it('does not start completions after a cancelled expanded-plan preflight', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Fixture cancellation'));
    const result = await stage()('x'.repeat(14_202), '', controller.signal);
    expect(result.kind).toBe('no_quorum');
    expect(transport.requests).toHaveLength(0);
    expect(transport.tasks).toHaveLength(0);
  });

  it('refuses an incomplete assigned roster rather than using an unbudgeted fallback seat', async () => {
    transport.omitSeat = true;
    const result = await stage()('x'.repeat(14_202), '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.requests).toHaveLength(0);
    expect(transport.tasks).toHaveLength(0);
  });

  it('retains the public 4000-character MCP summary schema', () => {
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'x'.repeat(4000) }).success).toBe(true);
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('does not bypass a CLI that cannot enforce native read-only analysis', async () => {
    transport.enforces = false;
    const result = await stage()('Read this complete plan', '');
    expect(result.kind).toBe('no_quorum');
    expect(transport.tasks).toHaveLength(0);
    expect(readVoteRecords(ledger).records).toHaveLength(0);
  });
});
