/** Canonical physical-boundary tests; child/OS operations are offline doubles. */
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedTimeProvider, resetTimeProvider, setTimeProvider } from '../core/index.js';
import { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';
import type { ModelInfo, ExecutionOptions } from './types.js';
import type { CommandWrapper } from './exec-file-tree.js';
import { issueNativeExecutionPolicy, nativeExecutionOptions } from './native-execution-policy.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import { isCallerAbortError } from './cli-error-helpers.js';
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
    return { command: 'offline', args: ['plain'], cleanup: this.cleanup };
  }
  getModelInfo(): ModelInfo {
    return { id: 'fixture', name: 'Fixture', contextWindow: 1000 };
  }
}
let clock: FixedTimeProvider;
const mockSpawn = vi.mocked(spawn);
const breaker = getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude');
beforeEach(() => {
  clock = new FixedTimeProvider(1000);
  setTimeProvider(clock);
  breaker.reset();
  mockSpawn.mockReset().mockImplementation((_command, _args, options) => {
    // Node's spawn normalizes enumerable environment values before its OS call.
    // Exercise that boundary explicitly; a vi.fn alone never reads env getters.
    if (options?.env !== undefined) for (const key in options.env) Reflect.get(options.env, key);
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      exitCode: null,
      signalCode: null,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('offline'));
      child.emit('close', 0);
    });
    return child as unknown as ChildProcessWithoutNullStreams;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  resetTimeProvider();
  breaker.reset();
});
function options(native: boolean, signal?: AbortSignal): ExecutionOptions {
  if (!native) return { allowRetry: false, ...(signal === undefined ? {} : { signal }) };
  const issued = issueNativeExecutionPolicy({
    deadlineAt: 11000,
    ...(signal === undefined ? {} : { signal }),
  });
  if (!issued.ok) throw new Error('Expected issuance');
  const opts = nativeExecutionOptions(issued.value);
  if (!opts.ok) throw new Error('Expected options');
  return opts.value;
}
type Materializer = 'args-iterator' | 'env-getter' | 'cwd-getter' | 'env-value-getter';
function wrapper(kind: Materializer, effect: () => void): CommandWrapper {
  return (command, args, opts) => {
    const finalArgs = [...args],
      finalOptions = { ...opts };
    if (kind === 'args-iterator')
      Object.defineProperty(finalArgs, Symbol.iterator, {
        value: function* () {
          effect();
          yield 'wrapped';
        },
      });
    if (kind === 'env-getter')
      Object.defineProperty(finalOptions, 'env', {
        get: () => {
          effect();
          return opts.env;
        },
      });
    if (kind === 'cwd-getter')
      Object.defineProperty(finalOptions, 'cwd', {
        get: () => {
          effect();
          return '/tmp';
        },
      });
    if (kind === 'env-value-getter') {
      const env = { ...opts.env };
      Object.defineProperty(env, 'NEXUS_FIXTURE_VALUE', {
        enumerable: true,
        get: () => {
          effect();
          return 'fixture';
        },
      });
      finalOptions.env = env;
    }
    return { command, args: finalArgs, options: finalOptions };
  };
}
describe('materialization precedes final native/ordinary spawn guard (#7533)', () => {
  it.each([true, false])('native=%s keeps plain command execution unchanged', async (native) => {
    const adapter = new OfflineAdapter();
    expect((await adapter.execute({ content: 'fixture' }, options(native))).ok).toBe(true);
    expect(mockSpawn.mock.calls.length).toBe(1);
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'native=%s refuses wrapper-body cancellation before materialization',
    async (native) => {
      const controller = new AbortController(),
        adapter = new OfflineAdapter();
      const result = await adapter.execute(
        {
          content: 'fixture',
          wrapper: (command, args, opts) => {
            controller.abort('wrapper body cancelled');
            return { command, args, options: opts };
          },
        },
        options(native, controller.signal)
      );
      expect(result.ok).toBe(false);
      expect(mockSpawn.mock.calls.length).toBe(0);
      expect(adapter.cleanup).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [true, 'args-iterator'],
    [true, 'env-getter'],
    [true, 'cwd-getter'],
    [true, 'env-value-getter'],
    [false, 'args-iterator'],
    [false, 'env-getter'],
    [false, 'cwd-getter'],
    [false, 'env-value-getter'],
  ] as const)('native=%s refuses cancellation from %s before any child', async (native, kind) => {
    const controller = new AbortController(),
      adapter = new OfflineAdapter(),
      failure = vi.spyOn(breaker, 'recordFailure');
    const result = await adapter.execute(
      {
        content: 'fixture',
        wrapper: wrapper(kind, () => {
          controller.abort('fixture materialization cancelled');
        }),
      },
      options(native, controller.signal)
    );
    expect(mockSpawn.mock.calls.length).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isCallerAbortError(result.error)).toBe(true);
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
  });
  it.each(['args-iterator', 'env-value-getter'] as const)(
    'refuses synchronous deadline expiry in %s before consuming an attempt',
    async (kind) => {
      const adapter = new OfflineAdapter(),
        failure = vi.spyOn(breaker, 'recordFailure');
      const result = await adapter.execute(
        {
          content: 'fixture',
          wrapper: wrapper(kind, () => {
            clock.advance(10000);
          }),
        },
        options(true)
      );
      expect(mockSpawn.mock.calls.length).toBe(0);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.cause).toMatchObject({ reason: 'expired-before-spawn' });
      expect(adapter.cleanup).toHaveBeenCalledTimes(1);
      expect(failure).not.toHaveBeenCalled();
    }
  );
  it.each(['args-iterator', 'env-getter', 'cwd-getter', 'env-value-getter'] as const)(
    'cleans a throwing %s once without spending its physical permit',
    async (kind) => {
      const adapter = new OfflineAdapter(),
        opts = options(true);
      const first = await adapter.execute(
        {
          content: 'fixture',
          wrapper: wrapper(kind, () => {
            throw new Error('offline materialization failure');
          }),
        },
        opts
      );
      expect(mockSpawn.mock.calls.length).toBe(0);
      expect(first.ok).toBe(false);
      expect(adapter.cleanup).toHaveBeenCalledTimes(1);
      // The existing failure classification is preserved; it is not a new health exemption.
      expect((await adapter.execute({ content: 'fixture' }, opts)).ok).toBe(true);
      expect(mockSpawn.mock.calls.length).toBe(1);
      expect(adapter.cleanup).toHaveBeenCalledTimes(2);
    }
  );
  it.each([true, false])(
    'native=%s preserves normal wrapper args/cwd/env and reads each accessor once',
    async (native) => {
      const adapter = new OfflineAdapter(),
        readEnv = vi.fn(),
        readCwd = vi.fn(),
        readValue = vi.fn(),
        readInherited = vi.fn();
      const inherited: NodeJS.ProcessEnv = {};
      Object.defineProperty(inherited, 'NEXUS_FIXTURE_INHERITED', {
        enumerable: true,
        get: () => {
          readInherited();
          return 'inherited';
        },
      });
      const result = await adapter.execute(
        {
          content: 'fixture',
          wrapper: (command, args, opts) => {
            const env = { ...opts.env };
            Object.setPrototypeOf(env, inherited);
            Object.defineProperty(env, 'NEXUS_FIXTURE_VALUE', {
              enumerable: true,
              get: () => {
                readValue();
                return 'own';
              },
            });
            return {
              command,
              args: [...args, 'wrapped'],
              options: {
                ...opts,
                get env() {
                  readEnv();
                  return env;
                },
                get cwd() {
                  readCwd();
                  return '/tmp';
                },
              },
            };
          },
        },
        options(native)
      );
      expect(result.ok).toBe(true);
      expect(mockSpawn.mock.calls.length).toBe(1);
      const invocation = mockSpawn.mock.calls[0];
      expect(invocation?.[1]).toEqual(['plain', 'wrapped']);
      expect(invocation?.[2]).toMatchObject({
        cwd: '/tmp',
        env: { NEXUS_FIXTURE_VALUE: 'own', NEXUS_FIXTURE_INHERITED: 'inherited' },
      });
      expect(readEnv).toHaveBeenCalledTimes(1);
      expect(readCwd).toHaveBeenCalledTimes(1);
      expect(readValue).toHaveBeenCalledTimes(1);
      expect(readInherited).toHaveBeenCalledTimes(1);
      const env = invocation?.[2]?.env;
      expect(
        Object.getOwnPropertyDescriptor(env ?? {}, 'NEXUS_FIXTURE_VALUE')?.get
      ).toBeUndefined();
      expect(
        Object.getOwnPropertyDescriptor(env ?? {}, 'NEXUS_FIXTURE_INHERITED')?.get
      ).toBeUndefined();
      expect(adapter.cleanup).toHaveBeenCalledTimes(1);
    }
  );
});
