/**
 * A claude `is_error` envelope is an error, and an out-of-credits envelope
 * falls back once within the claude family (#6120).
 *
 * Fixtures reproduce the envelope measured on 2026-09-13: exit code 1, empty
 * stderr, `type: "result"`, `is_error: true`, `subtype: "success"`,
 * `stop_reason: "stop_sequence"`, `api_error_status: 429` and the
 * out-of-credits text in `result`. The `429` matters: it sits in the raw
 * stdout, so the whole-envelope rate-limit scan matched it and the error
 * message became the first 500 characters of the envelope, never the text.
 *
 * @module cli-adapters/adapters/claude-adapter-is-error.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ClaudeCliAdapter } from './claude-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-circuit-breaker.js';

interface ScriptedRun {
  readonly stdout: string;
  readonly exitCode: number;
}

/** One entry per spawn, consumed in order; an exhausted script fails loudly. */
const script: ScriptedRun[] = [];
const spawnedArgs: string[][] = [];

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn((_cmd: string, args: string[]) => {
    spawnedArgs.push(args);
    const run = script.shift();
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: () => void; end: () => void };
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: () => undefined, end: () => undefined };
    child.kill = () => undefined;
    setImmediate(() => {
      if (run === undefined) {
        child.stderr.emit('data', Buffer.from('error: test script exhausted — unexpected spawn'));
        child.emit('close', 1);
        return;
      }
      child.stdout.emit('data', Buffer.from(run.stdout));
      child.emit('close', run.exitCode);
    });
    return child;
  }),
}));

const OUT_OF_CREDITS =
  "You're out of usage credits. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue.";

/**
 * The measured envelope's field ORDER and bulk, not just its load-bearing
 * fields. `result` sits past the 1,000th character, after `usage` and the
 * subagent stats, so the 500-character snippet the old path produced never
 * reached it — a shorter fixture with `result` near the front let the test
 * pass against a parser that dropped `is_error`.
 */
function errorEnvelope(result: string, apiErrorStatus = 429): ScriptedRun {
  return {
    stdout: JSON.stringify({
      duration_api_ms: 0,
      stop_reason: 'stop_sequence',
      session_id: '7203347f-3700-4e46-87f4-74b45c70682b',
      total_cost_usd: 0,
      usage: {
        output_tokens_details: { thinking_tokens: 0 },
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        service_tier: 'standard',
        cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
        inference_geo: '',
        iterations: [],
        speed: 'standard',
      },
      modelUsage: {},
      permission_denials: [],
      terminal_reason: 'api_error',
      fast_mode_state: 'off',
      fast_mode_disabled_reason: 'sdk_opt_in_required',
      subagent_stats: {
        spawned: 0,
        requested: { background: 0, foreground: 0, unset: 0 },
        started_in_background: 0,
        max_depth: 0,
        spawned_by_subagents: 0,
        completed: 0,
        failed: 0,
        killed: { parent: 0, user: 0, system: 0 },
        refused: { depth_limit: 0, concurrency_limit: 0, budget: 0 },
        by_type: {},
      },
      is_error: true,
      num_turns: 1,
      subtype: 'success',
      api_error_status: apiErrorStatus,
      result,
      type: 'result',
      duration_ms: 596,
      uuid: '181bae9d-faa9-4c65-b496-26962f3a4c66',
      queued_turn_count: 0,
      result_index: 0,
    }),
    exitCode: 1,
  };
}

function okEnvelope(text: string): ScriptedRun {
  return {
    stdout: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      stop_reason: 'end_turn',
      result: text,
      usage: { input_tokens: 10, output_tokens: 2 },
      session_id: 'sess-ok',
    }),
    exitCode: 0,
  };
}

function modelArg(args: string[] | undefined): string | undefined {
  if (args === undefined) return undefined;
  const at = args.indexOf('--model');
  return at === -1 ? undefined : args[at + 1];
}

