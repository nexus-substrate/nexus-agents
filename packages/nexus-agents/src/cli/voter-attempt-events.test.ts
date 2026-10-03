import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import { ModelError } from '../core/index.js';
import { collectRealVotes, executeAgentVote } from './voter-agents.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';
import { votesToCostInputs } from '../mcp/tools/decision-cost-recording.js';

vi.mock('../utils/async-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/async-utils.js')>();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});
vi.mock('../adapters/gateway-rediscovery.js', () => ({ ensureGatewayDiscovered: vi.fn() }));
vi.mock('../learning/usage-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning/usage-log.js')>();
  return { ...actual, recordUsageEvent: vi.fn() };
});

type CompletionResult = Awaited<ReturnType<IModelAdapter['complete']>>;
interface Telemetry {
  readonly observableAttempts: number;
  readonly events: readonly {
    readonly id: string;
    readonly role: string;
    readonly cli: string;
    readonly adapter: string;
    readonly model?: string;
    readonly attemptKind: string;
    readonly outcome: string;
    readonly usage: { readonly kind: string; readonly input?: number; readonly output?: number };
  }[];
}
const logger: ILogger = {
  setLevel: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};
const VALID_VOTE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Reviewed the artifact.',
  confidence: 0.9,
});
function response(text = VALID_VOTE, input = 17, output = 9): CompletionResult {
  return {
    ok: true,
    value: {
      content: [{ type: 'text', text }],
      usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
      model: 'served-model',
      stopReason: 'end_turn',
    },
  };
}
function seat(responses: readonly CompletionResult[], cli = 'cli-codex'): IModelAdapter {
  let index = 0;
  return {
    modelId: 'requested-model',
    providerId: cli,
    complete: vi.fn(() => Promise.resolve(responses[Math.min(index++, responses.length - 1)])),
  } as unknown as IModelAdapter;
}
function telemetry(value: unknown): Telemetry {
  const result = value as { readonly attemptTelemetry?: Telemetry };
  expect(result.attemptTelemetry).toBeDefined();
  return result.attemptTelemetry as Telemetry;
}
async function vote(
  adapter: IModelAdapter,
  maxRetries = 0
): Promise<Awaited<ReturnType<typeof executeAgentVote>>> {
  return executeAgentVote('architect', 'Review this change', adapter, logger, {
    timeoutMs: 5_000,
    maxRetries,
  });
}
function launch(
  adapter: IModelAdapter,
  deadlineMs = 1_000,
  fallback = adapter
): ReturnType<typeof launchVotesWithOverallDeadline> {
  return launchVotesWithOverallDeadline({
    roles: ['architect'],
    proposal: 'Review this change',
    roleAdapters: new Map([['architect', adapter]]),
    fallbackAdapter: fallback,
    logger,
    interDelay: 0,
    overallDeadlineMs: deadlineMs,
    voteOptions: { timeoutMs: 5_000, maxRetries: 0, allowSimulation: false },
    voteFn: executeAgentVote,
  });
}

