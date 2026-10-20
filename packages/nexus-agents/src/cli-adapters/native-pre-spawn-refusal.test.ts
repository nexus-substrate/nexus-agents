/** Typed no-spawn refusal semantics; uses no CLI/process or model invocation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigError,
  ErrorCode,
  FixedTimeProvider,
  createLogger,
  err,
  resetTimeProvider,
  setTimeProvider,
} from '../core/index.js';
import { isCallerCancelled } from '../adapters/abort-utils.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
import { CliCircuitBreaker } from './circuit-breaker.js';
import { executeCliRetryLoop } from './cli-retry-loop.js';
import {
  CliCircuitBreakerIntegration,
  getDefaultCliCircuitBreakerRegistry,
} from './cli-circuit-breaker.js';
import {
  createCallerAbortCliError,
  createCallerInputCliError,
  createHostUnavailableCliError,
  createNativePreSpawnRefusal,
  isCallerInputCliError,
  isNativePreSpawnRefusal,
  type NativePreSpawnRefusalReason,
} from './cli-error-helpers.js';
import type { CliError, ICliAdapter } from './types.js';

function refusingAdapter(error: CliError): ICliAdapter {
  return {
    name: 'claude',
    transport: 'subprocess',
    getModelInfo: () => ({ id: 'offline-model', name: 'Offline', contextWindow: 1_000 }),
    execute: vi.fn().mockResolvedValue(err(error)),
  } as unknown as ICliAdapter;
}

describe('native pre-spawn policy refusal semantics (#7533)', () => {
  let clock: FixedTimeProvider;
  const breaker = getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude');
  beforeEach(() => {
    clock = new FixedTimeProvider(1_000);
    setTimeProvider(clock);
    breaker.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    breaker.reset();
    resetTimeProvider();
  });

  it('uses a dedicated immutable bounded-reason cause, not validation or cancellation', () => {
    const error = createNativePreSpawnRefusal('expired-before-spawn', 'claude');
    expect(error).toMatchObject({ code: 'EXECUTION_ERROR', retryable: false });
    expect(error.cause).toMatchObject({
      name: 'NativePreSpawnRefusal',
      reason: 'expired-before-spawn',
    });
    expect(Object.isFrozen(error.cause)).toBe(true);
    expect(isNativePreSpawnRefusal(error)).toBe(true);
    expect(isCallerInputCliError(error)).toBe(false);
    expect(isCallerCancelled(error)).toBe(false);
  });

  it('rejects name/JSON lookalikes rather than trusting untrusted reason text', () => {
    const actual = createNativePreSpawnRefusal('permit-consumed', 'claude');
    const named = Object.assign(new Error('lookalike'), {
      name: 'NativePreSpawnRefusal',
      reason: 'permit-consumed',
    });
    const json: unknown = JSON.parse(JSON.stringify(actual.cause));
    expect(isNativePreSpawnRefusal({ cause: named })).toBe(false);
    expect(isNativePreSpawnRefusal({ cause: json })).toBe(false);
    expect(isNativePreSpawnRefusal({})).toBe(false);
    expect(
      isNativePreSpawnRefusal(createHostUnavailableCliError('Sandbox unavailable', 'claude'))
    ).toBe(false);
  });

  it('bounds even an invalid runtime reason without copying arbitrary payloads', () => {
    const error = createNativePreSpawnRefusal(
      'not-a-valid-reason' as NativePreSpawnRefusalReason,
      'claude'
    );
    expect(error.cause).toMatchObject({ reason: 'invalid-policy' });
    expect(error.message).not.toContain('not-a-valid-reason');
  });

  it('preserves the same cause and reason across the actual CLI-to-model bridge', async () => {
    const error = createNativePreSpawnRefusal('expired-before-spawn', 'claude');
    const result = await new CliToModelAdapter(refusingAdapter(error)).complete({
      messages: [{ role: 'user', content: 'offline request' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.MODEL_ERROR);
      expect(result.error.retryable).toBe(false);
      expect(result.error.cause).toBe(error.cause);
      expect(isNativePreSpawnRefusal(result.error)).toBe(true);
      expect(isCallerCancelled(result.error)).toBe(false);
    }
  });

  it.each([
    {
      label: 'pre-spawn expiry',
      error: () => createNativePreSpawnRefusal('expired-before-spawn', 'claude'),
      failures: 0,
    },
    {
      label: 'ordinary malformed input',
      error: () => createCallerInputCliError('Invalid model', 'claude'),
      failures: 0,
    },
    {
      label: 'actual operator cancellation',
      error: () => createCallerAbortCliError('cancelled', 'Caller aborted', 'claude'),
      failures: 0,
    },
    {
      label: 'launched watchdog timeout',
      error: (): CliError => ({
        code: 'TIMEOUT',
        message: 'Execution timed out',
        cli: 'claude',
        retryable: true,
      }),
      failures: 1,
    },
    {
      label: 'launched caller deadline',
      error: () =>
        createCallerAbortCliError(
          new DOMException('Expired', 'TimeoutError'),
          'Caller deadline',
          'claude'
        ),
      failures: 1,
    },
    {
      label: 'unrelated ConfigError',
      error: (): CliError => ({
        code: 'EXECUTION_ERROR',
        message: 'Provider config failure',
        cli: 'claude',
        retryable: false,
        cause: new ConfigError('Provider config failure'),
      }),
      failures: 1,
    },
    {
      label: 'existing host-unavailable condition',
      error: () => createHostUnavailableCliError('Sandbox unavailable', 'claude'),
      failures: 1,
    },
    {
      label: 'nonretryable provider error',
      error: (): CliError => ({
        code: 'EXECUTION_ERROR',
        message: 'Provider failure',
        cli: 'claude',
        retryable: false,
      }),
      failures: 1,
    },
  ])('keeps $label health attribution truthful', async ({ error, failures }) => {
    const failure = error();
    const execute = vi.fn().mockResolvedValue(err(failure));
    const recordFailure = vi.spyOn(breaker, 'recordFailure');
    const recordSuccess = vi.spyOn(breaker, 'recordSuccess');
    const result = await executeCliRetryLoop(execute, {
      allowRetry: false,
      maxRetries: 0,
      baseDelayMs: 1,
      maxDelayMs: 1,
      circuitBreaker: breaker,
      cli: 'claude',
      logger: createLogger({ component: 'offline-policy-test' }),
    });
    expect(result).toEqual(err(failure));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recordFailure).toHaveBeenCalledTimes(failures);
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(breaker.getSnapshot().failureCount).toBe(failures);
  });

  it('releases exactly its existing wrapper-owned half-open probe for a pre-spawn refusal', async () => {
    const release = vi.spyOn(CliCircuitBreaker.prototype, 'releaseHalfOpenProbe');
    let refusal = false;
    const adapter = refusingAdapter({
      code: 'TIMEOUT',
      message: 'Provider timeout',
      cli: 'claude',
      retryable: false,
    });
    vi.mocked(adapter.execute).mockImplementation(() =>
      Promise.resolve(
        err(
          refusal
            ? createNativePreSpawnRefusal('expired-before-spawn', 'claude')
            : { code: 'TIMEOUT', message: 'Provider timeout', cli: 'claude', retryable: false }
        )
      )
    );
    const wrapper = new CliCircuitBreakerIntegration([adapter], {
      enableFallback: false,
      perCliConfig: {
        claude: {
          failureThreshold: 1,
          resetTimeoutMs: 1_000,
          halfOpenMaxRequests: 1,
        },
      },
    });
    await wrapper.execute(adapter, { content: 'offline request' });
    expect(wrapper.getCircuitSnapshots().get('claude')?.state).toBe('open');
    expect(release).not.toHaveBeenCalled();
    clock.advance(1_001);
    refusal = true;
    const result = await wrapper.execute(adapter, { content: 'offline request' });
    expect(result.ok).toBe(false);
    expect(wrapper.getCircuitSnapshots().get('claude')).toMatchObject({
      state: 'half-open',
      halfOpenRequests: 0,
      // The existing breaker resets failure counts when it enters half-open.
      failureCount: 0,
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
});
