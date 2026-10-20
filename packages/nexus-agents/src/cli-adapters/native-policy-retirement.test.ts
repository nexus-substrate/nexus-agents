/** Real policy→Base→subprocess boundary; child and signal operations are offline doubles. */
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { isCallerAbortError, isNativePreSpawnRefusal } from './cli-error-helpers.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandConfig } from './subprocess-adapter.js';
import type { ModelInfo, ExecutionOptions } from './types.js';
import type { ResolvedExecutionOptions } from './types-capability.js';
import type { NativeExecutionPolicy } from './native-execution-policy.js';
import { SubprocessCliAdapter } from './subprocess-adapter.js';
import { NativeResourceObserver } from './native-resource-observer.js';
import {
  issueNativeExecutionPolicy,
  nativeExecutionOptions,
  nativeExecutionBudget,
  resolveNativeSpawnOptions,
  nativeResourcesForPolicy,
} from './native-execution-policy.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
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

function autoClose(): void {
  vi.mocked(spawn).mockImplementation(() => {
    const native = child();
    queueMicrotask(() => {
      native.stdout.emit('data', Buffer.from('offline'));
      native.exitCode = 0;
      native.emit('close', 0);
    });
    return native as unknown as ChildProcessWithoutNullStreams;
  });
}
function resolved(options: ExecutionOptions): ResolvedExecutionOptions {
  return {
    timeoutMs: 1000,
    allowRetry: false,
    maxRetries: 0,
    trackUsage: false,
    onProgress: undefined,
    ...options,
  };
}
function abortedRequest(): AbortSignal {
  const request = new AbortController();
  request.abort('only this request cancelled');
  return request.signal;
}
function expectRetired(result: Awaited<ReturnType<OfflineAdapter['execute']>>): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(isNativePreSpawnRefusal(result.error)).toBe(true);
    expect(result.error.cause).toMatchObject({ reason: 'policy-retired' });
    expect(isCallerAbortError(result.error)).toBe(false);
  }
}