describe('immutable voter outer-attempt telemetry (#6821)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('records one final success event with response provenance and unchanged final-seat usage', async () => {
    const result = await vote(seat([response()]));
    const observed = telemetry(result);
    expect(observed.observableAttempts).toBe(1);
    expect(observed.events).toHaveLength(1);
    expect(observed.events[0]).toMatchObject({
      role: 'architect',
      cli: 'cli-codex',
      adapter: 'cli-codex',
      model: 'served-model',
      attemptKind: 'initial',
      outcome: 'final',
      usage: { kind: 'reported', input: 17, output: 9 },
    });
    expect(observed.events[0]?.id).toEqual(expect.any(String));
    expect(Object.isFrozen(observed.events[0])).toBe(true);
    expect(Object.isFrozen(observed.events[0]?.usage)).toBe(true);
    expect(result.inputTokens).toBe(17);
    expect(result.outputTokens).toBe(9);
  });

  it('counts parse failure and successful retry exactly once without inflating final-seat totals', async () => {
    const result = await vote(
      seat([response('not a vote', 100, 50), response(VALID_VOTE, 7, 3)]),
      1
    );
    const observed = telemetry(result);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events).toHaveLength(2);
    expect(new Set(observed.events.map((e) => e.id)).size).toBe(2);
    expect(observed.events.map((e) => [e.attemptKind, e.outcome])).toEqual([
      ['initial', 'parse_failed'],
      ['parse_retry', 'final'],
    ]);
    expect(observed.events.map((e) => e.usage)).toEqual([
      { kind: 'reported', input: 100, output: 50 },
      { kind: 'reported', input: 7, output: 3 },
    ]);
    expect(result.inputTokens).toBe(7);
    expect(result.outputTokens).toBe(3);
    expect(votesToCostInputs([result])[0]?.inputTokens).toBe(7);
  });

  it('represents missing response usage as unknown', async () => {
    const missing = response();
    if (!missing.ok) throw new Error('fixture must be successful');
    const { usage: _usage, ...value } = missing.value;
    const result = await vote(seat([{ ok: true, value: value }]));
    expect(telemetry(result).events[0]?.usage).toEqual({ kind: 'unknown' });
    expect(result.inputTokens).toBeUndefined();
  });

  it('keeps explicit zero usage as a reported measurement', async () => {
    const result = await vote(seat([response(VALID_VOTE, 0, 0)]));
    expect(telemetry(result).events[0]?.usage).toEqual({ kind: 'reported', input: 0, output: 0 });
  });

  it('does not report a placeholder zero input count as measured usage', async () => {
    const partial = response(VALID_VOTE, 0, 9);
    if (!partial.ok || partial.value.usage === undefined)
      throw new Error('fixture must report usage');
    partial.value.usage.inputTokensMeasured = false;
    const result = await vote(seat([partial]));
    expect(telemetry(result).events[0]?.usage).toEqual({ kind: 'unknown' });
  });

  it('keeps an observable ModelError attempt without manufacturing a response event', async () => {
    const result = await vote(
      seat([{ ok: false, error: new ModelError('adapter unavailable', { retryable: false }) }])
    );
    expect(telemetry(result)).toMatchObject({ observableAttempts: 1, events: [] });
  });

  it('records only the response when structured-output negotiation errors before succeeding', async () => {
    const adapter = seat([
      {
        ok: false,
        error: new ModelError('No endpoints found that support tool use', { retryable: true }),
      },
      response(),
    ]);
    const observed = telemetry(await vote(adapter));
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events).toHaveLength(1);
    expect(observed.events[0]).toMatchObject({ attemptKind: 'parse_retry', outcome: 'final' });
    expect(adapter.complete).toHaveBeenCalledTimes(2);
  });

  it('carries the first role pass into its replacement and labels role_retry', async () => {
    const results = await collectRealVotes({
      adapter: seat([response('not a vote'), response()]),
      logger,
      roles: ['architect'],
      proposal: 'Review this change',
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    const observed = telemetry(results[0]);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events.map((e) => [e.attemptKind, e.outcome])).toEqual([
      ['initial', 'parse_failed'],
      ['role_retry', 'final'],
    ]);
    expect(results[0]?.inputTokens).toBe(17);
  });

  it('preserves primary and fallback response provenance', async () => {
    const results = await launch(
      seat([response('not a vote')], 'cli-gemini'),
      1_000,
      seat([response()])
    );
    const observed = telemetry(results[0]);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events.map((e) => [e.cli, e.attemptKind, e.outcome])).toEqual([
      ['cli-gemini', 'initial', 'parse_failed'],
      ['cli-codex', 'cli_fallback', 'final'],
    ]);
  });

  it('marks a parsed first-pass response superseded when a role replacement answers', async () => {
    const unverifiable = JSON.stringify({
      decision: 'abstain',
      reasoning: 'UNVERIFIABLE: could not read artifact',
      confidence: 0,
    });
    const results = await collectRealVotes({
      adapter: seat([response(unverifiable, 100, 50), response(VALID_VOTE, 7, 3)]),
      logger,
      roles: ['architect'],
      proposal: 'Review this change',
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(telemetry(results[0]).events.map((e) => [e.attemptKind, e.outcome])).toEqual([
      ['initial', 'superseded'],
      ['role_retry', 'final'],
    ]);
    expect(results[0]?.inputTokens).toBe(7);
  });

  it('retains a timed-out first response settling after its role was replaced but before persistence', async () => {
    vi.useFakeTimers();
    const adapter = seat([]);
    let calls = 0;
    adapter.complete = vi.fn(() => {
      calls++;
      return calls === 1
        ? new Promise<CompletionResult>((resolve) =>
            setTimeout(() => {
              resolve(response(VALID_VOTE, 100, 50));
            }, 140)
          )
        : Promise.resolve(response(VALID_VOTE, 7, 3));
    });
    const pending = collectRealVotes({
      adapter,
      logger,
      roles: ['architect'],
      proposal: 'Review this change',
      timeoutMs: 100,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    await vi.advanceTimersByTimeAsync(100);
    const results = await pending;
    expect(results[0]?.source).toBe('llm');
    expect(results[0]?.inputTokens).toBe(7);
    await vi.advanceTimersByTimeAsync(40);
    const observed = telemetry(votesToCostInputs(results)[0]);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events).toHaveLength(2);
    expect(observed.events.map((e) => [e.attemptKind, e.outcome, e.usage.input])).toEqual([
      ['initial', 'superseded', 100],
      ['role_retry', 'final', 7],
    ]);
  });

  it('retains both parse failures when a role retry fails again', async () => {
    const results = await collectRealVotes({
      adapter: seat([response('invalid first', 100, 50), response('invalid retry', 7, 3)]),
      logger,
      roles: ['architect'],
      proposal: 'Review this change',
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(results[0]?.source).toBe('error');
    const observed = telemetry(results[0]);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events).toHaveLength(2);
    expect(observed.events.map((e) => [e.attemptKind, e.outcome])).toEqual(
      expect.arrayContaining([
        ['role_retry', 'parse_failed'],
        ['initial', 'parse_failed'],
      ])
    );
  });

  it('retains a late primary response after cross-CLI fallback answers', async () => {
    vi.useFakeTimers();
    const primary = seat([], 'cli-gemini');
    primary.complete = vi.fn(
      () =>
        new Promise<CompletionResult>((resolve) =>
          setTimeout(() => {
            resolve(response(VALID_VOTE, 100, 50));
          }, 140)
        )
    );
    const fallback = seat([response(VALID_VOTE, 7, 3)]);
    const pending = launchVotesWithOverallDeadline({
      roles: ['architect'],
      proposal: 'Review this change',
      roleAdapters: new Map([['architect', primary]]),
      fallbackAdapter: fallback,
      logger,
      interDelay: 0,
      overallDeadlineMs: 1_000,
      voteOptions: { timeoutMs: 100, maxRetries: 0, allowSimulation: false },
      voteFn: executeAgentVote,
    });
    await vi.advanceTimersByTimeAsync(100);
    const results = await pending;
    expect(results[0]?.inputTokens).toBe(7);
    await vi.advanceTimersByTimeAsync(40);
    const observed = telemetry(votesToCostInputs(results)[0]);
    expect(observed.observableAttempts).toBe(2);
    expect(observed.events).toHaveLength(2);
    expect(observed.events.map((e) => [e.attemptKind, e.outcome, e.usage.input])).toEqual([
      ['initial', 'superseded', 100],
      ['cli_fallback', 'final', 7],
    ]);
  });

  it('captures a late raw response before the persistence snapshot', async () => {
    vi.useFakeTimers();
    const adapter = seat([]);
    adapter.complete = vi.fn(
      () =>
        new Promise<CompletionResult>((resolve) =>
          setTimeout(() => {
            resolve(response());
          }, 140)
        )
    );
    const pending = launch(adapter, 100);
    await vi.advanceTimersByTimeAsync(100);
    const results = await pending;
    expect(results[0]?.source).toBe('error');
    await vi.advanceTimersByTimeAsync(40);
    const observed = telemetry(votesToCostInputs(results)[0]);
    expect(observed.observableAttempts).toBe(1);
    expect(observed.events).toHaveLength(1);
    expect(observed.events[0]).toMatchObject({
      outcome: 'superseded',
      usage: { kind: 'reported', input: 17, output: 9 },
    });
  });

  it('keeps persistence snapshots immutable when a raw response arrives afterward', async () => {
    vi.useFakeTimers();
    const adapter = seat([]);
    adapter.complete = vi.fn(
      () =>
        new Promise<CompletionResult>((resolve) =>
          setTimeout(() => {
            resolve(response());
          }, 140)
        )
    );
    const pending = launch(adapter, 100);
    await vi.advanceTimersByTimeAsync(100);
    const results = await pending;
    const before = telemetry(votesToCostInputs(results)[0]);
    expect(before).toMatchObject({ observableAttempts: 1, events: [] });
    await vi.advanceTimersByTimeAsync(40);
    expect(before).toMatchObject({ observableAttempts: 1, events: [] });
    expect(Object.isFrozen(before.events)).toBe(true);
  });
});
