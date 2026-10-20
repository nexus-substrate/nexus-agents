/** Offline physical spawn-boundary regression tests; no process signals reach the OS. */
import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/index.js';
import { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import {
  NATIVE_EXECUTION_POLICY,
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
  SIGKILL_GRACE_MS: 5_000,
  trackProcessTree: (child: ChildProcessWithoutNullStreams) => child,
  terminateProcessTree: vi.fn().mockResolvedValue([]),
}));

const mockSpawn = vi.mocked(spawn);

function offlineChild(
  output = 'offline response',
  code = 0,
  stderr = ''
): ChildProcessWithoutNullStreams {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
    exitCode: null,
    signalCode: null,
    pid: undefined,
  }) as unknown as ChildProcessWithoutNullStreams;
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from(output));
    if (stderr !== '') child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  });
  return child;
}

class OfflineSubprocess extends SubprocessCliAdapter {
  readonly name = 'claude';
  protected override readonly transientRetry = { enabled: false };
  readonly command = vi.fn<(task: CliTask) => CommandConfig>();
  protected readonly parser: ICliResponseParser = {
    name: 'offline-parser',
    supportedVersionRange: '*',
    parse: (raw) => raw,
    extractResponse: (raw) => raw,
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(task: CliTask): CommandConfig {
    return this.command(task);
  }
  getModelInfo(): ModelInfo {
    return { id: 'offline-model', name: 'Offline', contextWindow: 1_000 };
  }
}

class TransientRetrySubprocess extends OfflineSubprocess {
  protected override readonly transientRetry = { enabled: true };
  protected override delay(): Promise<void> {
    return Promise.resolve();
  }
}

const options: ResolvedExecutionOptions = {
  timeoutMs: 1_000,
  allowRetry: false,
  maxRetries: 0,
  trackUsage: false,
  onProgress: undefined,
};

describe('canonical native completion spawn boundary (#7533)', () => {
  let clock: FixedTimeProvider;
  beforeEach(() => {
    clock = new FixedTimeProvider(1_000);
    setTimeProvider(clock);
    getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude').reset();
    mockSpawn.mockReset().mockImplementation(() => offlineChild());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetTimeProvider();
  });

  function policy(signal?: AbortSignal): NativeExecutionPolicy {
    const issued = issueNativeExecutionPolicy({
      deadlineAt: 11_000,
      ...(signal === undefined ? {} : { signal }),
    });
    if (!issued.ok) throw new Error('Expected host policy');
    return issued.value;
  }

  function nativeOptions(capability: NativeExecutionPolicy): ResolvedExecutionOptions {
    const result = nativeExecutionOptions(capability);
    if (!result.ok) throw new Error('Expected host execution options');
    return { ...options, ...result.value };
  }

  function configured(): { adapter: OfflineSubprocess; cleanup: Mock<() => void> } {
    const adapter = new OfflineSubprocess();
    const cleanup = vi.fn<() => void>();
    adapter.command.mockReturnValue({ command: 'offline-command', args: [], cleanup });
    return { adapter, cleanup };
  }

  it('refuses cancellation during wrapper materialization before the physical spawn', async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    const adapter = new OfflineSubprocess();
    adapter.command.mockReturnValue({ command: 'offline-command', args: [], cleanup });
    const result = await adapter.executeTask(
      {
        content: 'offline request',
        wrapper: (command, args, childOptions) => {
          controller.abort('cancelled during materialization');
          return { command, args, options: childOptions };
        },
      },
      { ...options, signal: controller.signal }
    );

    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(result.ok).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('consumes one physical attempt across actual BaseCliAdapter default-option spreads', async () => {
    const { adapter, cleanup } = configured();
    const opts = nativeOptions(policy());
    const first = await adapter.execute({ content: 'offline request' }, opts);
    const second = await adapter.execute({ content: 'offline request' }, opts);

    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.cause).toMatchObject({ reason: 'permit-consumed' });
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('counts a synchronous failed spawn as the only allowed attempt', async () => {
    const { adapter, cleanup } = configured();
    const opts = nativeOptions(policy());
    mockSpawn.mockImplementationOnce(() => {
      throw new Error('offline spawn failure');
    });
    const first = await adapter.executeTask({ content: 'offline request' }, opts);
    const second = await adapter.executeTask({ content: 'offline request' }, opts);

    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.cause).toMatchObject({ reason: 'permit-consumed' });
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('refuses a forged symbol policy before any command materialization', async () => {
    const { adapter, cleanup } = configured();
    const result = await adapter.executeTask(
      { content: 'offline request' },
      {
        ...options,
        [NATIVE_EXECUTION_POLICY]: {} as NativeExecutionPolicy,
      }
    );
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(result.ok).toBe(false);
    expect(adapter.command).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('rejects expiry after command materialization and cleans the materialized command once', async () => {
    const { adapter, cleanup } = configured();
    const healthFailure = vi.spyOn(
      getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude'),
      'recordFailure'
    );
    const opts = nativeOptions(policy());
    adapter.command.mockImplementation(() => {
      clock.advance(10_000);
      return { command: 'offline-command', args: [], cleanup };
    });
    const result = await adapter.execute({ content: 'offline request' }, opts);
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.cause).toMatchObject({ reason: 'expired-before-spawn' });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(healthFailure).not.toHaveBeenCalled();
  });

  it('rejects expiry caused by the wrapper itself at the final spawn boundary', async () => {
    const { adapter, cleanup } = configured();
    const opts = nativeOptions(policy());
    const result = await adapter.executeTask(
      {
        content: 'offline request',
        wrapper: (command, args, childOptions) => {
          clock.advance(10_000);
          return { command, args, options: childOptions };
        },
      },
      opts
    );
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(result.ok).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('preserves ordinary defaults with no host policy', async () => {
    const { adapter } = configured();
    expect((await adapter.executeTask({ content: 'ordinary request' }, options)).ok).toBe(true);
    expect((await adapter.executeTask({ content: 'ordinary request' }, options)).ok).toBe(true);
    expect(mockSpawn.mock.calls.length).toBe(2);
  });

  it('refuses an already-cancelled operation before creating command resources', async () => {
    const { adapter, cleanup } = configured();
    const controller = new AbortController();
    const opts = nativeOptions(policy(controller.signal));
    controller.abort('operator cancelled');
    const result = await adapter.executeTask({ content: 'offline request' }, opts);
    expect(result.ok).toBe(false);
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(adapter.command).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans a throwing wrapper once without spending a physical attempt', async () => {
    const { adapter, cleanup } = configured();
    const opts = nativeOptions(policy());
    const result = await adapter.executeTask(
      {
        content: 'offline request',
        wrapper: () => {
          throw new Error('offline materialization failure');
        },
      },
      opts
    );
    expect(result.ok).toBe(false);
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect((await adapter.executeTask({ content: 'offline request' }, opts)).ok).toBe(true);
    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('blocks a physical second spawn even when the base retry layer is deliberately enabled', async () => {
    vi.useFakeTimers();
    const { adapter, cleanup } = configured();
    mockSpawn.mockImplementationOnce(() => offlineChild('', 1, 'connection refused'));
    const pending = adapter.execute(
      { content: 'offline request' },
      {
        ...nativeOptions(policy()),
        allowRetry: true,
        maxRetries: 1,
      }
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(adapter.command).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.cause).toMatchObject({ reason: 'permit-consumed' });
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('blocks a physical second spawn through the actual transient retry layer', async () => {
    const adapter = new TransientRetrySubprocess();
    const cleanup = vi.fn();
    adapter.command.mockReturnValue({ command: 'offline-command', args: [], cleanup });
    mockSpawn.mockImplementationOnce(() => offlineChild('', 1, 'connection refused'));
    const result = await adapter.executeTask(
      { content: 'offline request' },
      {
        ...nativeOptions(policy()),
        allowRetry: true,
      }
    );

    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(adapter.command).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.cause).toMatchObject({ reason: 'permit-consumed' });
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('blocks the actual Claude in-family fallback even when its task suppression flag is absent', async () => {
    const adapter = new ClaudeCliAdapter();
    const attempts = vi.spyOn(SubprocessCliAdapter.prototype, 'executeTask');
    mockSpawn.mockImplementationOnce(() =>
      offlineChild(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: "You're out of usage credits",
          stop_reason: 'stop_sequence',
        }),
        1
      )
    );
    const result = await adapter.executeTask(
      { content: 'offline request', model: 'fable' },
      nativeOptions(policy())
    );

    expect(attempts).toHaveBeenCalledTimes(2);
    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.cause).toMatchObject({ reason: 'permit-consumed' });
  });

  it('reuses bridge conversion and preserves workDir while forwarding host retry suppression', async () => {
    const { adapter } = configured();
    const execute = vi.spyOn(adapter, 'execute');
    const cap = policy();
    const result = await new CliToModelAdapter(adapter).completeWithNativePolicy(
      {
        messages: [{ role: 'user', content: 'offline request' }],
        workDir: '/tmp/offline-fixture',
      },
      cap
    );
    expect(result.ok).toBe(true);
    const [task, opts] = execute.mock.calls[0] ?? [];
    expect(task?.options).toEqual({ workDir: '/tmp/offline-fixture', inFamilyFallback: false });
    expect(opts?.allowRetry).toBe(false);
    expect(opts?.maxRetries).toBe(0);
    expect(opts?.[NATIVE_EXECUTION_POLICY]).toBe(cap);
    expect(mockSpawn.mock.calls.length).toBe(1);
  });

  it.each([undefined, {}, { deadlineAt: 11_000 }])(
    'refuses absent/JSON policy at the host bridge: %j',
    async (cap) => {
      const { adapter } = configured();
      const result = await new CliToModelAdapter(adapter).completeWithNativePolicy(
        {
          messages: [{ role: 'user', content: 'offline request' }],
        },
        cap
      );
      expect(result.ok).toBe(false);
      expect(mockSpawn.mock.calls.length).toBe(0);
    }
  );
});