const OPTIONS = { timeoutMs: 5_000 } as const;

describe('ClaudeCliAdapter is_error envelope (#6120)', () => {
  beforeEach(() => {
    script.length = 0;
    spawnedArgs.length = 0;
    getDefaultCliCircuitBreakerRegistry().getBreaker('claude').reset();
  });

  it('(a) surfaces the envelope result text and stop_reason as a typed error, never empty text', async () => {
    script.push(errorEnvelope(OUT_OF_CREDITS), errorEnvelope(OUT_OF_CREDITS));
    const adapter = new ClaudeCliAdapter();

    const result = await adapter.execute({ content: 'reply ok' }, OPTIONS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('out of usage credits');
    expect(result.error.message).toContain('stop_sequence');
    expect(result.error.message).not.toContain('"duration_api_ms"');
    expect(result.error.retryable).toBe(false);
  });

  it('(b) retries once with the next claude alias from the registry and records fallbackFrom', async () => {
    script.push(errorEnvelope(OUT_OF_CREDITS), okEnvelope('ok from the next alias'));
    const adapter = new ClaudeCliAdapter();
    // A spy, not the count: the outer loop's `recordSuccess()` zeroes the
    // count after any success, so `failureCount === 0` would hold even if the
    // capacity error HAD been recorded first.
    const recordFailure = vi.spyOn(
      getDefaultCliCircuitBreakerRegistry().getBreaker('claude'),
      'recordFailure'
    );

    const result = await adapter.execute({ content: 'reply ok' }, OPTIONS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('ok from the next alias');
    expect(result.value.fallbackFrom).toBe('fable');
    expect(result.value.model).toBe('opus');
    expect(spawnedArgs).toHaveLength(2);
    expect(modelArg(spawnedArgs[0])).toBe('fable');
    expect(modelArg(spawnedArgs[1])).toBe('opus');
    // Per-model capacity is not a per-CLI failure: nothing reaches the breaker.
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it('(b) a second capacity error propagates the typed error and records ONE breaker failure', async () => {
    script.push(errorEnvelope(OUT_OF_CREDITS), errorEnvelope(OUT_OF_CREDITS));
    const adapter = new ClaudeCliAdapter();

    const result = await adapter.execute({ content: 'reply ok' }, OPTIONS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('out of usage credits');
    // Exactly one fallback, no in-place transient retries of a durable cap.
    expect(spawnedArgs).toHaveLength(2);
    expect(
      getDefaultCliCircuitBreakerRegistry().getBreaker('claude').getSnapshot().failureCount
    ).toBe(1);
  });

  it('(c) a non-capacity is_error (auth) is typed and does not retry another alias', async () => {
    script.push(errorEnvelope('Not logged in. Please run /login to authenticate.', 401));
    const adapter = new ClaudeCliAdapter();

    const result = await adapter.execute({ content: 'reply ok' }, OPTIONS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
    expect(result.error.message).toContain('Not logged in');
    expect(spawnedArgs).toHaveLength(1);
  });

  it('honours inFamilyFallback: false so a probe measures the requested model only', async () => {
    script.push(errorEnvelope(OUT_OF_CREDITS));
    const adapter = new ClaudeCliAdapter();

    const result = await adapter.execute(
      { content: 'reply ok', options: { inFamilyFallback: false } },
      OPTIONS
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('out of usage credits');
    expect(spawnedArgs).toHaveLength(1);
  });

  it('does not fall back when the requested alias is the last one the registry lists', async () => {
    script.push(errorEnvelope(OUT_OF_CREDITS));
    const adapter = new ClaudeCliAdapter({ model: 'haiku' });

    const result = await adapter.execute({ content: 'reply ok' }, OPTIONS);

    expect(result.ok).toBe(false);
    expect(spawnedArgs).toHaveLength(1);
    expect(modelArg(spawnedArgs[0])).toBe('haiku');
  });
});
