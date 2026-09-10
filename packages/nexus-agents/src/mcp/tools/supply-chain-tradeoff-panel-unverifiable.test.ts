/**
 * The tradeoff panel cannot let an unverifiable seat's discarded verdict
 * resurface through the per-axis parse (#6094 adversarial review, finding A).
 *
 * Runs the real handler over a mocked `collectRealVotes` so `toPanelVote` and
 * the response's `voterUnverifiable` count are exercised, not hand-built.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 1000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));
vi.mock('../../cli/voter-agents.js', () => ({ collectRealVotes: vi.fn() }));

import { collectRealVotes } from '../../cli/voter-agents.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { createLogger } from '../../core/index.js';
import {
  registerSupplyChainTradeoffPanelTool,
  type SupplyChainTradeoffPanelResponse,
} from './supply-chain-tradeoff-panel.js';

type Handler = (
  args: unknown,
  ctx: { logger: ReturnType<typeof createLogger> }
) => Promise<{ content: Array<{ text: string }> }>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  const mockServer = {
    registerTool: (_n: string, _s: unknown, h: unknown): void => {
      captured = h as Handler;
    },
  };
  registerSupplyChainTradeoffPanelTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

/** A reasoning body that WOULD parse into an approve on every axis. */
const AXIS_APPROVES = JSON.stringify({
  axes: {
    security: { decision: 'approve', reason: 'fine' },
    maintenance: { decision: 'approve', reason: 'fine' },
    license: { decision: 'approve', reason: 'fine' },
    performance: { decision: 'approve', reason: 'fine' },
    ecosystem: { decision: 'approve', reason: 'fine' },
  },
});

function seat(over: Partial<AgentVoteResult> & Pick<AgentVoteResult, 'role'>): AgentVoteResult {
  return {
    vote: { decision: 'approve', confidence: 0.8, reasoning: AXIS_APPROVES },
    processingTimeMs: 5,
    source: 'llm',
    ...over,
  };
}

async function runPanel(
  votes: readonly AgentVoteResult[]
): Promise<SupplyChainTradeoffPanelResponse> {
  vi.mocked(collectRealVotes).mockResolvedValueOnce(votes);
  const result = await captureHandler()(
    { proposal: 'Adopt dep X?', quickMode: true, simulate: false, axes: ['security'] },
    { logger: createLogger({ tool: 'sc-unverifiable.test' }) }
  );
  return JSON.parse(result.content[0]!.text) as SupplyChainTradeoffPanelResponse;
}

describe('supply_chain_tradeoff_panel: unverifiable seats (#6094)', () => {
  it('gives an unverifiable seat EMPTY axisVotes even when its reasoning parses', async () => {
    const response = await runPanel([
      seat({
        role: 'scope_steward',
        source: 'unverifiable',
        unverifiableSignal: 'reasoning',
        vote: { decision: 'abstain', confidence: 0, reasoning: AXIS_APPROVES },
      }),
      seat({
        role: 'security',
        vote: {
          decision: 'reject',
          confidence: 0.9,
          reasoning: JSON.stringify({ axes: { security: { decision: 'reject', reason: 'cve' } } }),
        },
      }),
    ]);
    const blind = response.votes.find((v) => v.role === 'scope_steward');
    expect(blind?.source).toBe('unverifiable');
    expect(blind?.axisVotes).toEqual({});
    expect(response.voterUnverifiable).toBe(1);
    expect(response.voterErrors).toBe(0);
    const security = response.axisVerdicts.find((a) => a.axis === 'security');
    expect(security).toMatchObject({ approveCount: 0, rejectCount: 1, decision: 'reject' });
  });

  it('a clean panel reports voterUnverifiable as an explicit 0', async () => {
    const response = await runPanel([seat({ role: 'architect' }), seat({ role: 'security' })]);
    // The envelope text rides the failure message so an error envelope is
    // named, not reported as a missing key.
    expect(Object.keys(response), JSON.stringify(response).slice(0, 400)).toContain(
      'voterUnverifiable'
    );
    expect(response.voterUnverifiable).toBe(0);
    expect(response.axisVerdicts.every((a) => a.approveCount === 2)).toBe(true);
  });
});