describe('terminal host operation after actual request refusal (#7534)', () => {
  it('retires before settlement and fences later Base execution using already prepared options', async () => {
    const observer = resources(),
      host = policy(observer),
      adapter = new OfflineAdapter();
    const safe = vi.fn();
    observer.onSafeSettlement(safe);
    const first = nativeExecutionOptions(host.capability, abortedRequest());
    expect(first).toEqual({ ok: false, error: { reason: 'cancelled-before-spawn' } });
    expect(observer.snapshot()).toMatchObject({
      launch: 'refused',
      completionChild: 'not-started',
      safe: true,
    });
    expect(safe).toHaveBeenCalledTimes(1);
    autoClose();
    const failure = vi.spyOn(
      getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude'),
      'recordFailure'
    );
    expectRetired(await adapter.execute({ content: 'fixture' }, host.options));
    expect(spawn).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    expect(nativeExecutionBudget(host.capability)).toEqual({
      ok: false,
      error: { reason: 'policy-retired' },
    });
    expect(nativeExecutionOptions(host.capability)).toEqual({
      ok: false,
      error: { reason: 'policy-retired' },
    });
    expect(safe).toHaveBeenCalledTimes(1);
  });

  it('retires before direct executeTask callback reentry can launch', async () => {
    const observer = resources(),
      host = policy(observer),
      adapter = new OfflineAdapter();
    let reentry: ReturnType<OfflineAdapter['executeTask']> | undefined;
    const notified: unknown[] = [];
    autoClose();
    observer.onChange((snapshot) => {
      if (snapshot.launch === 'refused' && reentry === undefined) {
        reentry = adapter.executeTask({ content: 'fixture' }, resolved(host.options));
      }
    });
    observer.onSafeSettlement((snapshot) =>
      notified.push({
        argument: snapshot,
        current: observer.snapshot(),
        spawns: vi.mocked(spawn).mock.calls.length,
      })
    );
    expect(nativeExecutionOptions(host.capability, abortedRequest()).ok).toBe(false);
    expect(reentry).toBeDefined();
    if (reentry === undefined) throw new Error('Expected canonical reentry');
    expectRetired(await reentry);
    expect(spawn).not.toHaveBeenCalled();
    expect(notified).toMatchObject([
      {
        argument: { safe: true },
        current: { completionChild: 'not-started', safe: true },
        spawns: 0,
      },
    ]);
  });

  it('adapted Base reentry control yields before physical dispatch and then refuses the retired operation', async () => {
    const observer = resources(),
      host = policy(observer),
      adapter = new OfflineAdapter();
    let reentry: ReturnType<OfflineAdapter['execute']> | undefined;
    const notified: unknown[] = [];
    autoClose();
    observer.onChange((snapshot) => {
      if (snapshot.launch === 'refused' && reentry === undefined)
        reentry = adapter.execute({ content: 'fixture' }, host.options);
    });
    observer.onSafeSettlement((snapshot) =>
      notified.push({
        argument: snapshot,
        current: observer.snapshot(),
        spawns: vi.mocked(spawn).mock.calls.length,
      })
    );
    nativeExecutionOptions(host.capability, abortedRequest());
    expect(reentry).toBeDefined();
    expect(notified).toMatchObject([
      {
        argument: { safe: true },
        current: { completionChild: 'not-started', safe: true },
        spawns: 0,
      },
    ]);
    if (reentry === undefined) throw new Error('Expected Base reentry');
    expectRetired(await reentry);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'resolve boundary consume=%s retires before its callback and preserves the first error',
    async (consume) => {
      const observer = resources(),
        host = policy(observer);
      const atCallback: unknown[] = [];
      observer.onChange((snapshot) => {
        if (snapshot.launch === 'refused') atCallback.push(nativeExecutionBudget(host.capability));
      });
      const first = resolveNativeSpawnOptions(
        { ...resolved(host.options), signal: abortedRequest() },
        'claude',
        consume
      );
      expect(first.ok).toBe(false);
      if (!first.ok) expect(isCallerAbortError(first.error)).toBe(true);
      expect(atCallback).toEqual([{ ok: false, error: { reason: 'policy-retired' } }]);
      autoClose();
      expectRetired(await new OfflineAdapter().execute({ content: 'fixture' }, host.options));
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it('retires actual final-wrapper request refusal without consuming a physical attempt', async () => {
    const observer = resources(),
      host = policy(observer),
      adapter = new OfflineAdapter();
    const request = new AbortController();
    const first = await adapter.execute(
      {
        content: 'fixture',
        wrapper: (command, args, options) => {
          request.abort('request cancelled during final materialization');
          return { command, args, options };
        },
      },
      { ...host.options, signal: request.signal }
    );
    expect(first.ok).toBe(false);
    if (!first.ok) expect(isCallerAbortError(first.error)).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(observer.snapshot()).toMatchObject({
      launch: 'refused',
      completionChild: 'not-started',
      safe: true,
    });
    autoClose();
    expectRetired(await adapter.execute({ content: 'fixture' }, host.options));
    expect(spawn).not.toHaveBeenCalled();
    expect(adapter.cleanup).toHaveBeenCalledTimes(2);
  });

  it('pure budget inquiry with request cancellation neither retires nor publishes refusal', async () => {
    const observer = resources(),
      host = policy(observer),
      changes = vi.fn();
    observer.onChange(changes);
    expect(nativeExecutionBudget(host.capability, abortedRequest())).toEqual({
      ok: false,
      error: { reason: 'cancelled-before-spawn' },
    });
    expect(changes).not.toHaveBeenCalled();
    expect(observer.snapshot()).toMatchObject({ launch: 'unattempted', safe: false });
    autoClose();
    expect((await new OfflineAdapter().execute({ content: 'fixture' }, host.options)).ok).toBe(
      true
    );
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('materializer exception stays unretired and unspent with no terminal certification', async () => {
    const observer = resources(),
      host = policy(observer),
      adapter = new OfflineAdapter(),
      safe = vi.fn();
    observer.onSafeSettlement(safe);
    const first = await adapter.execute(
      {
        content: 'fixture',
        wrapper: () => {
          throw new Error('offline prelaunch materializer');
        },
      },
      host.options
    );
    expect(first.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(observer.snapshot().safe).toBe(false);
    expect(safe).not.toHaveBeenCalled();
    expect(nativeExecutionBudget(host.capability).ok).toBe(true);
    autoClose();
    expect((await adapter.execute({ content: 'fixture' }, host.options)).ok).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(adapter.cleanup).toHaveBeenCalledTimes(2);
  });

  it('permanent original-policy cancellation still refuses every later attempt', async () => {
    const observer = resources(),
      controller = new AbortController(),
      host = policy(observer, controller.signal);
    controller.abort('whole operation cancelled');
    expect(nativeExecutionOptions(host.capability)).toEqual({
      ok: false,
      error: { reason: 'cancelled-before-spawn' },
    });
    autoClose();
    expect((await new OfflineAdapter().execute({ content: 'fixture' }, host.options)).ok).toBe(
      false
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(observer.snapshot().safe).toBe(true);
  });

  it('adapted default-acquisition control stays unmeasured and never emits aggregate safe', async () => {
    const host = policy(),
      observer = nativeResourcesForPolicy(host.capability);
    if (observer === undefined) throw new Error('Expected observer');
    const safe = vi.fn();
    observer.onSafeSettlement(safe);
    expect(nativeExecutionOptions(host.capability, abortedRequest()).ok).toBe(false);
    expect(observer.snapshot()).toMatchObject({ acquisitionChildren: 'unmeasured', safe: false });
    autoClose();
    expectRetired(await new OfflineAdapter().execute({ content: 'fixture' }, host.options));
    expect(spawn).not.toHaveBeenCalled();
    expect(safe).not.toHaveBeenCalled();
  });

  it('retirement after an early result preserves running physical facts until close', async () => {
    const observer = resources(),
      controller = new AbortController(),
      host = policy(observer, controller.signal),
      native = child();
    const safe = vi.fn();
    observer.onSafeSettlement(safe);
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        controller.abort('cancel launched operation');
      });
      return native as unknown as ChildProcessWithoutNullStreams;
    });
    const result = await new OfflineAdapter().execute({ content: 'fixture' }, host.options);
    expect(result.ok).toBe(false);
    expect(nativeExecutionOptions(host.capability, abortedRequest()).ok).toBe(false);
    expect(observer.snapshot()).toMatchObject({
      launch: 'attempted',
      completionChild: 'running',
      safe: false,
    });
    expect(safe).not.toHaveBeenCalled();
    native.exitCode = 0;
    native.emit('close', 0);
    expect(observer.snapshot().safe).toBe(true);
    expect(safe).toHaveBeenCalledTimes(1);
  });

  it('preserves a distinct retired refusal through the actual model bridge without replaying the first error', async () => {
    const host = policy(resources()),
      adapter = new OfflineAdapter();
    expect(nativeExecutionOptions(host.capability, abortedRequest())).toEqual({
      ok: false,
      error: { reason: 'cancelled-before-spawn' },
    });
    const first = resolveNativeSpawnOptions(resolved(host.options), 'claude', true);
    const second = resolveNativeSpawnOptions(resolved(host.options), 'claude', true);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (!first.ok && !second.ok) {
      expect(first.error.cause).toMatchObject({ reason: 'policy-retired' });
      expect(second.error.cause).toMatchObject({ reason: 'policy-retired' });
      expect(second.error).not.toBe(first.error);
      expect(second.error.cause).not.toBe(first.error.cause);
    }
    const result = await new CliToModelAdapter(adapter).completeWithNativePolicy(
      { messages: [{ role: 'user', content: 'offline' }] },
      host.capability
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('policy-retired');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('ordinary execution without native authority remains unchanged', async () => {
    autoClose();
    expect(
      (await new OfflineAdapter().execute({ content: 'fixture' }, { allowRetry: false })).ok
    ).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
