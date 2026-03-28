/**
 * Tests for CLI Retry Loop
 *
 * TDD: Written before implementation per Issue #1596.
 * Verifies unified retry logic with optional circuit breaker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../core/index.js';
import type { Result } from '../core/index.js';
import type { CliResponse, CliError } from './types.js';
import type { ICircuitBreaker } from './circuit-breaker-types.js';
import {
  executeCliRetryLoop,
  calculateBackoffDelay,
  isRetryableError,
  categorizeError,
} from './cli-retry-loop.js';
import type { CliRetryLoopConfig } from './cli-retry-loop.js';

// Deterministic randomness for backoff jitter
vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../core/index.js')>();
  return {
    ...original,
    getRandomProvider: () => ({ random: () => 0.5 }),
  };
});

function makeConfig(overrides?: Partial<CliRetryLoopConfig>): CliRetryLoopConfig {
  return {
    maxRetries: 2,
    allowRetry: true,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    cli: 'claude',
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
      setLevel: vi.fn(),
    },
    ...overrides,
  };
}

function makeResponse(text = 'ok'): CliResponse {
  return { text };
}

function makeError(code: CliError['code'] = 'TIMEOUT', retryable = true): CliError {
  return { code, message: `Error: ${code}`, cli: 'claude', retryable };
}

function makeCircuitBreaker(state: 'closed' | 'open' | 'half-open' = 'closed'): ICircuitBreaker {
  return {
    execute: vi.fn(),
    getState: vi.fn().mockReturnValue(state),
    getSnapshot: vi.fn(),
    reset: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
  };
}

describe('executeCliRetryLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns success on first attempt with retryCount 0', async () => {
    const executeFn = vi.fn().mockResolvedValue(ok(makeResponse()));
    const config = makeConfig();

    const result = await executeCliRetryLoop(executeFn, config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.retryCount).toBe(0);
      expect(result.value.response.text).toBe('ok');
    }
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on attempt 2', async () => {
    const executeFn = vi
      .fn<() => Promise<Result<CliResponse, CliError>>>()
      .mockResolvedValueOnce(err(makeError('TIMEOUT')))
      .mockResolvedValueOnce(ok(makeResponse('recovered')));
    const config = makeConfig();

    const promise = executeCliRetryLoop(executeFn, config);
    // Advance past backoff delay
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.retryCount).toBe(1);
      expect(result.value.response.text).toBe('recovered');
    }
    expect(executeFn).toHaveBeenCalledTimes(2);
  });

  it('exhausts max retries and returns last error', async () => {
    const executeFn = vi.fn().mockResolvedValue(err(makeError('TIMEOUT')));
    const config = makeConfig({ maxRetries: 2 });

    const promise = executeCliRetryLoop(executeFn, config);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
    // 1 initial + 2 retries = 3 attempts
    expect(executeFn).toHaveBeenCalledTimes(3);
  });

  it('stops immediately on non-retryable error', async () => {
    const executeFn = vi.fn().mockResolvedValue(err(makeError('NOT_AUTHENTICATED', false)));
    const config = makeConfig({ maxRetries: 3 });

    const result = await executeCliRetryLoop(executeFn, config);

    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('makes exactly 1 attempt when allowRetry is false', async () => {
    const executeFn = vi.fn().mockResolvedValue(err(makeError('TIMEOUT')));
    const config = makeConfig({ allowRetry: false });

    const result = await executeCliRetryLoop(executeFn, config);

    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when circuit breaker is open', async () => {
    const cb = makeCircuitBreaker('closed');
    // After first failure + recordFailure, circuit opens
    const getStateMock = cb.getState as ReturnType<typeof vi.fn>;
    getStateMock.mockReturnValue('open');

    const executeFn = vi
      .fn<() => Promise<Result<CliResponse, CliError>>>()
      .mockResolvedValueOnce(err(makeError('TIMEOUT')))
      .mockResolvedValueOnce(ok(makeResponse()));
    const config = makeConfig({ circuitBreaker: cb, maxRetries: 3 });

    const promise = executeCliRetryLoop(executeFn, config);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(result.ok).toBe(false);
    // Only 1 attempt — circuit opened before retry
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('calls recordFailure on each failure when circuit breaker present', async () => {
    const cb = makeCircuitBreaker('closed');
    const executeFn = vi.fn().mockResolvedValue(err(makeError('RATE_LIMITED')));
    const config = makeConfig({ circuitBreaker: cb, maxRetries: 1 });

    const promise = executeCliRetryLoop(executeFn, config);
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(cb.recordFailure).toHaveBeenCalledTimes(2);
    expect(cb.recordFailure).toHaveBeenCalledWith('rate_limit');
  });

  it('does NOT call recordSuccess (caller responsibility)', async () => {
    const cb = makeCircuitBreaker('closed');
    const executeFn = vi.fn().mockResolvedValue(ok(makeResponse()));
    const config = makeConfig({ circuitBreaker: cb });

    await executeCliRetryLoop(executeFn, config);

    expect(cb.recordSuccess).not.toHaveBeenCalled();
  });

  it('makes no circuit breaker calls when circuitBreaker is undefined', async () => {
    const executeFn = vi.fn().mockResolvedValue(err(makeError('TIMEOUT')));
    const config = makeConfig({ maxRetries: 1 });
    // No circuitBreaker in config

    const promise = executeCliRetryLoop(executeFn, config);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    // Should still retry without circuit breaker
    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(2);
  });

  it('retries CONNECTION_ERROR and RATE_LIMITED codes', async () => {
    const executeFn = vi
      .fn<() => Promise<Result<CliResponse, CliError>>>()
      .mockResolvedValueOnce(err(makeError('CONNECTION_ERROR')))
      .mockResolvedValueOnce(err(makeError('RATE_LIMITED')))
      .mockResolvedValueOnce(ok(makeResponse()));
    const config = makeConfig({ maxRetries: 3 });

    const promise = executeCliRetryLoop(executeFn, config);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable error codes like EXECUTION_ERROR', async () => {
    const executeFn = vi
      .fn<() => Promise<Result<CliResponse, CliError>>>()
      .mockResolvedValueOnce(err(makeError('EXECUTION_ERROR', false)));
    const config = makeConfig({ maxRetries: 3 });

    const result = await executeCliRetryLoop(executeFn, config);

    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('maxRetries 0 with allowRetry true makes exactly 1 attempt', async () => {
    const executeFn = vi.fn().mockResolvedValue(err(makeError('TIMEOUT')));
    const config = makeConfig({ maxRetries: 0, allowRetry: true });

    const result = await executeCliRetryLoop(executeFn, config);

    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry retryable flag true with non-retryable error code', async () => {
    // Double-guard: error.retryable=true but code is not in RETRYABLE_ERROR_CODES
    const executeFn = vi
      .fn<() => Promise<Result<CliResponse, CliError>>>()
      .mockResolvedValueOnce(err(makeError('EXECUTION_ERROR', true)))
      .mockResolvedValueOnce(ok(makeResponse()));
    const config = makeConfig({ maxRetries: 2 });

    const result = await executeCliRetryLoop(executeFn, config);

    // Should NOT retry because isRetryableError('EXECUTION_ERROR') is false
    expect(result.ok).toBe(false);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('propagates thrown executeFn as rejection (not Result err)', async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error('unexpected crash'));
    const config = makeConfig();

    await expect(executeCliRetryLoop(executeFn, config)).rejects.toThrow('unexpected crash');
  });
});

describe('isRetryableError', () => {
  it('returns true for TIMEOUT, RATE_LIMITED, CONNECTION_ERROR', () => {
    expect(isRetryableError('TIMEOUT')).toBe(true);
    expect(isRetryableError('RATE_LIMITED')).toBe(true);
    expect(isRetryableError('CONNECTION_ERROR')).toBe(true);
  });

  it('returns false for non-retryable codes', () => {
    expect(isRetryableError('EXECUTION_ERROR')).toBe(false);
    expect(isRetryableError('NOT_FOUND')).toBe(false);
    expect(isRetryableError('NOT_AUTHENTICATED')).toBe(false);
    expect(isRetryableError('PARSE_ERROR')).toBe(false);
    expect(isRetryableError('UNKNOWN')).toBe(false);
  });
});

describe('categorizeError', () => {
  it('maps TIMEOUT to timeout', () => {
    expect(categorizeError(makeError('TIMEOUT'))).toBe('timeout');
  });

  it('maps RATE_LIMITED to rate_limit', () => {
    expect(categorizeError(makeError('RATE_LIMITED'))).toBe('rate_limit');
  });

  it('maps NOT_AUTHENTICATED to authentication', () => {
    expect(categorizeError(makeError('NOT_AUTHENTICATED'))).toBe('authentication');
  });

  it('maps CONNECTION_ERROR to connection', () => {
    expect(categorizeError(makeError('CONNECTION_ERROR'))).toBe('connection');
  });

  it('maps EXECUTION_ERROR to unknown (default)', () => {
    expect(categorizeError(makeError('EXECUTION_ERROR'))).toBe('unknown');
  });

  it('maps PARSE_ERROR to unknown (default)', () => {
    expect(categorizeError(makeError('PARSE_ERROR'))).toBe('unknown');
  });
});

describe('calculateBackoffDelay', () => {
  // Mock pins getRandomProvider().random() to 0.5

  it('returns base delay on attempt 1 plus jitter', () => {
    // attempt=1: baseDelay * 2^0 = 1000, jitter = 0.5 * 0.3 * 1000 = 150
    const result = calculateBackoffDelay(1, 1000, 30_000);
    expect(result).toBe(1150);
  });

  it('doubles delay on each subsequent attempt', () => {
    // attempt=2: 1000 * 2^1 = 2000, jitter = 0.5 * 0.3 * 2000 = 300
    const result = calculateBackoffDelay(2, 1000, 30_000);
    expect(result).toBe(2300);

    // attempt=3: 1000 * 2^2 = 4000, jitter = 0.5 * 0.3 * 4000 = 600
    const result3 = calculateBackoffDelay(3, 1000, 30_000);
    expect(result3).toBe(4600);
  });

  it('caps delay at maxDelayMs', () => {
    // attempt=10: 1000 * 2^9 = 512000, exceeds max
    const result = calculateBackoffDelay(10, 1000, 30_000);
    expect(result).toBe(30_000);
  });

  it('lower bound is always >= exponential base (no negative jitter)', () => {
    // With random()=0.5, jitter is always positive: 0.5 * 0.3 * base = 15%
    // Even with random()=0, jitter=0, so delay >= exponentialDelay
    const result = calculateBackoffDelay(1, 100, 50_000);
    expect(result).toBeGreaterThanOrEqual(100);
  });

  it('upper bound of jitter is 30% of exponential delay', () => {
    // Max jitter: random()=1.0 → 1.0 * 0.3 * 1000 = 300
    // So max delay for attempt 1 = 1000 + 300 = 1300
    // With our mock (random=0.5): 1000 + 150 = 1150
    const result = calculateBackoffDelay(1, 1000, 30_000);
    expect(result).toBeLessThanOrEqual(1300); // 1000 * 1.3
    expect(result).toBeGreaterThanOrEqual(1000); // no negative jitter
  });
});
