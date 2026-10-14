/** Diagnostic formatting at the real vote-stage boundary; recording/math covered separately. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_OPENAI_KEY } from '../testing/test-secrets.js';
import { createBudgetGuard } from './budget-guard.js';

const executeVoting = vi.hoisted(() => vi.fn());
vi.mock('../mcp/tools/consensus-vote.js', () => ({ executeVoting }));
vi.mock('../mcp/tools/consensus-vote-completed-recording.js', () => ({
  recordCompletedVote: vi.fn().mockResolvedValue({
    voteRecord: { persisted: false, reason: 'all-simulated', detail: 'formatter fixture' },
  }),
}));
vi.mock('./agent-executor-core.js', async (original) => ({
  ...(await original<typeof import('./agent-executor-core.js')>()),
  emitStageEvent: vi.fn(),
  recordOutcome: vi.fn(),
  postProgress: vi.fn().mockResolvedValue(undefined),
}));

import { createVoteStage } from './agent-executor-vote.js';

async function reasonFor(
  policyReason?: string,
  decisionReason?: string
): Promise<string | undefined> {
  executeVoting.mockResolvedValue({
    decision: 'no_quorum',
    ...(policyReason !== undefined ? { policyReason } : {}),
    ...(decisionReason !== undefined ? { decisionReason } : {}),
    result: { outcome: 'approved', voteCounts: { approve: 4, reject: 2 } },
    votes: [],
  });
  const vote = await createVoteStage({
    config: {},
    guard: createBudgetGuard(),
    startStage: vi.fn(),
  })('Measured plan', '');
  expect(vote.kind).toBe('no_quorum');
  return vote.kind === 'no_quorum' ? vote.reason : undefined;
}

describe('vote-stage causal diagnostics (#7412)', () => {
  beforeEach(() => executeVoting.mockReset());

  it('retains the error-policy cause rather than inventing a missing voice', async () => {
    expect(await reasonFor('no_quorum: error policy refused the security seat')).toBe(
      'no_quorum: error policy refused the security seat'
    );
  });

  it('prefers the paired canonical decision cause over a legacy policy diagnostic', async () => {
    expect(
      await reasonFor('Legacy policy diagnostic', 'no_quorum: required approvals absent')
    ).toBe('no_quorum: required approvals absent');
  });

  it.each([undefined, '', '   '])('uses neutral wording when cause is %j', async (cause) => {
    expect(await reasonFor(cause)).toBe(
      'consensus vote could not reach quorum (cause unavailable)'
    );
  });

  it('redacts the complete credential before applying the diagnostic length bound', async () => {
    const prefix = `no_quorum: ${'detail '.repeat(25)}`;
    const cause = `${prefix}${FAKE_OPENAI_KEY} ${'detail '.repeat(100)}`;
    const reason = await reasonFor(cause);
    expect(reason).toBe(`${prefix}[REDACTED_KEY]`);
    expect(reason).not.toContain(FAKE_OPENAI_KEY);
    expect(reason?.length).toBeLessThanOrEqual(200);
  });

  it('also redacts and bounds the new canonical decision cause', async () => {
    const prefix = `no_quorum: ${'detail '.repeat(25)}`;
    const reason = await reasonFor(
      undefined,
      `${prefix}${FAKE_OPENAI_KEY} ${'detail '.repeat(100)}`
    );
    expect(reason).toBe(`${prefix}[REDACTED_KEY]`);
    expect(reason).not.toContain(FAKE_OPENAI_KEY);
    expect(reason?.length).toBeLessThanOrEqual(200);
  });
});
