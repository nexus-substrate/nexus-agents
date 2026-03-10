/**
 * Tests for SubprocessCliAdapter transient-error retry and buffer capping.
 *
 * Verifies:
 * - Transient errors (TIMEOUT, RATE_LIMITED, CONNECTION_ERROR) are retried
 * - Non-transient errors are NOT retried
 * - Max 2 retries with 500ms/1000ms backoff
 * - Buffer truncation at 10 MB
 * - isTransientError() classification
 *
 * (Source: Issue #1456 — Transient-error retry for OpenCode adapter)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';

import type { CliName, CliTask, ExecutionOptions, ICliResponseParser } from './types.js';
import type { CommandConfig, TransientRetryConfig } from './subprocess-adapter.js';
import { SubprocessCliAdapter, isTransientError } from './subprocess-adapter.js';

// Mock node:child_process
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
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
  }) as unknown as ChildProcess;

  return { mockChild, stdin, stdout, stderr };
}

/** Test adapter with retry explicitly disabled. */
class NoRetryAdapter extends SubprocessCliAdapter {
  override readonly name: CliName = 'claude';
  protected override readonly transientRetry: TransientRetryConfig = { enabled: false };
  protected readonly parser: ICliResponseParser = {
    name: 'test-parser',
    supportedVersionRange: '>=1.0.0',
    parse: (raw: string) => raw,
    extractResponse: (output: string) => output.trim() || null,
    extractUsage: () => null,
    extractSessionId: () => null,
  };

  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'echo', args: [] };
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'test-model',
      name: 'Test',
      contextWindow: 100_000,
      maxOutput: 10_000,
      costPerMillionInput: 1,
      costPerMillionOutput: 2,
    };
  }
}

/** Test adapter using the default retry behavior (enabled). */
class RetryAdapter extends SubprocessCliAdapter {
  override readonly name: CliName = 'opencode';
  protected readonly parser: ICliResponseParser = {
    name: 'test-parser',
    supportedVersionRange: '>=1.0.0',
    parse: (raw: string) => raw,
    extractResponse: (output: string) => output.trim() || null,
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'echo', args: [] };
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'test-model',
      name: 'Test',
      contextWindow: 100_000,
      maxOutput: 10_000,
      costPerMillionInput: 1,
      costPerMillionOutput: 2,
    };
  }
}

/** Test adapter with a parser that only accepts JSON — rejects plaintext. */
class StrictJsonAdapter extends SubprocessCliAdapter {
  override readonly name: CliName = 'claude';
  protected override readonly transientRetry: TransientRetryConfig = { enabled: false };
  protected readonly parser: ICliResponseParser = {
    name: 'strict-json-parser',
    supportedVersionRange: '>=1.0.0',
    parse: (raw: string) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    extractResponse: (output: string) => {
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        return typeof parsed['result'] === 'string' ? parsed['result'] : null;
      } catch {
        return null;
      }
    },
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'echo', args: [] };
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'test-model',
      name: 'Test',
      contextWindow: 100_000,
      maxOutput: 10_000,
      costPerMillionInput: 1,
      costPerMillionOutput: 2,
    };
  }
}

const DEFAULT_OPTS: Required<ExecutionOptions> = {
  timeoutMs: 5000,
  allowRetry: true,
  maxRetries: 1,
  trackUsage: true,
  onProgress: undefined,
};

describe('isTransientError()', () => {
  it('should return true for TIMEOUT', () => {
    expect(isTransientError('TIMEOUT')).toBe(true);
  });

  it('should return true for RATE_LIMITED', () => {
    expect(isTransientError('RATE_LIMITED')).toBe(true);
  });

  it('should return true for CONNECTION_ERROR', () => {
    expect(isTransientError('CONNECTION_ERROR')).toBe(true);
  });

  it('should return false for EXECUTION_ERROR', () => {
    expect(isTransientError('EXECUTION_ERROR')).toBe(false);
  });

  it('should return false for PARSE_ERROR', () => {
    expect(isTransientError('PARSE_ERROR')).toBe(false);
  });

  it('should return false for NOT_FOUND', () => {
    expect(isTransientError('NOT_FOUND')).toBe(false);
  });

  it('should return false for NOT_AUTHENTICATED', () => {
    expect(isTransientError('NOT_AUTHENTICATED')).toBe(false);
  });

  it('should return false for UNKNOWN', () => {
    expect(isTransientError('UNKNOWN')).toBe(false);
  });
});

