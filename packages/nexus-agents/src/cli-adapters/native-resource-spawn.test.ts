/** Real policy→Base→subprocess boundary; child and signal operations are offline doubles. */
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandConfig } from './subprocess-adapter.js';
import type { ModelInfo, ExecutionOptions } from './types.js';
import type { NativeExecutionPolicy } from './native-execution-policy.js';
import { SubprocessCliAdapter } from './subprocess-adapter.js';
import { NativeResourceObserver } from './native-resource-observer.js';
import {
  issueNativeExecutionPolicy,
  nativeExecutionOptions,
  nativeResourcesForPolicy,
} from './native-execution-policy.js';
import { terminateProcessTree } from './process-tree-kill.js';
import { isCallerAbortError } from './cli-error-helpers.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
vi.mock('./process-tree-kill.js', async (original) => ({
  ...(await original<typeof import('./process-tree-kill.js')>()),
  trackProcessTree: (child: unknown) => child,
  terminateProcessTree: vi.fn().mockResolvedValue([]),
}));
class OfflineAdapter extends SubprocessCliAdapter {
  readonly name = 'claude';
  protected override readonly transientRetry = { enabled: false };
  readonly cleanup = vi.fn();
  protected readonly parser = {
    name: 'offline',
    supportedVersionRange: '*',
    parse: (raw: string) => raw,
    extractResponse: (raw: string) => raw,
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(): CommandConfig {
    return { command: 'offline', args: [], cleanup: this.cleanup };
  }
  getModelInfo(): ModelInfo {
    return { id: 'fixture', name: 'Fixture', contextWindow: 1000 };
  }
}
type OfflineChild = EventEmitter & {
  pid: number | undefined;
  exitCode: number | null;
  signalCode: null;
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
function child(): OfflineChild {
  return Object.assign(new EventEmitter(), {
    pid: 11,
    exitCode: null as number | null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
}
function resources(): NativeResourceObserver {
  return new NativeResourceObserver({
    acquisition: 'none',
    processes: {
      platform: 'linux',
      readIdentity: () => ({ state: 'present', startTime: '100', processState: 'S' }),
      enumerate: () => ({ coverage: 'complete', pids: [] }),
    },
  });
}
function policy(
  observer?: NativeResourceObserver,
  signal?: AbortSignal
): { capability: NativeExecutionPolicy; options: ExecutionOptions } {
  const issued = issueNativeExecutionPolicy({
    deadlineAt: Date.now() + 10_000,
    ...(observer === undefined ? {} : { resources: observer }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!issued.ok) throw new Error('Expected valid host policy');
  const opts = nativeExecutionOptions(issued.value);
  if (!opts.ok) throw new Error('Expected native options');
  return { capability: issued.value, options: opts.value };
}
beforeEach(() => {
  vi.mocked(spawn).mockReset();
  getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude').reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe('canonical resource registration (#7534)', () => {
  it('registers before physical spawn and observes before business result listeners', async () => {
    const observer = resources();
    const host = policy(observer);
    const native = child();
    const events: string[] = [];
    native.on('newListener', (event) => {
      if (['exit', 'close', 'error'].includes(String(event))) events.push(String(event));
    });
    vi.mocked(spawn).mockImplementation(() => {
      expect(observer.snapshot().launch).toBe('attempted');
      queueMicrotask(() => {
        native.stdout.emit('data', Buffer.from('offline'));
        native.exitCode = 0;
        native.emit('exit', 0, null);
        native.emit('close', 0);
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const adapter = new OfflineAdapter();
    expect((await adapter.execute({ content: 'fixture' }, host.options)).ok).toBe(true);
    expect(nativeResourcesForPolicy(host.capability)).toBe(observer);
    expect(events.slice(0, 3)).toEqual(['exit', 'close', 'error']);
    expect(observer.snapshot()).toMatchObject({
      completionChild: 'closed',
      knownTree: 'settled',
      safe: true,
    });
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });
  it('a successful canonical result does not settle its surviving known descendant', async () => {
    let descendantAlive = true;
    const observer = new NativeResourceObserver({
      acquisition: 'none',
      processes: {
        platform: 'linux',
        enumerate: () => ({ coverage: 'complete', pids: [22] }),
        readIdentity: (pid) =>
          pid === 22 && !descendantAlive
            ? { state: 'absent' }
            : { state: 'present', startTime: String(pid), processState: 'S' },
      },
    });
    const host = policy(observer);
    const native = child();
    const safe = vi.fn();
    observer.onSafeSettlement(safe);
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        native.stdout.emit('data', Buffer.from('offline'));
        native.exitCode = 0;
        native.emit('exit', 0, null);
        native.emit('close', 0);
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    expect((await new OfflineAdapter().execute({ content: 'fixture' }, host.options)).ok).toBe(
      true
    );
    expect(observer.snapshot()).toMatchObject({
      completionChild: 'closed',
      knownTree: 'pending',
      safe: false,
    });
    expect(safe).not.toHaveBeenCalled();
    descendantAlive = false;
    expect(observer.snapshot().safe).toBe(false);
    observer.refreshKnownResources();
    expect(observer.snapshot().safe).toBe(true);
    expect(safe).toHaveBeenCalledTimes(1);
  });
  it('early cancellation/result and adapter disposal do not establish physical settlement', async () => {
    const observer = resources();
    const controller = new AbortController();
    const host = policy(observer, controller.signal);
    const native = child();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        controller.abort('fixture cancel');
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const safe = vi.fn();
    observer.onSafeSettlement(safe);
    const adapter = new OfflineAdapter();
    const result = await adapter.execute({ content: 'fixture' }, host.options);
    expect(result.ok).toBe(false);
    expect(observer.snapshot()).toMatchObject({ completionChild: 'running', safe: false });
    await adapter.dispose();
    expect(observer.snapshot().safe).toBe(false);
    expect(safe).not.toHaveBeenCalled();
    native.exitCode = 0;
    native.emit('exit', 0, null);
    native.emit('close', 0);
    expect(observer.snapshot().safe).toBe(true);
    expect(safe).toHaveBeenCalledTimes(1);
  });
  it('failed synchronous spawn consumes permit without inventing an empty resource scope', async () => {
    const observer = resources();
    const host = policy(observer);
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('offline spawn failure');
    });
    const adapter = new OfflineAdapter();
    expect((await adapter.execute({ content: 'fixture' }, host.options)).ok).toBe(false);
    expect((await adapter.execute({ content: 'fixture' }, host.options)).ok).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(observer.snapshot()).toMatchObject({
      launch: 'failed',
      completionChild: 'unknown',
      safe: false,
    });
    expect(adapter.cleanup).toHaveBeenCalledTimes(2);
  });
  it('retains uncertainty when a returned handle reports asynchronous spawn failure', async () => {
    const observer = resources();
    const host = policy(observer);
    const native = child();
    native.pid = undefined;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        native.emit(
          'error',
          Object.assign(new Error('offline missing executable'), { code: 'ENOENT' })
        );
        native.exitCode = -2;
        native.emit('close', -2);
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const adapter = new OfflineAdapter();
    expect((await adapter.execute({ content: 'fixture' }, host.options)).ok).toBe(false);
    expect(observer.snapshot()).toMatchObject({
      launch: 'failed',
      knownTree: 'unmeasured',
      safe: false,
    });
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });
  it('default host policy keeps ordinary acquisition explicitly unmeasured', () => {
    const host = policy();
    expect(nativeResourcesForPolicy(host.capability)?.snapshot()).toMatchObject({
      acquisitionChildren: 'unmeasured',
      safe: false,
    });
  });
});

describe('observer callbacks and single-operation ownership (#7534)', () => {
  it('publishes attempted launch only after spawn and cancels that already-launched child', async () => {
    const observer = resources();
    const controller = new AbortController();
    const host = policy(observer, controller.signal);
    const native = child();
    const publicationSpawnCounts: number[] = [];
    observer.onChange((snapshot) => {
      if (snapshot.launch === 'attempted') {
        publicationSpawnCounts.push(vi.mocked(spawn).mock.calls.length);
        controller.abort('host observer cancelled at launch publication');
      }
    });
    vi.mocked(spawn).mockReturnValue(native as unknown as ChildProcessWithoutNullStreams);
    // A broken listener-installation path still terminates this offline fixture.
    const watchdog = setTimeout(() => native.emit('close', 0), 100);
    const adapter = new OfflineAdapter();
    try {
      const result = await adapter.execute({ content: 'fixture' }, host.options);
      expect(publicationSpawnCounts.length).toBeGreaterThan(0);
      expect(publicationSpawnCounts).not.toContain(0);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(isCallerAbortError(result.error)).toBe(true);
      expect(terminateProcessTree).toHaveBeenCalledWith(
        native,
        expect.any(Number),
        expect.any(Function)
      );
      expect(observer.snapshot()).toMatchObject({
        completionChild: 'running',
        streamsClosed: false,
        safe: false,
      });
      expect(adapter.cleanup).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeout(watchdog);
      native.emit('close', 0);
    }
    expect(observer.snapshot()).toMatchObject({ completionChild: 'closed', safe: true });
  });

  it('refuses callback-caused cancellation during wrapper preparation before any physical spawn', async () => {
    const observer = resources();
    const controller = new AbortController();
    const host = policy(observer, controller.signal);
    observer.onChange(() => {
      controller.abort('host preparation cancelled');
    });
    const adapter = new OfflineAdapter();
    const result = await adapter.execute(
      {
        content: 'fixture',
        wrapper: (command, args, options) => {
          observer.refreshKnownResources();
          return { command, args: [...args], options };
        },
      },
      host.options
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isCallerAbortError(result.error)).toBe(true);
    expect(observer.snapshot()).toMatchObject({
      launch: 'refused',
      completionChild: 'not-started',
      safe: true,
    });
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });

  it('refuses a new policy after canonical cancellation already ended its original observer scope', async () => {
    const observer = resources();
    const cancelled = new AbortController();
    cancelled.abort('first acquisition cancelled');
    const first = issueNativeExecutionPolicy({
      deadlineAt: Date.now() + 10_000,
      signal: cancelled.signal,
      resources: observer,
    });
    if (!first.ok) throw new Error('Expected original issuance');
    expect(nativeExecutionOptions(first.value).ok).toBe(false);
    expect(observer.snapshot().launch).toBe('refused');
    const second = issueNativeExecutionPolicy({
      deadlineAt: Date.now() + 10_000,
      resources: observer,
    });
    const native = child();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => native.emit('close', 0));
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const runningSnapshots: boolean[] = [];
    observer.onChange((snapshot) => {
      if (snapshot.completionChild === 'running') runningSnapshots.push(snapshot.safe);
    });
    if (second.ok) {
      const options = nativeExecutionOptions(second.value);
      if (options.ok) await new OfflineAdapter().execute({ content: 'fixture' }, options.value);
    }
    expect(runningSnapshots).not.toContain(true);
    expect(second).toEqual({ ok: false, error: { reason: 'invalid-policy' } });
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['bound', 'refused', 'running', 'closed', 'disposed', 'failed'] as const)(
    'rejects an observer that is already %s at issuance',
    (state) => {
      const observer = resources();
      const native = child();
      if (state === 'bound') policy(observer);
      if (state === 'refused') observer.recordRefusal();
      if (state === 'running' || state === 'closed') {
        observer.recordLaunchAttempt();
        observer.attachChild(native as unknown as ChildProcess);
        if (state === 'closed') native.emit('close', 0);
      }
      if (state === 'disposed') observer.dispose();
      if (state === 'failed') {
        observer.recordLaunchAttempt();
        observer.recordLaunchFailure();
      }
      expect(
        issueNativeExecutionPolicy({ deadlineAt: Date.now() + 10_000, resources: observer })
      ).toEqual({ ok: false, error: { reason: 'invalid-policy' } });
    }
  );

  it('never certifies a live child even if host code inconsistently attaches after refusal', () => {
    const observer = resources();
    observer.recordRefusal();
    expect(observer.snapshot().safe).toBe(true);
    observer.attachChild(child() as unknown as ChildProcess);
    expect(observer.snapshot()).toMatchObject({
      completionChild: 'running',
      knownTree: 'unmeasured',
      safe: false,
    });
  });

  it('keeps ordinary execution without a host policy unchanged', async () => {
    const native = child();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        native.stdout.emit('data', Buffer.from('ordinary'));
        native.exitCode = 0;
        native.emit('close', 0);
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const adapter = new OfflineAdapter();
    expect((await adapter.execute({ content: 'fixture' }, { allowRetry: false })).ok).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });
});
