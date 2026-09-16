/**
 * consensus_vote's async body proves liveness per seat (#6162).
 *
 * A guard raised past the standard MCP ceiling (#6159) requires the job body to
 * heartbeat or be failed as wedged at 3/8 of the guard. A vote's unit of
 * progress is one seat settling, so the body threads `runAsJob`'s `progress()`
 * down to the seat launcher as `onVoteCollected`. This file drives the REAL
 * tool handler and the real `runAsJob` dispatch under fake timers; only the
 * seat layer (`collectRealVotes`) is mocked, to settle seats on a schedule or
 * to hang.
 *
 * @module mcp/tools/consensus-vote-heartbeat.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';

interface CollectOpts {
  readonly roles: readonly VoterRole[];
  readonly onVoteCollected?: (vote: AgentVoteResult) => void;
}
const collectRealVotesMock = vi.fn<(opts: CollectOpts) => Promise<readonly AgentVoteResult[]>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: CollectOpts): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

const recordingMocks = vi.hoisted(() => ({
  recordVoteSuccess: vi.fn(),
  recordAuthenticVote: vi.fn(() => ({
    persisted: false as const,
    reason: 'all-simulated' as const,
    detail: 'test recording disabled',
  })),
}));
vi.mock('./consensus-vote-recording.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./consensus-vote-recording.js')>();
  return {
    ...actual,
    recordVoteSuccess: recordingMocks.recordVoteSuccess,
    recordAuthenticVote: recordingMocks.recordAuthenticVote,
  };
});

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

import { registerConsensusVoteTool } from './consensus-vote.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

interface CapturedToolResult {
  content: Array<{ type: string; text: string }>;
}

/** Above the 3.6M MCP ceiling, within the 7.2M class ceiling. */
const LONG_GUARD_MS = 4_000_000;
/** interval = guard / 8; wedged after 3 missed intervals. */
const INTERVAL_MS = LONG_GUARD_MS / 8;
const SILENCE_BUDGET_MS = 3 * INTERVAL_MS;

function approveVote(role: VoterRole): AgentVoteResult {
  return {
    role,
    vote: { decision: 'approve', reasoning: 'fine', confidence: 90 },
    processingTimeMs: 1,
    source: 'llm',
  };
}

/** Seats settle one per `everyMs`, reporting each through `onVoteCollected`. */
function seatsSettlingEvery(everyMs: number) {
  return (opts: CollectOpts): Promise<readonly AgentVoteResult[]> =>
    new Promise((resolve) => {
      const votes: AgentVoteResult[] = [];
      opts.roles.forEach((role, index) => {
        setTimeout(
          () => {
            const vote = approveVote(role);
            votes.push(vote);
            opts.onVoteCollected?.(vote);
            if (votes.length === opts.roles.length) resolve(votes);
          },
          everyMs * (index + 1)
        );
      });
    });
}

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

describe('consensus_vote async body heartbeats per seat under a long guard (#6162)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-heartbeat-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'] = String(LONG_GUARD_MS);
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectRealVotesMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'];
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function dispatch(): Promise<string> {
    const handler = captureHandler();
    const result = await handler(
      { proposal: 'ship the thing', quickMode: true, dispatch: 'async' },
      CTX
    );
    const env = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    return env['jobId'] as string;
  }

  it('is NOT wedged while seats keep settling — one per interval, past the silence budget', async () => {
    // Three quick-mode seats, one settling per interval: the body is silent for
    // at most one interval at a time, so it runs past 3 intervals untouched.
    collectRealVotesMock.mockImplementation(seatsSettlingEvery(INTERVAL_MS));
    const jobId = await dispatch();

    await vi.advanceTimersByTimeAsync(SILENCE_BUDGET_MS - 1);
    expect(readJobResult(jobId)?.status).toBe('pending');
    expect(readJobResult(jobId)?.lastProgressAt).toBeDefined();
    expect(getInFlight('consensus_vote')).toBe(1);

    // The last seat lands at 3 intervals; the vote then completes.
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(readJobResult(jobId)?.status).toBe('complete');
    });
    expect(getInFlight('consensus_vote')).toBe(0);
  });

  it('IS wedged at 3 intervals when every seat hangs, and the slot is released', async () => {
    collectRealVotesMock.mockImplementation(() => new Promise(() => undefined));
    const jobId = await dispatch();

    await vi.advanceTimersByTimeAsync(SILENCE_BUDGET_MS - 1);
    expect(readJobResult(jobId)?.status).toBe('pending');
    expect(getInFlight('consensus_vote')).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(readJobResult(jobId)?.status).toBe('failed');
    });
    expect(readJobResult(jobId)?.error).toBe(
      `wedged (no progress for ${String(SILENCE_BUDGET_MS)} ms)`
    );
    expect(getInFlight('consensus_vote')).toBe(0);
  });
});
