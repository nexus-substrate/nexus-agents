/**
 * E2E Test Utilities
 *
 * Common utilities for end-to-end testing.
 * Extends existing testing infrastructure with E2E-specific helpers.
 *
 * @module testing/e2e/utils
 */

import type { Result } from '../../../core/index.js';
import { getTimeProvider, getRandomProvider, toError } from '../../../core/index.js';
import { sleep } from '../../../utils/async-utils.js';

/**
 * Assert that a Result is Ok and return the value.
 * Throws if the Result is an error.
 */
export function assertOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected Ok but got Err: ${String(result.error)}`);
  }
  return result.value;
}

/**
 * Assert that a Result is Err and return the error.
 * Throws if the Result is Ok.
 */
export function assertErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error(`Expected Err but got Ok: ${String(result.value)}`);
  }
  return result.error;
}

/**
 * Measure the latency of an async operation.
 */
export async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { result, ms };
}

/**
 * Execute with timeout. Throws if operation exceeds timeout.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${String(ms)}ms`));
      }, ms);
    }),
  ]);
}

/**
 * Execute an operation with guaranteed cleanup.
 */
export async function withCleanup<T>(
  fn: () => Promise<T>,
  cleanup: () => Promise<void>
): Promise<T> {
  try {
    return await fn();
  } finally {
    await cleanup();
  }
}

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Retry an operation with exponential backoff.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = toError(error);
      const hasMoreAttempts = attempt < maxAttempts;
      if (hasMoreAttempts) {
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}

// Re-export from canonical source for backward compatibility
export { sleep } from '../../../utils/async-utils.js';

/**
 * Wait for a condition to be true.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 100 } = options;
  const start = getTimeProvider().now();

  while (getTimeProvider().now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`waitFor timed out after ${String(timeoutMs)}ms`);
}

/**
 * Create a deferred promise for testing async flows.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Capture console output during test execution.
 */
/* eslint-disable no-console */
export function captureConsole(): {
  logs: string[];
  errors: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}
/* eslint-enable no-console */

/**
 * Generate a unique test ID for isolation.
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`;
}

/**
 * Assert that two values are approximately equal (for timing tests).
 */
export function assertApproximatelyEqual(
  actual: number,
  expected: number,
  tolerance: number
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Expected ${String(actual)} to be approximately ${String(expected)} (±${String(tolerance)}), ` +
        `but difference was ${String(diff)}`
    );
  }
}