describe('SubprocessCliAdapter transient retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not retry when transientRetry is disabled', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // Simulate timeout
    vi.advanceTimersByTime(5001);
    mockChild.emit('close', null);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
    // Only spawned once — no retry
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('should retry transient TIMEOUT error up to 2 times', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    // Set up 3 child processes: 2 timeouts + 1 success
    const child0 = createMockChildProcess();
    const child1 = createMockChildProcess();
    const child2 = createMockChildProcess();
    const childList = [child0, child1, child2];

    let spawnIdx = 0;
    mockSpawn.mockImplementation(function () {
      const child = childList[spawnIdx++];
      if (child === undefined) throw new Error('Too many spawn calls');
      return child.mockChild;
    });

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // First attempt: timeout at 5s
    vi.advanceTimersByTime(5001);
    child0.mockChild.emit('close', null);

    // Wait for 500ms delay
    await vi.advanceTimersByTimeAsync(500);

    // Second attempt: timeout extended to 7.5s (5s * 1.5)
    vi.advanceTimersByTime(7501);
    child1.mockChild.emit('close', null);

    // Wait for 1000ms delay
    await vi.advanceTimersByTimeAsync(1000);

    // Third attempt: success (within ~11.25s extended timeout)
    child2.stdout.emit('data', Buffer.from('success\n'));
    child2.mockChild.emit('close', 0);

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('success');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it('should stop retrying after max 2 retries', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    const c0 = createMockChildProcess();
    const c1 = createMockChildProcess();
    const c2 = createMockChildProcess();
    const cList = [c0, c1, c2];

    let spawnIdx = 0;
    mockSpawn.mockImplementation(function () {
      const child = cList[spawnIdx++];
      if (child === undefined) throw new Error('Too many spawn calls');
      return child.mockChild;
    });

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // First attempt: timeout at 5s
    vi.advanceTimersByTime(5001);
    c0.mockChild.emit('close', null);
    await vi.advanceTimersByTimeAsync(500);

    // Second attempt: timeout extended to 7.5s (5s * 1.5)
    vi.advanceTimersByTime(7501);
    c1.mockChild.emit('close', null);
    await vi.advanceTimersByTimeAsync(1000);

    // Third attempt: timeout extended to ~11.25s (7.5s * 1.5)
    vi.advanceTimersByTime(11251);
    c2.mockChild.emit('close', null);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
    // 1 initial + 2 retries = 3 total
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry non-transient EXECUTION_ERROR', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // Emit stderr + close synchronously (no setImmediate needed with fake timers)
    stderr.emit('data', Buffer.from('command failed\n'));
    mockChild.emit('close', 1);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry NOT_FOUND error', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    const error = new Error('spawn opencode ENOENT');
    mockChild.emit('error', error);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('should stop retrying if second attempt returns non-transient error', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    const ch1 = createMockChildProcess();
    const ch2 = createMockChildProcess();
    const mocks = [ch1.mockChild, ch2.mockChild];

    let spawnIdx = 0;
    mockSpawn.mockImplementation(function () {
      const m = mocks[spawnIdx++];
      if (m === undefined) throw new Error('Too many spawn calls');
      return m;
    });

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // First: timeout (transient)
    vi.advanceTimersByTime(5001);
    ch1.mockChild.emit('close', null);
    await vi.advanceTimersByTimeAsync(500);

    // Second: execution error (not transient) — should stop
    ch2.stderr.emit('data', Buffer.from('crash\n'));
    ch2.mockChild.emit('close', 1);

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('should extend timeout by 1.5x when retrying a TIMEOUT error', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };
    const opts: Required<ExecutionOptions> = { ...DEFAULT_OPTS, timeoutMs: 10000 };

    const c0 = createMockChildProcess();
    const c1 = createMockChildProcess();
    const cList = [c0.mockChild, c1.mockChild];

    let spawnIdx = 0;
    mockSpawn.mockImplementation(function () {
      const m = cList[spawnIdx++];
      if (m === undefined) throw new Error('Too many spawn calls');
      return m;
    });

    const promise = adapter.executeTask(task, opts);

    // First: timeout at 10s
    vi.advanceTimersByTime(10001);
    c0.mockChild.emit('close', null);
    await vi.advanceTimersByTimeAsync(500);

    // Second: should have 15s timeout (10s * 1.5x)
    // It should NOT timeout at 10s
    vi.advanceTimersByTime(10001);
    // At 10s, the process should still be running (extended timeout)
    // Emit success at 14s (within 15s extended timeout)
    vi.advanceTimersByTime(4000);
    c1.stdout.emit('data', Buffer.from('success after longer wait\n'));
    c1.mockChild.emit('close', 0);

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('success after longer wait');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('should succeed on first retry after initial transient failure', async () => {
    const adapter = new RetryAdapter();
    const task: CliTask = { content: 'test' };

    const r1 = createMockChildProcess();
    const r2 = createMockChildProcess();
    const rMocks = [r1.mockChild, r2.mockChild];

    let spawnIdx = 0;
    mockSpawn.mockImplementation(function () {
      const m = rMocks[spawnIdx++];
      if (m === undefined) throw new Error('Too many spawn calls');
      return m;
    });

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    // First: timeout
    vi.advanceTimersByTime(5001);
    r1.mockChild.emit('close', null);
    await vi.advanceTimersByTimeAsync(500);

    // Second: success
    r2.stdout.emit('data', Buffer.from('ok\n'));
    r2.mockChild.emit('close', 0);

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('ok');
    }
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});

describe('SubprocessCliAdapter buffer capping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cap stdout at 10 MB', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stdout } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    setImmediate(() => {
      // Send 11 MB of data in 1 MB chunks
      const oneMb = Buffer.alloc(1024 * 1024, 'x');
      for (let i = 0; i < 11; i++) {
        stdout.emit('data', oneMb);
      }
      mockChild.emit('close', 0);
    });

    const result = await promise;
    // The parser sees the buffered stdout — response text should exist
    // but be capped. The exact trim depends on parser, but data beyond
    // 10 MB should not accumulate.
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 10 MB of 'x' chars = 10 * 1024 * 1024 characters
      expect(result.value.text.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    }
  });

  it('should cap stderr at 10 MB', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    setImmediate(() => {
      // Send 11 MB of stderr in 1 MB chunks
      const oneMb = Buffer.alloc(1024 * 1024, 'e');
      for (let i = 0; i < 11; i++) {
        stderr.emit('data', oneMb);
      }
      // No stdout — this triggers EXECUTION_ERROR with stderr content
      mockChild.emit('close', 0);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // stderr should be capped
      expect(result.error.message.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    }
  });

  it('should not truncate output under 10 MB', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stdout } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);

    setImmediate(() => {
      stdout.emit('data', Buffer.from('small output\n'));
      mockChild.emit('close', 0);
    });

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('small output');
    }
  });
});

