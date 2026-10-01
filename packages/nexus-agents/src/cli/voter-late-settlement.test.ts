import { APIUserAbortError } from 'openai/core/error';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionResponse, IModelAdapter, ILogger, Result } from '../core/index.js';
import { ModelError, err } from '../core/index.js';
import { createCallerAbortCliError } from '../cli-adapters/cli-error-helpers.js';
import { launchVotesWithOverallDeadline, type VoteFn } from './voter-agents-deadline.js';
import { executeAgentVote } from './voter-agents.js';
import { createErrorVoteResult } from './voter-execution.js';
import { recordAbortObservation } from '../adapters/abort-observation.js';
import { getUsageLogPath, loadUsageEvents, recordUsageEvent } from '../learning/usage-log.js';
import type { AgentVoteResult } from './vote-types.js';

const usageLogLogger = vi.hoisted(() => ({ warn: vi.fn(), debug: vi.fn() }));
vi.mock('../core/logger.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/logger.js')>();
  return {
    ...original,
    createLogger: (options: Parameters<typeof original.createLogger>[0]) =>
      options?.component === 'usage-log' ? usageLogLogger : original.createLogger(options),
  };
});

const DEADLINE_MS = 100;
const LATE_MS = 40;
const logger: ILogger = {
  setLevel: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};
const vote: AgentVoteResult = {
  role: 'architect',
  source: 'llm',
  processingTimeMs: DEADLINE_MS + LATE_MS,
  vote: { decision: 'approve', confidence: 0.9, reasoning: 'test' },
  model: 'served-model',
  inputTokens: 17,
  outputTokens: 9,
};
function errorVote(error: string): AgentVoteResult {
  return createErrorVoteResult('architect', error, DEADLINE_MS + LATE_MS);
}
const adapter = { modelId: 'requested-model', providerId: 'cli-codex' } as IModelAdapter;

function launch(voteFn: VoteFn, usedAdapter = adapter): Promise<readonly AgentVoteResult[]> {
  return launchVotesWithOverallDeadline({
    roles: ['architect'],
    proposal: 'p',
    roleAdapters: new Map(),
    fallbackAdapter: usedAdapter,
    logger,
    voteOptions: { timeoutMs: 10_000, maxRetries: 0, allowSimulation: false },
    interDelay: 0,
    overallDeadlineMs: DEADLINE_MS,
    voteFn,
  });
}

function rows(): unknown[] {
  const path = getUsageLogPath();
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s) as unknown)
    : [];
}

