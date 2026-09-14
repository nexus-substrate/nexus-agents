/**
 * #6269 — the seam, end to end: a CLI seat whose binary fails auth (a
 * SUCCESS envelope with an EMPTY response on stdout, `Error authenticating`
 * on stderr) must error on its FIRST attempt, skip the per-seat parse retries,
 * and be recovered by the #3587 cross-CLI fallback. On the 2026-09-14
 * governor panel the seat instead burned three ~5-minute attempts as "Vote
 * parsing failed: Unexpected end of JSON input" and ran into the deadline,
 * which `shouldRetryOnFallback` excludes — so a healthy fallback never ran.
 *
 * The real agy parser, the real `CliToModelAdapter` bridge, the real vote
 * executor and the real launcher run here; only `spawn` is faked. The real
 * binary is never invoked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';

import type { CliTask, ICliResponseParser } from '../cli-adapters/types.js';
import type { CommandConfig } from '../cli-adapters/subprocess-adapter.js';
import { SubprocessCliAdapter } from '../cli-adapters/subprocess-adapter.js';
import { AgyResponseParser } from '../cli-adapters/parsers/agy-parser.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import type { IModelAdapter, ILogger, CompletionResponse, Result } from '../core/index.js';
import type { ModelError } from '../core/index.js';
import type { VoterRole } from './vote-types.js';
import { executeAgentVote } from './voter-agents.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

// The voter backoff (1 s, 2 s) would only slow a test that must show the
// retries do NOT happen; resolve it instantly so a regression shows up as a
// spawn count, not a timeout.
vi.mock('../utils/async-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/async-utils.js')>();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockChildProcess() {
  const emitter = new EventEmitter();
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const mockChild = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
    pid: 1234,
    exitCode: null as number | null,
    signalCode: null as string | null,
  }) as unknown as ChildProcess;
  return { mockChild, stdout, stderr };
}

class FakeAgyAdapter extends SubprocessCliAdapter {
  override readonly name = 'gemini' as const;
  readonly version = '1.0.0';
  protected override readonly transientRetry = { enabled: false };
  protected readonly parser: ICliResponseParser = new AgyResponseParser();
  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'agy', args: [] };
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'gemini-test',
      name: 'Gemini Test',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1.0,
      costPerMillionOutput: 2.0,
    };
  }
}

const EMPTY_SUCCESS_ENVELOPE = JSON.stringify({
  conversation_id: 'c-1',
  status: 'SUCCESS',
  response: '',
  duration_seconds: 0,
  num_turns: 0,
});

const AUTH_STDERR =
  'Error authenticating: IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals.\n' +
  '    at throwIneligibleOrProjectIdError (file:///bundle/chunk.js:310176:11)\n';

/** Every spawn of the fake agy binary answers with the same stdout/stderr and exit 0. */
function spawnAlwaysAnswers(stdoutText: string, stderrText: string): void {
  mockSpawn.mockImplementation(() => {
    const { mockChild, stdout, stderr } = createMockChildProcess();
    setImmediate(() => {
      if (stdoutText !== '') stdout.emit('data', Buffer.from(stdoutText));
      if (stderrText !== '') stderr.emit('data', Buffer.from(stderrText));
      mockChild.emit('close', 0);
    });
    return mockChild;
  });
}

const VALID_VOTE_JSON = JSON.stringify({
  decision: 'approve',
  reasoning: 'The change is sound and the tests cover the failure it names',
  confidence: 0.8,
});

/** A healthy fallback seat on another CLI. */
function makeHealthyFallback(): IModelAdapter & { complete: ReturnType<typeof vi.fn> } {
  const ok: Result<CompletionResponse, ModelError> = {
    ok: true,
    value: {
      content: [{ type: 'text', text: VALID_VOTE_JSON }],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      stopReason: 'end_turn',
      model: 'claude-test',
    },
  };
  return {
    modelId: 'claude-test',
    providerId: 'cli-claude',
    name: 'claude',
    complete: vi.fn().mockResolvedValue(ok),
  } as unknown as IModelAdapter & { complete: ReturnType<typeof vi.fn> };
}

function makeLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

const VOTE_OPTIONS = { timeoutMs: 5_000, maxRetries: 2, allowSimulation: false } as const;