describe('SubprocessCliAdapter plaintext fallback', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('should recover plaintext response when JSON parser fails', async () => {
    const adapter = new StrictJsonAdapter();
    const task: CliTask = { content: 'test' };
    const longText = 'This is a detailed analysis of the codebase. '.repeat(5);

    const { mockChild, stdout } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stdout.emit('data', Buffer.from(longText));
      mockChild.emit('close', 0);
    });

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe(longText.trim());
    }
  });

  it('should NOT use plaintext fallback for short output', async () => {
    const adapter = new StrictJsonAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stdout } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stdout.emit('data', Buffer.from('short'));
      mockChild.emit('close', 0);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });

  it('should NOT use plaintext fallback for JSON-like output', async () => {
    const adapter = new StrictJsonAdapter();
    const task: CliTask = { content: 'test' };
    const jsonish = '{"malformed": "json", "missing_result": true}';

    const { mockChild, stdout } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stdout.emit('data', Buffer.from(jsonish));
      mockChild.emit('close', 0);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });
});

describe('SubprocessCliAdapter stderr error classification', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('should classify connection refused in stderr as CONNECTION_ERROR', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stderr.emit('data', Buffer.from('Error: connection refused to api.example.com'));
      mockChild.emit('close', 1);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONNECTION_ERROR');
    }
  });

  it('should classify rate limit in stderr as RATE_LIMITED', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stderr.emit('data', Buffer.from('Error: rate limit exceeded, retry after 30s'));
      mockChild.emit('close', 1);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
    }
  });

  it('should classify timeout in stderr as TIMEOUT', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stderr.emit('data', Buffer.from('Error: request timed out after 120s'));
      mockChild.emit('close', 1);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('should classify generic errors as EXECUTION_ERROR', async () => {
    const adapter = new NoRetryAdapter();
    const task: CliTask = { content: 'test' };

    const { mockChild, stderr } = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChild);

    const promise = adapter.executeTask(task, DEFAULT_OPTS);
    setImmediate(() => {
      stderr.emit('data', Buffer.from('fatal: unhandled exception in module X'));
      mockChild.emit('close', 1);
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
    }
  });
});
