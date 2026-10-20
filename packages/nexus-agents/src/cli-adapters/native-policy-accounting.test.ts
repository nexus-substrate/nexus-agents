/** Host-issued retry policy preserves canonical health outcomes; fake children only. */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import { isNativePreSpawnRefusal } from './cli-error-helpers.js';
import {
  issueNativeExecutionPolicy,
  nativeExecutionOptions,
  type NativeExecutionPolicy,
} from './native-execution-policy.js';
import type { CliTask, ICliResponseParser, ModelInfo, ResolvedExecutionOptions } from './types.js';
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
vi.mock('./process-tree-kill.js', () => ({
  SIGKILL_GRACE_MS: 5000,
  trackProcessTree: (child: ChildProcessWithoutNullStreams) => child,
  terminateProcessTree: vi.fn().mockResolvedValue([]),
}));
const mockSpawn = vi.mocked(spawn);
function child(
  output = '',
  stderr = 'connection refused',
  code = 1
): ChildProcessWithoutNullStreams {
  const c = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
    exitCode: null,
    signalCode: null,
    pid: undefined,
  }) as unknown as ChildProcessWithoutNullStreams;
  queueMicrotask(() => {
    if (output) c.stdout.emit('data', Buffer.from(output));
    if (stderr) c.stderr.emit('data', Buffer.from(stderr));
    c.emit('close', code);
  });
  return c;
}
class OfflineSubprocess extends SubprocessCliAdapter {
  readonly name = 'claude';
  protected override readonly transientRetry = { enabled: true };
  protected readonly parser: ICliResponseParser = {
    name: 'offline',
    supportedVersionRange: '*',
    parse: (raw) => raw,
    extractResponse: (raw) => raw,
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'offline-command', args: [] };
  }
  protected override delay(): Promise<void> {
    return Promise.resolve();
  }
  getModelInfo(): ModelInfo {
    return { id: 'offline-model', name: 'Offline', contextWindow: 1000 };
  }
}
class OuterRetrySubprocess extends OfflineSubprocess {
  protected override readonly transientRetry = { enabled: false };
}
const breaker = getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude');
function native(): { policy: NativeExecutionPolicy; opts: ResolvedExecutionOptions } {
  const issued = issueNativeExecutionPolicy({ deadlineAt: 11000 });
  if (!issued.ok) throw Error('issue failed');
  const opts = nativeExecutionOptions(issued.value);
  if (!opts.ok) throw Error('options failed');
  return {
    policy: issued.value,
    opts: {
      timeoutMs: 1000,
      allowRetry: false,
      maxRetries: 0,
      trackUsage: false,
      onProgress: undefined,
      ...opts.value,
    },
  };
}
const capacity = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: true,
  result: "You're out of usage credits",
  stop_reason: 'stop_sequence',
});
beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(1000));
  breaker.reset();
  mockSpawn.mockReset().mockImplementation(() => child());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetTimeProvider();
  breaker.reset();
});
describe('policy outcome conservation via actual Base/subprocess/Claude paths', () => {
  it('forced inner retry must retain the launched connection failure for health', async () => {
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new OfflineSubprocess().execute(
      { content: 'offline' },
      { ...native().opts, allowRetry: true, maxRetries: 1 }
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
    if (!result.ok) expect(result.error.code).toBe('CONNECTION_ERROR');
  });
  it('control host no-retry preserves actual connection failure and one outcome', async () => {
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new OfflineSubprocess().execute({ content: 'offline' }, native().opts);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONNECTION_ERROR');
      expect(isNativePreSpawnRefusal(result.error)).toBe(false);
    }
    expect(failure).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
  });
  it('suppresses forced outer retry and preserves the first recorded failure', async () => {
    vi.useFakeTimers();
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const pending = new OuterRetrySubprocess().execute(
      { content: 'offline' },
      { ...native().opts, allowRetry: true, maxRetries: 1 }
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONNECTION_ERROR');
    expect(failure).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
  });
  it('Claude fallback under policy must retain first actual capacity failure for health', async () => {
    mockSpawn.mockImplementation(() => child(capacity, ''));
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new ClaudeCliAdapter().execute(
      { content: 'offline', model: 'fable' },
      native().opts
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
  });
  it('control explicit Claude fallback suppression keeps RATE_LIMITED and one outcome', async () => {
    mockSpawn.mockImplementation(() => child(capacity, ''));
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new ClaudeCliAdapter().execute(
      { content: 'offline', model: 'fable', options: { inFamilyFallback: false } },
      native().opts
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
    expect(failure).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
  });
  it('control actual named native bridge independently supplies BOTH suppressions', async () => {
    mockSpawn.mockImplementation(() => child(capacity, ''));
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const adapter = new ClaudeCliAdapter({ model: 'fable' }),
      execute = vi.spyOn(adapter, 'execute');
    const result = await new CliToModelAdapter(adapter).completeWithNativePolicy(
      { messages: [{ role: 'user', content: 'offline' }] },
      native().policy
    );
    const [task, opts] = execute.mock.calls[0] ?? [];
    expect(opts?.allowRetry).toBe(false);
    expect(opts?.maxRetries).toBe(0);
    expect(task?.options?.['inFamilyFallback']).toBe(false);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
  });
  it('ordinary no-policy inner retry still succeeds with two physical children', async () => {
    mockSpawn
      .mockImplementationOnce(() => child())
      .mockImplementation(() => child('offline response', '', 0));
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new OfflineSubprocess().execute(
      { content: 'offline' },
      { timeoutMs: 1000, allowRetry: true, maxRetries: 1, trackUsage: false }
    );
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(failure).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledTimes(1);
  });
  it('ordinary no-policy Claude fallback still succeeds with its second alias', async () => {
    const ok = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'offline response',
      session_id: 'offline-session',
    });
    mockSpawn
      .mockImplementationOnce(() => child(capacity, ''))
      .mockImplementation(() => child(ok, '', 0));
    const failure = vi.spyOn(breaker, 'recordFailure'),
      success = vi.spyOn(breaker, 'recordSuccess');
    const result = await new ClaudeCliAdapter().execute(
      { content: 'offline', model: 'fable' },
      { timeoutMs: 1000, allowRetry: false, maxRetries: 0, trackUsage: false }
    );
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fallbackFrom).toBe('fable');
      expect(result.value.model).toBe('opus');
    }
    expect(failure).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledTimes(1);
  });
  it('direct Claude execution suppresses default alias fallback under host policy', async () => {
    mockSpawn.mockImplementation(() => child(capacity, ''));
    const attempts = vi.spyOn(SubprocessCliAdapter.prototype, 'executeTask');
    const result = await new ClaudeCliAdapter().executeTask(
      { content: 'offline', model: 'fable' },
      native().opts
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(attempts).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
  });
  it('Gemini inherits the host-policy restriction when its inner retries are disabled', () => {
    class GeminiRetryProbe extends GeminiCliAdapter {
      protected override readonly transientRetry = { enabled: false };
      outerRetryAllowed(opts: ResolvedExecutionOptions): boolean {
        return this.shouldOuterRetry(opts);
      }
    }
    const adapter = new GeminiRetryProbe();
    const issued = native().opts;
    const ordinary: ResolvedExecutionOptions = {
      timeoutMs: 1000,
      allowRetry: true,
      maxRetries: 1,
      trackUsage: false,
      onProgress: undefined,
    };
    expect(adapter.outerRetryAllowed(ordinary)).toBe(true);
    expect(adapter.outerRetryAllowed({ ...issued, allowRetry: true, maxRetries: 1 })).toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
