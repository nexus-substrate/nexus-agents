/** Actual BaseCliAdapter/retry-loop accounting with an offline execution boundary. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '../core/index.js';
import { BaseCliAdapter } from './base-adapter.js';
import { breakerKeys } from './breaker-key.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import { createCallerAbortCliError, createCallerInputCliError } from './cli-error-helpers.js';
import type { CliError, CliResponse, ModelInfo } from './types.js';

class OfflineCliAdapter extends BaseCliAdapter {
  readonly name = 'claude';
  readonly transport = 'subprocess';
  readonly run = vi.fn<() => Promise<Result<CliResponse, CliError>>>();

  executeTask(): Promise<Result<CliResponse, CliError>> {
    return this.run();
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

describe('BaseCliAdapter shared breaker outcome ownership (#7532)', () => {
  const breaker = getDefaultCliCircuitBreakerRegistry().getArmBreaker(
    breakerKeys.forArm({ name: 'claude' })
  );

  beforeEach(() => {
    breaker.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    breaker.reset();
  });

  it('preserves typed caller-input provenance without charging shared health', async () => {
    const invalidInput = createCallerInputCliError('Invalid requested model', 'claude');
    const adapter = new OfflineCliAdapter();
    adapter.run.mockResolvedValue(err(invalidInput));
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');

    const result = await adapter.execute({ content: 'offline input validation' });

    expect(result).toEqual(err(invalidInput));
    if (!result.ok) expect(result.error.cause).toBe(invalidInput.cause);
    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(recordFailure).not.toHaveBeenCalled();
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(breaker.getSnapshot().failureCount).toBe(0);
  });

  it.each([
    { label: 'caller cancellation', reason: 'cancelled', failures: 0, category: undefined },
    {
      label: 'caller deadline',
      reason: new DOMException('Expired', 'TimeoutError'),
      failures: 1,
      category: 'timeout',
    },
  ])('keeps $label accounting distinct', async ({ reason, failures, category }) => {
    const adapter = new OfflineCliAdapter();
    const failure = createCallerAbortCliError(reason, 'Offline aborted request', 'claude');
    adapter.run.mockResolvedValue(err(failure));
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');

    const result = await adapter.execute(
      { content: 'offline cancellation' },
      { allowRetry: false }
    );

    expect(result).toEqual(err(failure));
    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(recordFailure).toHaveBeenCalledTimes(failures);
    if (category !== undefined) expect(recordFailure).toHaveBeenCalledWith(category);
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(breaker.getSnapshot().failureCount).toBe(failures);
  });

  it('records one provider failure and one subsequent success on the same shared arm', async () => {
    const adapter = new OfflineCliAdapter();
    const providerFailure: CliError = {
      code: 'RATE_LIMITED',
      message: 'Offline provider rate limit',
      cli: 'claude',
      retryable: true,
    };
    adapter.run
      .mockResolvedValueOnce(err(providerFailure))
      .mockResolvedValueOnce(ok({ text: 'ok' }));
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');

    const failed = await adapter.execute({ content: 'offline request' }, { allowRetry: false });
    expect(failed).toEqual(err(providerFailure));
    expect(breaker.getSnapshot().failureCount).toBe(1);
    const succeeded = await adapter.execute({ content: 'offline request' });

    expect(succeeded.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledTimes(2);
    expect(recordFailure).toHaveBeenCalledExactlyOnceWith('rate_limit');
    expect(recordSuccess).toHaveBeenCalledTimes(1);
    expect(breaker.getSnapshot().failureCount).toBe(0);
  });

  it('does not charge a pre-execution access-mode refusal', async () => {
    const adapter = new OfflineCliAdapter();
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');

    const result = await adapter.execute({
      content: 'offline restricted request',
      accessMode: 'read-only-analysis',
    });

    expect(result.ok).toBe(false);
    expect(adapter.run).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  it('preserves a pre-retry initialization exception without inventing a provider outcome', async () => {
    const adapter = new OfflineCliAdapter();
    const failure = new Error('Offline initialization failure');
    vi.spyOn(adapter, 'initialize').mockRejectedValue(failure);
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');

    await expect(adapter.execute({ content: 'offline request' })).rejects.toBe(failure);

    expect(adapter.run).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
    expect(recordSuccess).not.toHaveBeenCalled();
  });
});