describe('an auth-failed CLI seat falls over on its first attempt (#6269)', () => {
  let geminiSeat: IModelAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    geminiSeat = new CliToModelAdapter(new FakeAgyAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors on attempt 1 with the CLI and the stderr line, and does not retry the seat', async () => {
    spawnAlwaysAnswers(EMPTY_SUCCESS_ENVELOPE, AUTH_STDERR);
    const logger = makeLogger();

    const result = await executeAgentVote('catfish', 'proposal', geminiSeat, logger, VOTE_OPTIONS);

    expect(result.source).toBe('error');
    expect(result.error).toContain('gemini');
    expect(result.error).toContain('Error authenticating: IneligibleTierError');
    // Not "Vote parsing failed": the auth outage is named, not misdescribed.
    expect(result.error).not.toContain('Vote parsing failed');
    // maxRetries: 2 would allow three spawns; an auth failure is terminal.
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const failed = logger.warn.mock.calls.find(([msg]) => msg === 'Vote attempt failed');
    expect(failed?.[1]).toMatchObject({ role: 'catfish', attempt: 1, authFailure: true });
  });

  it('the #3587 fallback recovers the seat and discloses an auth fallover', async () => {
    spawnAlwaysAnswers(EMPTY_SUCCESS_ENVELOPE, AUTH_STDERR);
    const fallback = makeHealthyFallback();

    const results = await launchVotesWithOverallDeadline({
      roles: ['catfish'],
      proposal: 'proposal',
      roleAdapters: new Map<VoterRole, IModelAdapter>([['catfish', geminiSeat]]),
      fallbackAdapter: fallback,
      logger: makeLogger(),
      voteOptions: VOTE_OPTIONS,
      interDelay: 0,
      overallDeadlineMs: 10_000,
      voteFn: executeAgentVote,
    });

    // ONE spawn: the seat did not burn its retries before falling over. (With
    // a generous deadline the pre-fix code also reached the fallback — after
    // three parse-failure attempts; on the live panel those attempts were the
    // whole budget, and the deadline result is excluded from fallover.)
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
    expect(results[0]?.source).toBe('llm');
    expect(results[0]?.vote.decision).toBe('approve');
    expect(results[0]?.fallback).toMatchObject({ fromCli: 'gemini', reason: 'auth' });
  });

  it('a healthy seat is unchanged: an answer on stdout is the vote, and the fallback never runs', async () => {
    spawnAlwaysAnswers(JSON.stringify({ status: 'SUCCESS', response: VALID_VOTE_JSON }), '');
    const fallback = makeHealthyFallback();

    const results = await launchVotesWithOverallDeadline({
      roles: ['catfish'],
      proposal: 'proposal',
      roleAdapters: new Map<VoterRole, IModelAdapter>([['catfish', geminiSeat]]),
      fallbackAdapter: fallback,
      logger: makeLogger(),
      voteOptions: VOTE_OPTIONS,
      interDelay: 0,
      overallDeadlineMs: 10_000,
      voteFn: executeAgentVote,
    });

    expect(results[0]?.source).toBe('llm');
    expect(results[0]?.fallback).toBeUndefined();
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('the named empty case: an empty answer with EMPTY stderr still takes the parse-failure route and retries', async () => {
    // No stderr means no auth evidence. The existing behaviour stands: each
    // attempt parses "" and fails, the seat retries maxRetries times, and the
    // Vote attempt failed line carries no cliStderr because there was none.
    spawnAlwaysAnswers(EMPTY_SUCCESS_ENVELOPE, '');
    const logger = makeLogger();

    const result = await executeAgentVote('catfish', 'proposal', geminiSeat, logger, VOTE_OPTIONS);

    expect(result.source).toBe('error');
    expect(result.error).toContain('Vote parsing failed');
    expect(mockSpawn).toHaveBeenCalledTimes(3);
    const failed = logger.warn.mock.calls.find(([msg]) => msg === 'Vote attempt failed');
    expect(failed?.[1]).not.toHaveProperty('cliStderr');
    expect(failed?.[1]).not.toHaveProperty('authFailure');
  });

  it('a parse failure with NON-auth stderr logs the first stderr line, clipped, on Vote attempt failed', async () => {
    const longLine = `warning: ${'x'.repeat(400)}`;
    spawnAlwaysAnswers(EMPTY_SUCCESS_ENVELOPE, `${longLine}\nsecond line never logged\n`);
    const logger = makeLogger();

    const result = await executeAgentVote('catfish', 'proposal', geminiSeat, logger, VOTE_OPTIONS);

    expect(result.error).toContain('Vote parsing failed');
    const failed = logger.warn.mock.calls.find(([msg]) => msg === 'Vote attempt failed');
    const ctx = failed?.[1] as { cliStderr?: string } | undefined;
    expect(ctx?.cliStderr).toBeDefined();
    expect(ctx?.cliStderr).toHaveLength(200);
    expect(ctx?.cliStderr?.startsWith('warning: xxx')).toBe(true);
    expect(ctx?.cliStderr).not.toContain('second line');
  });
});
