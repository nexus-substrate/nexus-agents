/** Offline actual-Base/default-registry regression only; no production fix. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '../core/index.js';
import { BaseCliAdapter } from './base-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import {
  CliCircuitBreakerIntegration,
  getDefaultCliCircuitBreakerRegistry,
} from './cli-circuit-breaker.js';
import { CliCircuitBreaker } from './circuit-breaker.js';
import { breakerKeys } from './breaker-key.js';
import {
  createCallerInputCliError,
  createCallerAbortCliError,
  createNativePreSpawnRefusal,
} from './cli-error-helpers.js';
import type { CliError, CliResponse, ModelInfo, CliTask, ICliAdapter } from './types.js';

const failure: CliError = {
  code: 'EXECUTION_ERROR',
  message: 'TEST_FAKE offline nonretryable failure',
  cli: 'claude',
  retryable: false,
};

class OfflineActualBase extends BaseCliAdapter {
  readonly name: 'claude' | 'opencode' | 'gemini' = 'claude';
  readonly transport = 'subprocess';
  calls = 0;
  retry = false;
  results: Result<CliResponse, CliError>[] = [err(failure)];

  protected override shouldOuterRetry(): boolean {
    return this.retry;
  }

  executeTask(): Promise<Result<CliResponse, CliError>> {
    this.calls++;
    return Promise.resolve(this.results[Math.min(this.calls - 1, this.results.length - 1)]!);
  }

  getModelInfo(): ModelInfo {
    return { id: 'offline-model', name: 'Offline model', contextWindow: 1_000 };
  }

  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

describe('actual Base shared default outcome regression (#7543)', () => {
  const shared = getDefaultCliCircuitBreakerRegistry();
  const breaker = shared.getArmBreaker('claude');
  const task = { content: 'TEST_FAKE offline breaker accounting' };

  beforeEach(() => {
    shared.resetAll();
    expect(breaker.getSnapshot().state).toBe('closed');
    expect(breaker.getSnapshot().failureCount).toBe(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    shared.resetAll();
    expect(breaker.getSnapshot().failureCount).toBe(0);
  });

  it('control: direct Base records one failure without integration', async () => {
    const adapter = new OfflineActualBase();
    expect(await adapter.execute(task)).toEqual(err(failure));
    expect(adapter.calls).toBe(1);
    expect(breaker.getSnapshot().failureCount).toBe(1);
    expect(breaker.getSnapshot().state).toBe('closed');
  });

  it('control: explicit custom registry records one separate failure per domain', async () => {
    const adapter = new OfflineActualBase();
    const integration = new CliCircuitBreakerIntegration([adapter], {});
    expect(await integration.execute(adapter, task)).toEqual(err(failure));
    expect(adapter.calls).toBe(1);
    expect(breaker.getSnapshot().failureCount).toBe(1);
    expect(
      integration.getHealthStatus().clis.find((entry) => entry.name === 'claude')?.failureCount
    ).toBe(1);
  });

  it('records exactly one failure for one actual Base execution with default registry', async () => {
    const adapter = new OfflineActualBase();
    // Config MUST be omitted: even {} would select a separate private registry.
    const integration = new CliCircuitBreakerIntegration([adapter]);
    expect(await integration.execute(adapter, task)).toEqual(err(failure));
    expect(adapter.calls).toBe(1);
    expect(breaker.getSnapshot().state).toBe('closed');
    expect(breaker.getSnapshot().failureCount).toBe(1);
  });

  it('keeps integration as writer when a plain adapter supplies no Base receipt', async () => {
    const adapter = new OfflineActualBase();
    const plain: ICliAdapter = {
      name: adapter.name,
      transport: adapter.transport,
      capabilities: adapter.capabilities,
      execute: () => Promise.resolve(err(failure)),
      getModelInfo: () => adapter.getModelInfo(),
      initialize: () => adapter.initialize(),
      dispose: () => adapter.dispose(),
      healthCheck: () => adapter.healthCheck(),
      getCapacity: () => adapter.getCapacity(),
      getVersion: () => adapter.getVersion(),
    };
    const integration = new CliCircuitBreakerIntegration([plain]);
    await integration.execute(plain, task);
    expect(adapter.calls).toBe(0);
    expect(breaker.getSnapshot().failureCount).toBe(1);
  });

  it('keeps shared recording for a Gemini-shaped override with a private breaker', async () => {
    class PrivateOverride extends OfflineActualBase {
      override readonly name = 'gemini';
      readonly privateBreaker = new CliCircuitBreaker('gemini');
      override execute(): Promise<Result<CliResponse, CliError>> {
        this.privateBreaker.recordFailure('unknown');
        return Promise.resolve(err({ ...failure, cli: 'gemini' }));
      }
    }
    const adapter = new PrivateOverride();
    await new CliCircuitBreakerIntegration([adapter]).execute(adapter, task);
    expect(adapter.privateBreaker.getSnapshot().failureCount).toBe(1);
    expect(shared.getArmBreaker('gemini').getSnapshot().failureCount).toBe(1);
  });

  it.each([undefined, 'custom/requested-model'])(
    'retains integration writes when an OpenCode-shaped override rewrites model %s',
    async (model) => {
      class Rewrite extends OfflineActualBase {
        override readonly name = 'opencode';
        override getModelInfo(): ModelInfo {
          return { id: 'custom/configured-model', name: 'Offline', contextWindow: 1_000 };
        }
        override execute(input: CliTask): Promise<Result<CliResponse, CliError>> {
          return super.execute({ ...input, model: 'anthropic/offline' });
        }
      }
      const adapter = new Rewrite();
      const input = { ...task, ...(model === undefined ? {} : { model }) };
      await new CliCircuitBreakerIntegration([adapter]).execute(adapter, input);
      const key = breakerKeys.forArm({
        name: 'opencode',
        model: model ?? adapter.getModelInfo().id,
      });
      expect(key).not.toBe('opencode');
      expect(shared.getArmBreaker(key).getSnapshot().failureCount).toBe(1);
      expect(shared.getArmBreaker('opencode').getSnapshot().failureCount).toBe(1);
    }
  );

  it('suppresses only one terminal write after retry exhaustion', async () => {
    vi.useFakeTimers();
    const adapter = new OfflineActualBase();
    adapter.retry = true;
    adapter.results = [err({ ...failure, code: 'TIMEOUT', retryable: true })];
    const pending = new CliCircuitBreakerIntegration([adapter]).execute(adapter, task);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(false);
    expect(adapter.calls).toBe(2);
    expect(breaker.getSnapshot().failureCount).toBe(2);
  });

  it('resets shared failures after a retry succeeds', async () => {
    vi.useFakeTimers();
    const adapter = new OfflineActualBase();
    adapter.retry = true;
    adapter.results = [
      err({ ...failure, code: 'TIMEOUT', retryable: true }),
      ok({ text: 'recovered' }),
    ];
    const pending = new CliCircuitBreakerIntegration([adapter]).execute(adapter, task);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(true);
    expect(adapter.calls).toBe(2);
    expect(breaker.getSnapshot().failureCount).toBe(0);
  });

  it('counts a Base success once in half-open, preserving the success response wrapper', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < breaker.getSnapshot().config.failureThreshold; i++)
      breaker.recordFailure('unknown');
    vi.advanceTimersByTime(breaker.getSnapshot().config.resetTimeoutMs + 1);
    expect(breaker.getState()).toBe('half-open');
    const adapter = new OfflineActualBase();
    adapter.results = [ok({ text: 'healthy' })];
    expect((await new CliCircuitBreakerIntegration([adapter]).execute(adapter, task)).ok).toBe(
      true
    );
    expect(breaker.getSnapshot().state).toBe('half-open');
    expect(breaker.getSnapshot().successCount).toBe(1);
  });

  it.each([
    createCallerInputCliError('TEST_FAKE invalid input', 'claude'),
    createCallerAbortCliError('cancelled', 'TEST_FAKE cancelled', 'claude'),
    createNativePreSpawnRefusal('permit-consumed', 'claude'),
  ])('releases half-open admission for exempt error $message', async (error) => {
    vi.useFakeTimers();
    for (let i = 0; i < breaker.getSnapshot().config.failureThreshold; i++)
      breaker.recordFailure('unknown');
    vi.advanceTimersByTime(breaker.getSnapshot().config.resetTimeoutMs + 1);
    expect(breaker.getState()).toBe('half-open');
    const before = breaker.getSnapshot();
    const adapter = new OfflineActualBase();
    adapter.results = [err(error)];
    expect((await new CliCircuitBreakerIntegration([adapter]).execute(adapter, task)).ok).toBe(
      false
    );
    expect(adapter.calls).toBe(1);
    expect(breaker.getSnapshot().failureCount).toBe(before.failureCount);
    expect(breaker.getSnapshot().halfOpenRequests).toBe(0);
  });

  it.each(['initialize', 'executeTask'] as const)(
    'counts unexpected %s throws once',
    async (method) => {
      const adapter = new OfflineActualBase();
      adapter[method] = () => {
        throw new Error('TEST_FAKE unexpected exception');
      };
      expect((await new CliCircuitBreakerIntegration([adapter]).execute(adapter, task)).ok).toBe(
        false
      );
      expect(breaker.getSnapshot().failureCount).toBe(1);
    }
  );

  it('does not transfer a receipt to a different adapter forwarding the same result', async () => {
    const owner = new OfflineActualBase();
    const result = await owner.execute(task);
    const other = new OfflineActualBase();
    other.execute = () => Promise.resolve(result);
    await new CliCircuitBreakerIntegration([other]).execute(other, task);
    expect(owner.calls).toBe(1);
    expect(other.calls).toBe(0);
    expect(breaker.getSnapshot().failureCount).toBe(2);
  });

  it('gives concurrent executions fresh containers even with a reused provider result', async () => {
    const adapter = new OfflineActualBase();
    const reused = err(failure);
    adapter.results = [reused];
    const [first, second] = await Promise.all([adapter.execute(task), adapter.execute(task)]);
    expect(first).not.toBe(second);
    expect(first).not.toBe(reused);
    expect(second).not.toBe(reused);
    expect(adapter.calls).toBe(2);
    expect(breaker.getSnapshot().failureCount).toBe(2);
  });

  it('does not suppress a replayed result after its one integration observation', async () => {
    const adapter = new OfflineActualBase();
    const integration = new CliCircuitBreakerIntegration([adapter]);
    const baseExecute = adapter.execute.bind(adapter);
    let saved: Result<CliResponse, CliError> | undefined;
    adapter.execute = async (input) => {
      saved ??= await baseExecute(input);
      return saved;
    };
    await integration.execute(adapter, task);
    await integration.execute(adapter, task);
    expect(adapter.calls).toBe(1);
    expect(breaker.getSnapshot().failureCount).toBe(2);
  });

  it('counts each concurrent integrated execution once with reused provider containers', async () => {
    const adapter = new OfflineActualBase();
    adapter.results = [err(failure)];
    const integration = new CliCircuitBreakerIntegration([adapter]);
    const results = await Promise.all([
      integration.execute(adapter, task),
      integration.execute(adapter, task),
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.ok)).toEqual([false, false]);
    expect(adapter.calls).toBe(2);
    expect(breaker.getSnapshot().failureCount).toBe(2);
  });

  it('retains integration admission when the shared breaker is open', async () => {
    for (let i = 0; i < breaker.getSnapshot().config.failureThreshold; i++)
      breaker.recordFailure('unknown');
    const adapter = new OfflineActualBase();
    expect((await new CliCircuitBreakerIntegration([adapter]).execute(adapter, task)).ok).toBe(
      false
    );
    expect(adapter.calls).toBe(0);
    expect(breaker.getSnapshot().failureCount).toBe(breaker.getSnapshot().config.failureThreshold);
  });

  it('counts an actual OpenCode explicit-model success once without losing model attribution', async () => {
    vi.useFakeTimers();
    const openCodeBreaker = shared.getArmBreaker('opencode');
    for (let i = 0; i < openCodeBreaker.getSnapshot().config.failureThreshold; i++) {
      openCodeBreaker.recordFailure('unknown');
    }
    vi.advanceTimersByTime(openCodeBreaker.getSnapshot().config.resetTimeoutMs + 1);
    expect(openCodeBreaker.getState()).toBe('half-open');
    const adapter = new OpenCodeCliAdapter();
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const executeTask = vi
      .spyOn(adapter, 'executeTask')
      .mockResolvedValue(ok({ text: 'TEST_FAKE success' }));
    const model = 'anthropic/TEST_FAKE-model';
    const result = await new CliCircuitBreakerIntegration([adapter]).execute(adapter, {
      content: 'TEST_FAKE offline explicit success',
      model,
    });
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.response).toMatchObject({ text: 'TEST_FAKE success', model });
    expect(openCodeBreaker.getSnapshot().state).toBe('half-open');
    expect(openCodeBreaker.getSnapshot().successCount).toBe(1);
  });
});