describe('late voter settlement measurement (#6851)', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'late-voter-'));
    vi.stubEnv('NEXUS_DATA_DIR', dataDir);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes exactly one durable record after the deadline with reported usage', async () => {
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(vote);
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    const result = await pending;
    expect(result[0]?.error).toBe('overall consensus deadline exceeded');
    expect(result[0]?.inputTokens).toBeUndefined();
    expect(result[0]?.attemptUsage).toBeUndefined();
    expect(rows()).toEqual([]);
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([
      {
        kind: 'measurement',
        event: 'voter_late_settlement',
        timestamp: new Date().toISOString(),
        role: 'architect',
        cli: 'cli-codex',
        model: 'served-model',
        msAfterDeadline: LATE_MS,
        settled: 'ok',
        settledBy: 'adapter',
        usage: { inputTokens: 17, outputTokens: 9 },
      },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rows()).toHaveLength(1);
    expect(loadUsageEvents().events).toEqual([]);
    expect(usageLogLogger.warn).not.toHaveBeenCalledWith(
      'Usage ledger lines rejected as unreadable',
      expect.anything()
    );
  });

  it('writes nothing when the losing promise never settles (lower bound)', async () => {
    const pending = launch(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + 1_000);
    expect((await pending)[0]?.source).toBe('error');
    expect(rows()).toEqual([]);
  });

  it('records a late rejection as error without manufacturing usage', async () => {
    const pending = launch(
      () =>
        new Promise((_resolve, reject) =>
          setTimeout(() => {
            reject(new Error('late'));
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([
      expect.objectContaining({
        settled: 'error',
        settledBy: 'adapter',
        msAfterDeadline: LATE_MS,
        model: 'requested-model',
      }),
    ]);
    expect(rows()[0]).not.toHaveProperty('usage');
  });

  it('labels an untracked vote that ended in the seat-cancelled error as an abort', async () => {
    // A voter function that never reaches the adapter cannot be observed
    // directly; its cancelled-seat result is the deadline's doing, not a late answer.
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(errorVote('cancelled while this voter was in flight: upstream reset'));
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([expect.objectContaining({ settled: 'error', settledBy: 'abort' })]);
  });

  it('keeps an ordinary late voter error labelled as adapter settlement', async () => {
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(errorVote('rate limited'));
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([expect.objectContaining({ settled: 'error', settledBy: 'adapter' })]);
  });

  it.each([
    ['a non-string name', { name: 42 }, 'cli-codex'],
    ['an empty name', { name: '' }, 'cli-codex'],
    ['a string name', { name: 'codex' }, 'codex'],
  ])('records the cli field from %s only when it is a string', async (_label, extra, cli) => {
    const named = { ...adapter, ...extra } as unknown as IModelAdapter;
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(vote);
          }, DEADLINE_MS + LATE_MS)
        ),
      named
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([expect.objectContaining({ cli })]);
  });

  it('does not observe a vote that settles before the deadline', async () => {
    await launch(() => Promise.resolve(vote));
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + LATE_MS);
    expect(rows()).toEqual([]);
  });

  it('does not claim adapter settlement when the deadline only cancels retry backoff', async () => {
    const alreadySettled = {
      ...adapter,
      complete: vi.fn(() =>
        Promise.resolve({ ok: false, error: { message: 'temporary error', retryable: true } })
      ),
    } as unknown as IModelAdapter;
    const pending = launch(
      (role, proposal, used, log, options) =>
        executeAgentVote(role, proposal, used, log, { ...options, maxRetries: 1 }),
      alreadySettled
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alreadySettled.complete).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual([]);
  });

  it.each(['cli', 'sdk'] as const)(
    'records an abort-reactive %s error once with stdout evidence and no invented usage',
    async (transport) => {
      const reactive = {
        ...adapter,
        complete: (request: { signal?: AbortSignal }) =>
          new Promise((resolve) => {
            request.signal?.addEventListener(
              'abort',
              () => {
                recordAbortObservation(request.signal?.reason, {
                  stdoutBytes: 6,
                  sawFirstByte: true,
                });
                const error = createCallerAbortCliError(
                  request.signal?.reason,
                  'Aborted by caller signal',
                  'codex'
                );
                const cause =
                  transport === 'sdk'
                    ? new Error('SDK wrapper', { cause: new APIUserAbortError() })
                    : error.cause;
                resolve(err(new ModelError(error.message, cause === undefined ? {} : { cause })));
              },
              { once: true }
            );
          }),
      } as unknown as IModelAdapter;
      const pending = launch(executeAgentVote, reactive);
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      expect((await pending)[0]?.error).toBe('overall consensus deadline exceeded');
      expect(rows()).toEqual([
        expect.objectContaining({
          settled: 'error',
          settledBy: 'abort',
          msAfterDeadline: 0,
          stdoutBytes: 6,
          sawFirstByte: true,
        }),
      ]);
      expect(rows()[0]).not.toHaveProperty('usage');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(rows()).toHaveLength(1);
    }
  );

  it('omits unknown model and usage rather than recording placeholders or zero', async () => {
    const unknown = { modelId: 'pending-detection', providerId: 'unknown' } as IModelAdapter;
    const pending = launch(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ...vote, model: undefined, inputTokens: undefined, outputTokens: undefined });
          }, DEADLINE_MS + LATE_MS);
        }),
      unknown
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + LATE_MS);
    await pending;
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).not.toHaveProperty('model');
    expect(rows()[0]).not.toHaveProperty('usage');
  });

  it('observes the actual adapter even when raceAbort already settled the voter', async () => {
    const deaf = {
      ...adapter,
      complete: () =>
        new Promise<Result<CompletionResponse, ModelError>>((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              value: {
                content: [
                  {
                    type: 'text',
                    text: '{"decision":"approve","confidence":0.9,"reasoning":"test"}',
                  },
                ],
                model: 'served-model',
                usage: { inputTokens: 17, outputTokens: 9, totalTokens: 26 },
              } as CompletionResponse,
            });
          }, DEADLINE_MS + LATE_MS);
        }),
    } as IModelAdapter;
    const pending = launch(executeAgentVote, deaf);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect((await pending)[0]?.error).toBe('overall consensus deadline exceeded');
    expect(rows()).toEqual([]);
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([
      expect.objectContaining({
        settled: 'ok',
        settledBy: 'adapter',
        msAfterDeadline: LATE_MS,
        usage: { inputTokens: 17, outputTokens: 9, totalTokens: 26 },
      }),
    ]);
  });

  it('logs a write failure without rejecting the detached continuation', async () => {
    const blocked = join(dataDir, 'blocked');
    writeFileSync(blocked, 'not a directory');
    vi.stubEnv('NEXUS_DATA_DIR', blocked);
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(vote);
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to persist late voter settlement measurement',
      expect.anything()
    );
  });

  it('preserves total-only and cache usage without filling missing token counts', async () => {
    const totalOnly = {
      ...adapter,
      complete: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              value: {
                model: 'served-model',
                content: [],
                usage: {
                  totalTokens: 26,
                  cachedInputTokens: 8,
                  cacheCreationInputTokens: 0,
                },
              },
            });
          }, DEADLINE_MS + LATE_MS);
        }),
    } as unknown as IModelAdapter;
    const pending = launch(executeAgentVote, totalOnly);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + LATE_MS);
    await pending;
    expect(rows()).toEqual([
      expect.objectContaining({
        usage: {
          totalTokens: 26,
          cachedInputTokens: 8,
          cacheCreationInputTokens: 0,
        },
      }),
    ]);
  });

  it('records raw adapter rejection after raceAbort as error without usage', async () => {
    const rejecting = {
      ...adapter,
      complete: () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('late adapter rejection'));
          }, DEADLINE_MS + LATE_MS);
        }),
    } as IModelAdapter;
    const pending = launch(executeAgentVote, rejecting);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await pending;
    expect(rows()).toEqual([]);
    await vi.advanceTimersByTimeAsync(LATE_MS);
    expect(rows()).toEqual([
      expect.objectContaining({ settled: 'error', settledBy: 'adapter', msAfterDeadline: LATE_MS }),
    ]);
    expect(rows()[0]).not.toHaveProperty('usage');
  });

  it('writes nothing when the actual adapter never settles even though raceAbort does', async () => {
    const parked = { ...adapter, complete: () => new Promise(() => undefined) } as IModelAdapter;
    const pending = launch(executeAgentVote, parked);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + 1_000);
    expect((await pending)[0]?.source).toBe('error');
    expect(rows()).toEqual([]);
  });

  it('keeps existing billing rows in cost loading beside measurement rows', async () => {
    recordUsageEvent({
      timestamp: new Date().toISOString(),
      modelId: 'billed',
      providerId: 'api',
      inputTokens: 3,
      outputTokens: 2,
      usdCost: 0.1,
      latencyMs: 1,
      success: true,
    });
    const pending = launch(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(vote);
          }, DEADLINE_MS + LATE_MS)
        )
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + LATE_MS);
    await pending;
    expect(rows()).toHaveLength(2);
    expect(loadUsageEvents().events).toEqual([
      expect.objectContaining({ modelId: 'billed', usdCost: 0.1 }),
    ]);
  });
});
