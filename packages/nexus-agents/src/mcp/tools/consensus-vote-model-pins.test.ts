/** Ignored model pins reach the MCP response through the real panel collector. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILogger, IModelAdapter } from '../../core/index.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import {
  buildResponse,
  type ConsensusVoteResponse,
  type ExtendedVotingResult,
} from './consensus-vote-types.js';
import {
  _resetGatewaySlotCatalog,
  resolveGatewayDefault,
  setGatewaySlotCatalog,
} from '../../adapters/gateway-family-slots.js';

const registry = vi.hoisted(() => ({ getDefault: vi.fn() }));
vi.mock('../../adapters/unified-registry.js', () => ({ getGlobalRegistry: () => registry }));
vi.mock('../../cli-adapters/factory.js', () => ({ getAvailableClis: () => Promise.resolve([]) }));

const QUIET = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;
const INPUT = {
  proposal: 'Adopt this self-contained proposal',
  simulateVotes: false,
  quickMode: true,
} as const;

function adapter(modelId: string): IModelAdapter {
  return {
    providerId: 'openai',
    modelId,
    capabilities: [],
    complete: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        content: JSON.stringify({
          decision: 'approve',
          reasoning: 'Sound proposal.',
          confidence: 0.8,
        }),
        model: modelId,
        stopReason: 'end_turn',
        usage: {},
      },
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

function result(votes: readonly AgentVoteResult[]): ExtendedVotingResult {
  const now = '2026-10-05T00:00:00.000Z';
  return {
    proposal: INPUT.proposal,
    threshold: 'simple_majority',
    votes,
    totalTimeMs: 1,
    simulateVotes: false,
    strategy: 'simple_majority',
    panelSize: votes.length,
    contrarianRequested: false,
    result: {
      proposalId: 'p',
      proposal: { title: 't', description: 'd', algorithm: 'simple_majority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: votes.length, reject: 0, abstain: 0, total: votes.length },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: now,
      closedAt: now,
      durationMs: 1,
    },
  };
}

async function panel(
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<{ votes: readonly AgentVoteResult[]; response: ConsensusVoteResponse }> {
  const votes = await collectRealVotes({
    roles: ['architect', 'security', 'scope_steward'],
    proposal: INPUT.proposal,
    logger: QUIET,
    gatewayAdapters,
    timeoutMs: 5000,
    maxRetries: 0,
    interAgentDelayMs: 0,
    erroredRoleBackoffMs: 0,
  });
  expect(votes.map((v) => v.source)).toEqual(['llm', 'llm', 'llm']);
  return { votes, response: buildResponse(INPUT, result(votes)) };
}

describe('ignored vote model pins', () => {
  beforeEach(() => {
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', '');
    vi.stubEnv('NEXUS_VOTER_MODEL_SECURITY', '');
    vi.stubEnv('NEXUS_VOTER_MODEL_SCOPE_STEWARD', '');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', '');
    registry.getDefault.mockReturnValue(adapter('claude-opus-4-1'));
    _resetGatewaySlotCatalog();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    _resetGatewaySlotCatalog();
  });

  it('names an unknown role pin and the dealt model in panelWarning (1a)', async () => {
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'missing-model');
    const { votes, response } = await panel([adapter('gpt-4o'), adapter('claude-opus-4-1')]);
    expect(response.panelWarning).toContain('NEXUS_VOTER_MODEL_ARCHITECT="missing-model"');
    expect(response.panelWarning).toContain('not in the gateway catalog');
    expect(response.panelWarning).toContain(
      `assigned model "${votes[0]?.pinnedModel ?? 'unresolved'}"`
    );
  });

  it('names each pin ignored by a single-model gateway (1b)', async () => {
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'missing-model');
    vi.stubEnv('NEXUS_VOTER_MODEL_SECURITY', 'gpt-4o');
    const { response } = await panel([adapter('gpt-4o')]);
    expect(response.panelWarning).toContain('NEXUS_VOTER_MODEL_ARCHITECT="missing-model"');
    expect(response.panelWarning).toContain('NEXUS_VOTER_MODEL_SECURITY="gpt-4o"');
    expect(response.panelWarning).toContain('single-model gateway');
    expect(response.panelWarning).toContain('assigned model "gpt-4o"');
    expect(response.panelWarning).toContain('All 3 seats answered');
  });

  it('names a pin that has no effect without a gateway (1c)', async () => {
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'gpt-4o');
    const { response } = await panel();
    expect(response.panelWarning).toContain('NEXUS_VOTER_MODEL_ARCHITECT="gpt-4o"');
    expect(response.panelWarning).toContain('no gateway active');
    expect(response.panelWarning).toContain('assigned model "claude-opus-4-1"');
  });

  it('surfaces an unknown custom pin even after its once-only log warning', async () => {
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'missing-custom');
    const gateway = [adapter('gpt-4o'), adapter('claude-opus-4-1')];
    setGatewaySlotCatalog(gateway);
    resolveGatewayDefault(process.env, QUIET);
    const { votes, response } = await panel(gateway);
    expect(response.panelWarning).toContain('NEXUS_CUSTOM_MODEL="missing-custom"');
    expect(response.panelWarning).toContain('not in the gateway catalog');
    for (const vote of votes) {
      expect(response.panelWarning).toContain(
        `assigned model "${vote.pinnedModel ?? 'unresolved'}"`
      );
    }
  });

  it('discloses an unknown custom pin on a registry-backed gateway', async () => {
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'missing-custom');
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'gpt-4o');
    setGatewaySlotCatalog([adapter('gpt-4o'), adapter('claude-opus-4-1')]);
    const { response } = await panel();
    expect(response.panelWarning).toContain('NEXUS_CUSTOM_MODEL="missing-custom"');
    expect(response.panelWarning).toContain('NEXUS_VOTER_MODEL_ARCHITECT="gpt-4o"');
    expect(response.panelWarning).toContain('gateway model dealing is inactive for this panel');
    expect(response.panelWarning).not.toContain('no gateway active');
    expect(response.panelWarning).toContain('assigned model "claude-opus-4-1"');
  });

  it('does not warn about an honoured role pin or valid custom model', async () => {
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'GPT-4O');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'gpt-4o');
    const { votes, response } = await panel([adapter('gpt-4o'), adapter('claude-opus-4-1')]);
    expect(votes[0]?.pinnedModel).toBe('gpt-4o');
    expect(response.panelWarning).toBeUndefined();
  });
});
