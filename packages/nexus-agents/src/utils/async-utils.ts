/**
 * Async Utilities
 *
 * Centralized async helper functions for delay, timeout, and promise utilities.
 * Consolidates 9+ duplicate sleep/delay implementations across the codebase.
 *
 * @module utils/async-utils
 * (Source: LOOP H-K consolidation)
 */

// ============================================================================
// Delay / Sleep
// ============================================================================

/**
 * Creates a promise that resolves after the specified delay.
 * Alias: `delay` (both names are exported for compatibility)
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * await delay(500);  // Wait 500ms (alias)
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Alias for `sleep()` - provided for compatibility with existing code.
 */
export const delay = sleep;

// ============================================================================
// Timeout Wrapper
// ============================================================================

/**
 * Result type for withTimeout operations.
 */
export type TimeoutResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * Wraps a promise with a timeout.
 * Returns an error result if the timeout is exceeded.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Error message if timeout is exceeded
 * @returns A result object with either the value or an error
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'Request timed out after 5s'
 * );
 *
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<TimeoutResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return { ok: true, value: result };
  } catch (error) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// Promise Utilities
// ============================================================================

/**
 * Executes promises in sequence, one at a time.
 *
 * @param tasks - Array of functions that return promises
 * @returns Array of results in order
 *
 * @example
 * ```typescript
 * const results = await sequence([
 *   () => fetch('/api/1'),
 *   () => fetch('/api/2'),
 * ]);
 * ```
 */
export async function sequence<T>(tasks: ReadonlyArray<() => Promise<T>>): Promise<T[]> {
  const results: T[] = [];
  for (const task of tasks) {
    results.push(await task());
  }
  return results;
}
