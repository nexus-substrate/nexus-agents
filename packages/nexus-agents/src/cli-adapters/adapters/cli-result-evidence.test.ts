/** Replay evidence through execute(), mocking only the process boundary and host probe. */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeCliAdapter } from './claude-adapter.js';
import { CodexCliAdapter } from './codex-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-circuit-breaker.js';

const processResult = vi.hoisted(() => ({ stdout: '', exitCode: 0 }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
      kill: vi.fn(),
      exitCode: null as number | null,
      signalCode: null,
    });
    setImmediate(() => {
      child.stdout.push(processResult.stdout);
      child.stdout.push(null);
      child.stderr.push(null);
      child.exitCode = processResult.exitCode;
      child.emit('close', processResult.exitCode);
    });
    return child;
  }),
}));
import { spawn } from 'node:child_process';

const fixture = (name: string): string =>
  readFileSync(new URL(`../parsers/fixtures/${name}`, import.meta.url), 'utf8');
const OPTIONS = { allowRetry: true, timeoutMs: 5_000 } as const;

let adapter: ClaudeCliAdapter | CodexCliAdapter | undefined;
beforeEach(() => {
  vi.mocked(spawn).mockClear();
  getDefaultCliCircuitBreakerRegistry().getBreaker('claude').reset();
  getDefaultCliCircuitBreakerRegistry().getBreaker('codex').reset();
});
afterEach(async () => {
  await adapter?.dispose();
});

function codex(stdout: string, exitCode: number): CodexCliAdapter {
  processResult.stdout = stdout;
  processResult.exitCode = exitCode;
  adapter = new CodexCliAdapter({ sandboxProbe: () => ({ status: 'ok', sandboxArgs: [] }) });
  return adapter;
}

function claude(stdout: string, exitCode: number): ClaudeCliAdapter {
  processResult.stdout = stdout;
  processResult.exitCode = exitCode;
  adapter = new ClaudeCliAdapter();
  return adapter;
}

describe('Codex evidence through execute() (#7073)', () => {
  it('returns the live captured success through execute without retry', async () => {
    const result = await codex(fixture('codex-live-success.jsonl'), 0).execute(
      { content: 'Reply with the single word ok' },
      OPTIONS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected captured completion');
    expect(result.value.text).toBe('ok');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('reports the live terminal failure message as EXECUTION_ERROR without retry', async () => {
    const raw = fixture('codex-live-failure.jsonl');
    const result = await codex(raw, 1).execute(
      { content: 'Reply with the single word ok' },
      OPTIONS
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected captured failure');
    expect(result.error.code).toBe('EXECUTION_ERROR');
    expect(result.error.message).toContain(
      'model is not supported when using Codex with a ChatGPT account'
    );
    expect(result.error.message).not.toContain('Failed to parse response');
    expect(result.error.retryable).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('reports a terminal error event without retry (derived, unverified live)', async () => {
    processResult.stdout = JSON.stringify({
      type: 'error',
      message: 'The selected model is unsupported.',
    });
    const result = await codex(processResult.stdout, 1).execute({ content: 'reply ok' }, OPTIONS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected terminal error');
    expect(result.error.code).toBe('EXECUTION_ERROR');
    expect(result.error.message).toBe('The selected model is unsupported.');
    expect(result.error.retryable).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('Claude inherited evidence through execute() (#7073)', () => {
  it('returns the inherited, unverified success envelope without retry', async () => {
    const result = await claude(fixture('claude-existing-live-success.json'), 0).execute(
      { content: 'reply done' },
      OPTIONS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected inherited success');
    expect(result.value.text).toBe('done');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('classifies the inherited, unverified credits envelope and attempts one family fallback', async () => {
    const result = await claude(fixture('claude-existing-measured-error.json'), 1).execute(
      { content: 'reply done' },
      OPTIONS
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected inherited failure');
    expect(result.error.code).toBe('RATE_LIMITED');
    expect(result.error.message).toContain("You're out of usage credits.");
    expect(result.error.retryable).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
