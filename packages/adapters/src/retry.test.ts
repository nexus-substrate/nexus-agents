/**
 * @nexus-agents/adapters - Retry Logic Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withRetryWrapper,
  isRetryableError,
  calculateDelay,
  sleep,
  RetryExhaustedError,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './retry.js';
import { NexusError, ErrorCode } from '@nexus-agents/core';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG).toEqual({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterFactor: 0.1,
      });
    });
  });

  describe('calculateDelay', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterFactor: 0,
    };

    it('returns base delay for first attempt', () => {
      const delay = calculateDelay(0, config);
      expect(delay).toBe(1000);
    });

    it('doubles delay for each subsequent attempt', () => {
      expect(calculateDelay(0, config)).toBe(1000);
      expect(calculateDelay(1, config)).toBe(2000);
      expect(calculateDelay(2, config)).toBe(4000);
      expect(calculateDelay(3, config)).toBe(8000);
    });

    it('caps delay at maxDelayMs', () => {
      const shortMaxConfig: RetryConfig = { ...config, maxDelayMs: 5000 };
      expect(calculateDelay(0, shortMaxConfig)).toBe(1000);
      expect(calculateDelay(1, shortMaxConfig)).toBe(2000);
      expect(calculateDelay(2, shortMaxConfig)).toBe(4000);
      expect(calculateDelay(3, shortMaxConfig)).toBe(5000); // Capped
      expect(calculateDelay(10, shortMaxConfig)).toBe(5000); // Capped
    });

    it('applies jitter within expected range', () => {
      const jitterConfig: RetryConfig = { ...config, jitterFactor: 0.5 };
      const samples: number[] = [];

      // Take multiple samples to verify randomness
      for (let i = 0; i < 100; i++) {
        samples.push(calculateDelay(0, jitterConfig));
      }

      // With 50% jitter, delays should be between 500 and 1500
      const min = Math.min(...samples);
      const max = Math.max(...samples);

      expect(min).toBeGreaterThanOrEqual(500);
      expect(max).toBeLessThanOrEqual(1500);

      // Verify there's actual variation
      expect(max - min).toBeGreaterThan(0);
    });

    it('returns non-negative values', () => {
      const highJitterConfig: RetryConfig = { ...config, jitterFactor: 1.0 };
      for (let i = 0; i < 100; i++) {
        expect(calculateDelay(0, highJitterConfig)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('sleep', () => {
    it('resolves after specified delay', async () => {
      const sleepPromise = sleep(1000);
      vi.advanceTimersByTime(999);
      await Promise.resolve(); // Let microtasks run
      vi.advanceTimersByTime(1);
      await sleepPromise;
    });

    it('handles zero delay', async () => {
      // Use real timers for this test since zero-delay setTimeout
      // with fake timers needs explicit timer advancement
      vi.useRealTimers();
      await sleep(0);
      vi.useFakeTimers();
    });
  });

  describe('isRetryableError', () => {
    describe('returns false for', () => {
      it('null', () => {
        expect(isRetryableError(null)).toBe(false);
      });

      it('undefined', () => {
        expect(isRetryableError(undefined)).toBe(false);
      });

      it('HTTP 400 Bad Request', () => {
        expect(isRetryableError({ status: 400 })).toBe(false);
        expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      });

      it('HTTP 401 Unauthorized', () => {
        expect(isRetryableError({ status: 401 })).toBe(false);
      });

      it('HTTP 403 Forbidden', () => {
        expect(isRetryableError({ status: 403 })).toBe(false);
      });

      it('HTTP 404 Not Found', () => {
        expect(isRetryableError({ status: 404 })).toBe(false);
      });

      it('HTTP 409 Conflict', () => {
        expect(isRetryableError({ status: 409 })).toBe(false);
      });

      it('HTTP 422 Unprocessable Entity', () => {
        expect(isRetryableError({ status: 422 })).toBe(false);
      });

      it('generic errors without network indicators', () => {
        expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
      });

      it('validation errors', () => {
        const error = new NexusError('Invalid input', {
          code: ErrorCode.VALIDATION_ERROR,
        });
        expect(isRetryableError(error)).toBe(false);
      });
    });

    describe('returns true for', () => {
      it('HTTP 429 Too Many Requests', () => {
        expect(isRetryableError({ status: 429 })).toBe(true);
        expect(isRetryableError({ response: { status: 429 } })).toBe(true);
        expect(isRetryableError({ statusCode: 429 })).toBe(true);
      });

      it('HTTP 500 Internal Server Error', () => {
        expect(isRetryableError({ status: 500 })).toBe(true);
      });

      it('HTTP 502 Bad Gateway', () => {
        expect(isRetryableError({ status: 502 })).toBe(true);
      });

      it('HTTP 503 Service Unavailable', () => {
        expect(isRetryableError({ status: 503 })).toBe(true);
      });

      it('HTTP 504 Gateway Timeout', () => {
        expect(isRetryableError({ status: 504 })).toBe(true);
      });

      it('HTTP 408 Request Timeout', () => {
        expect(isRetryableError({ status: 408 })).toBe(true);
      });

      it('ECONNRESET errors', () => {
        expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
        expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true);
      });

      it('ECONNREFUSED errors', () => {
        expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      });

      it('ETIMEDOUT errors', () => {
        expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      });

      it('ENOTFOUND errors', () => {
        expect(isRetryableError(new Error('getaddrinfo ENOTFOUND'))).toBe(true);
      });

      it('timeout errors', () => {
        expect(isRetryableError(new Error('Request timeout'))).toBe(true);
        expect(isRetryableError(new Error('Connection timed out'))).toBe(true);
      });

      it('network errors', () => {
        expect(isRetryableError(new Error('Network error'))).toBe(true);
        expect(isRetryableError(new Error('Network request failed'))).toBe(true);
      });

      it('socket hang up errors', () => {
        expect(isRetryableError(new Error('socket hang up'))).toBe(true);
      });

      it('aborted request errors', () => {
        expect(isRetryableError(new Error('Request aborted'))).toBe(true);
      });

      it('NexusError with MODEL_RATE_LIMITED code', () => {
        const error = new NexusError('Rate limited', {
          code: ErrorCode.MODEL_RATE_LIMITED,
        });
        expect(isRetryableError(error)).toBe(true);
      });

      it('NexusError with MODEL_TIMEOUT code', () => {
        const error = new NexusError('Timeout', {
          code: ErrorCode.MODEL_TIMEOUT,
        });
        expect(isRetryableError(error)).toBe(true);
      });

      it('NexusError with TIMEOUT_ERROR code', () => {
        const error = new NexusError('Timeout', {
          code: ErrorCode.TIMEOUT_ERROR,
        });
        expect(isRetryableError(error)).toBe(true);
      });

      it('NexusError with RATE_LIMIT_ERROR code', () => {
        const error = new NexusError('Rate limit', {
          code: ErrorCode.RATE_LIMIT_ERROR,
        });
        expect(isRetryableError(error)).toBe(true);
      });
    });
  });

  describe('RetryExhaustedError', () => {
    it('contains attempt count and last error', () => {
      const lastError = new Error('Final failure');
      const error = new RetryExhaustedError(3, lastError);

      expect(error.name).toBe('RetryExhaustedError');
      expect(error.attempts).toBe(3);
      expect(error.lastError).toBe(lastError);
      expect(error.message).toBe('All 3 retry attempts exhausted');
      expect(error.code).toBe(ErrorCode.MODEL_ERROR);
    });

    it('handles non-Error last errors', () => {
      const error = new RetryExhaustedError(2, 'string error');

      expect(error.attempts).toBe(2);
      expect(error.lastError).toBe('string error');
      expect(error.cause).toBeUndefined();
    });

    it('sets cause when lastError is an Error', () => {
      const cause = new Error('Cause');
      const error = new RetryExhaustedError(1, cause);

      expect(error.cause).toBe(cause);
    });

    it('serializes to JSON correctly', () => {
      const lastError = new Error('Final failure');
      const error = new RetryExhaustedError(3, lastError);
      const json = error.toJSON();

      expect(json.name).toBe('RetryExhaustedError');
      expect(json.code).toBe(ErrorCode.MODEL_ERROR);
      expect(json.context).toEqual({
        attempts: 3,
        lastErrorMessage: 'Final failure',
      });
    });
  });

  describe('withRetry', () => {
    it('returns success on first attempt if operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = withRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable errors', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });

      // Advance through retries
      await vi.advanceTimersByTimeAsync(100); // First retry delay
      await vi.advanceTimersByTimeAsync(200); // Second retry delay

      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('stops retrying on non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue({ status: 404 });

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RetryExhaustedError);
        expect(result.error.attempts).toBe(1);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('returns error when all retries exhausted', async () => {
      const operation = vi.fn().mockRejectedValue({ status: 503 });

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RetryExhaustedError);
        expect(result.error.attempts).toBe(3); // 1 initial + 2 retries
      }
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('uses custom isRetryable predicate', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('custom'))
        .mockResolvedValue('success');

      const isRetryable = vi.fn().mockReturnValue(true);

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 1, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
        isRetryable,
      });

      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(isRetryable).toHaveBeenCalledWith(expect.any(Error));
      expect(result.ok).toBe(true);
    });

    it('calls onRetry callback before each retry', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
        onRetry,
      });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);

      expect(onRetry).toHaveBeenNthCalledWith(1, {
        attempt: 1,
        maxAttempts: 4,
        delayMs: 100,
        error: { status: 503 },
      });

      expect(onRetry).toHaveBeenNthCalledWith(2, {
        attempt: 2,
        maxAttempts: 4,
        delayMs: 200,
        error: { status: 503 },
      });
    });

    it('uses default config when none provided', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = withRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(true);
    });

    it('handles zero maxRetries', async () => {
      const operation = vi.fn().mockRejectedValue({ status: 503 });

      const resultPromise = withRetry(operation, {
        config: { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.attempts).toBe(1);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withRetryWrapper', () => {
    it('wraps a function with retry logic', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const wrapped = withRetryWrapper(fn);

      const resultPromise = wrapped('arg1', 'arg2');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('result');
      }
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('retries wrapped function on failure', async () => {
      const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue('success');

      const wrapped = withRetryWrapper(fn, {
        config: { maxRetries: 1, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });

      const resultPromise = wrapped('arg');
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('preserves function arguments across retries', async () => {
      const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue('success');

      const wrapped = withRetryWrapper(fn, {
        config: { maxRetries: 1, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
      });

      const resultPromise = wrapped('a', 1, { key: 'value' });
      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      expect(fn).toHaveBeenNthCalledWith(1, 'a', 1, { key: 'value' });
      expect(fn).toHaveBeenNthCalledWith(2, 'a', 1, { key: 'value' });
    });
  });
});
