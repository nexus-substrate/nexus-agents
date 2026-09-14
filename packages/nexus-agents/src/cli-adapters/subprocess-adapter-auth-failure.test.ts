/**
 * #6269: a CLI whose auth is broken can exit 0 with a well-formed SUCCESS
 * envelope whose `response` is EMPTY, and the auth failure only on stderr.
 * `agy --output-format json` did exactly that on the 2026-09-14 governor
 * panel; the vote path then parsed "" as a vote ("Unexpected end of JSON
 * input"), retried it as a parse failure, and never reached the #3587
 * cross-CLI fallback.
 *
 * These tests drive the REAL agy parser through a fake spawn (the real binary
 * is never invoked) and pin the classification at the subprocess seam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';

import type { CliTask, ResolvedExecutionOptions, ICliResponseParser } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';
import { SubprocessCliAdapter } from './subprocess-adapter.js';
import { AgyResponseParser } from './parsers/agy-parser.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
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

/** The gemini arm's shape: the agy parser behind a fake spawn. */
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
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1.0,
      costPerMillionOutput: 2.0,
    };
  }
}

const OPTIONS: ResolvedExecutionOptions = {
  timeoutMs: 5000,
  allowRetry: false,
  maxRetries: 0,
  trackUsage: true,
  onProgress: undefined,
};

/** A well-formed agy SUCCESS envelope carrying no answer at all. */
const EMPTY_SUCCESS_ENVELOPE = JSON.stringify({
  conversation_id: 'c-1',
  status: 'SUCCESS',
  response: '',
  duration_seconds: 0,
  num_turns: 0,
});

/** Verbatim head of the incident stderr (stack frames and the tier table follow). */
const AUTH_STDERR =
  'Error authenticating: IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google\n' +
  '    at throwIneligibleOrProjectIdError (file:///home/u/.local/lib/node_modules/@google/gemini-cli/bundle/chunk.js:310176:11)\n' +
  '    at _doSetupUser (file:///home/u/.local/lib/node_modules/@google/gemini-cli/bundle/chunk.js:310165:5)\n';

async function run(
  adapter: FakeAgyAdapter,
  stdoutText: string,
  stderrText: string,
  exitCode: number
): ReturnType<FakeAgyAdapter['executeTask']> {
  const { mockChild, stdout, stderr } = createMockChildProcess();
  mockSpawn.mockReturnValue(mockChild);
  const promise = adapter.executeTask({ content: 'vote' }, OPTIONS);
  setImmediate(() => {
    if (stdoutText !== '') stdout.emit('data', Buffer.from(stdoutText));
    if (stderrText !== '') stderr.emit('data', Buffer.from(stderrText));
    mockChild.emit('close', exitCode);
  });
  return promise;
}

describe('empty response + auth stderr is a terminal adapter error (#6269)', () => {
  let adapter: FakeAgyAdapter;

  beforeEach(() => {
    adapter = new FakeAgyAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exit 0, SUCCESS envelope with response "" and an auth line on stderr → NOT_AUTHENTICATED', async () => {
    const result = await run(adapter, EMPTY_SUCCESS_ENVELOPE, AUTH_STDERR, 0);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
    // The message names the CLI and the FIRST stderr line, not the stack.
    expect(result.error.message).toContain('gemini');
    expect(result.error.message).toContain('Error authenticating: IneligibleTierError');
    expect(result.error.message).not.toContain('throwIneligibleOrProjectIdError');
  });

  it('the error is not retried at the adapter layer — NOT_AUTHENTICATED is outside RETRYABLE_ERROR_CODES', async () => {
    await run(adapter, EMPTY_SUCCESS_ENVELOPE, AUTH_STDERR, 0);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('the named empty case: response "" with EMPTY stderr stays a success carrying "" — the parse-failure route downstream', async () => {
    // No stderr means no evidence of an auth failure; the classifier must not
    // manufacture one. The empty answer reaches the vote parser as before.
    const result = await run(adapter, EMPTY_SUCCESS_ENVELOPE, '', 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('');
    expect(result.value.stderr).toBeUndefined();
  });

  it('response "" with NON-auth stderr is unchanged too: success carrying "" plus the stderr', async () => {
    const result = await run(adapter, EMPTY_SUCCESS_ENVELOPE, 'warning: slow disk\n', 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('');
    expect(result.value.stderr).toBe('warning: slow disk\n');
  });

  it('a healthy seat is untouched: a real answer with a stray auth-looking stderr line still succeeds', async () => {
    // Only an EMPTY answer is reclassified. An agentic run can log an auth
    // hiccup from a tool call and still deliver the vote.
    const answered = JSON.stringify({ status: 'SUCCESS', response: '{"decision":"approve"}' });
    const result = await run(adapter, answered, AUTH_STDERR, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('{"decision":"approve"}');
  });

  it('empty stdout with the auth line on stderr (the literal issue shape) is NOT_AUTHENTICATED whatever the exit code', async () => {
    // Already an error before #6269 (EXECUTION_ERROR); it now carries the
    // specific code so the circuit breaker counts it as an auth failure.
    for (const code of [0, 55]) {
      const result = await run(adapter, '', AUTH_STDERR, code);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_AUTHENTICATED');
    }
  });
});
