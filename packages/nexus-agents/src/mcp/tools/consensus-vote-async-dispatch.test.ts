/**
 * Tests for consensus_vote's async-mode dispatch envelope (#4362).
 *
 * `dispatchAsyncConsensusVote` handed `handleConsensusVote` — which resolves the
 * `{ ok, error } | { ok: true, value }` shape — straight into `runAsJob`'s `run`
 * callback with no transform. `runAsJob` records `complete` whenever `run`
 * RESOLVES, so a vote that failed (`ok: false`) landed as a `complete` job: a
 * caller polling `get_job_result` saw success and never looked at the payload.
 * The sync sibling has always converted `ok: false` into a structured error.
 *
 * Lives in its own file because reaching the failure path means mocking
 * `collectRealVotes`, and consensus-vote.test.ts exercises the real collector.
 *
 * @module mcp/tools/consensus-vote-async-dispatch.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';

// Every voter errors — the realistic shape of a dead voter panel (expired auth,
// adapter outage), and the exact input for which `handleConsensusVote` returns
// `{ ok: false }` rather than manufacturing a "rejected" verdict (#1552).
const collectRealVotesMock = vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

// Pass the registered callback through untouched so the test can invoke it.
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  toSdkCallbackWithBudgetCheck: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler:
    (fn: (args: unknown, ctx: unknown) => unknown) => (args: unknown, ctx: unknown) =>
      fn(args, ctx),
}));

import { registerConsensusVoteTool, unwrapVoteOrThrow } from './consensus-vote.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

function erroredVotes(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    vote: { decision: 'abstain' as const, reasoning: 'adapter unauthorized', confidence: 0 },
    processingTimeMs: 1,
    source: 'error' as const,
    error: 'adapter unauthorized',
  }));
}

/** Registers the tool against a mock server and returns the captured callback. */
function captureHandler(): (args: unknown, ctx: unknown) => Promise<CapturedToolResult> {
  let captured: ((args: unknown, ctx: unknown) => Promise<CapturedToolResult>) | undefined;
  const mockServer = {
    registerTool: (_name: string, _schema: unknown, handler: unknown) => {
      captured = handler as (args: unknown, ctx: unknown) => Promise<CapturedToolResult>;
    },
  };
  registerConsensusVoteTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

const CTX = {
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestContext: {},
};

describe('consensus_vote async dispatch fails closed (#4362)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function dispatch(): Promise<string> {
    const handler = captureHandler();
    const result = await handler(
      { proposal: 'ship the thing', quickMode: true, mode: 'async' },
      CTX
    );
    const env = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    const jobId = env['jobId'] as string;
    // The background run is fire-and-forget — poll the sidecar the way a caller
    // would rather than guessing a settle delay.
    for (let i = 0; i < 100 && readJobResult(jobId)?.status === 'pending'; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return jobId;
  }

  it('records a failed job when every voter errored', async () => {
    collectRealVotesMock.mockImplementation((opts: { roles: readonly VoterRole[] }) =>
      Promise.resolve(erroredVotes(opts.roles))
    );

    expect(readJobResult(await dispatch())?.status).toBe('failed');
  });

  it('carries the failure reason into the job record', async () => {
    collectRealVotesMock.mockImplementation((opts: { roles: readonly VoterRole[] }) =>
      Promise.resolve(erroredVotes(opts.roles))
    );

    const record = readJobResult(await dispatch());
    expect(JSON.stringify(record)).toContain('voters failed');
  });

  it('records signalAccepted:true on the pending record — the claim follows the runner arity (#5393)', async () => {
    // `runAsJob` derives this from `run.length >= 3`, so this asserts the
    // capability and the record together: the runner cannot claim cancellation
    // it does not take, and cannot take it without the record saying so.
    //
    // Before #5393 every adopting tool declared an arity-2 runner, so this was
    // `false` everywhere and `cancel_job` marked jobs cancelled while every
    // remaining voter still ran.
    //
    // Read on the PENDING record deliberately: that is when the field is
    // written and when it is actionable — a caller deciding whether cancelling
    // is worth attempting asks before the job finishes, not after.
    collectRealVotesMock.mockImplementation((opts: { roles: readonly VoterRole[] }) =>
      Promise.resolve(erroredVotes(opts.roles))
    );

    const handler = captureHandler();
    const result = await handler(
      { proposal: 'ship the thing', quickMode: true, mode: 'async' },
      CTX
    );
    const env = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    const jobId = env['jobId'] as string;

    expect(readJobResult(jobId)?.signalAccepted).toBe(true);
  });

  it('actually hands the signal to collectRealVotes (#5393)', async () => {
    // The seam between "the runner takes a signal" and "the launcher honours
    // one". Both ends have their own tests, and both stay green if the middle
    // drops the signal on the floor — which is the shape of the defect this
    // whole issue is about. Asserted on what the collector RECEIVED.
    collectRealVotesMock.mockImplementation((opts: { roles: readonly VoterRole[] }) =>
      Promise.resolve(erroredVotes(opts.roles))
    );

    await dispatch();

    expect(collectRealVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

// The success half of the transform is asserted directly: exercising it through
// the dispatcher would stand up the whole memory substrate (CompositeRouter and
// its on-disk backends), which is neither fast nor side-effect-free in a unit
// test. The failure half is covered end-to-end above.
describe('unwrapVoteOrThrow (#4362)', () => {
  type VotePromise = Parameters<typeof unwrapVoteOrThrow>[0];

  it('passes an ok result through untouched, so the job records complete', async () => {
    const ok = { ok: true as const, value: { proposal: 'p' } };

    await expect(unwrapVoteOrThrow(Promise.resolve(ok) as unknown as VotePromise)).resolves.toBe(
      ok
    );
  });

  it('rejects with the vote error, so runAsJob records failed', async () => {
    const failed = { ok: false as const, error: 'All 3 voters failed' };

    await expect(
      unwrapVoteOrThrow(Promise.resolve(failed) as unknown as VotePromise)
    ).rejects.toThrow('All 3 voters failed');
  });
});
