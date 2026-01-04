/**
 * nexus-agents/core - Result Pattern
 *
 * Type-safe Result pattern for handling fallible operations without exceptions.
 * Inspired by Rust's Result<T, E> type.
 */

/**
 * A discriminated union representing either success (Ok) or failure (Err).
 * @template T - The success value type
 * @template E - The error value type
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Creates a successful Result containing the given value.
 * @template T - The success value type
 * @param value - The success value
 * @returns A Result in the Ok state
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed Result containing the given error.
 * @template E - The error value type
 * @param error - The error value
 * @returns A Result in the Err state
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is in the Ok state.
 * @template T - The success value type
 * @template E - The error value type
 * @param result - The Result to check
 * @returns True if the Result is Ok
 */
export function isOk<T, E>(
  result: Result<T, E>
): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

/**
 * Type guard to check if a Result is in the Err state.
 * @template T - The success value type
 * @template E - The error value type
 * @param result - The Result to check
 * @returns True if the Result is Err
 */
export function isErr<T, E>(
  result: Result<T, E>
): result is { readonly ok: false; readonly error: E } {
  return !result.ok;
}

/**
 * Transforms the success value of a Result using the provided function.
 * @template T - The original success value type
 * @template U - The transformed success value type
 * @template E - The error value type
 * @param result - The Result to transform
 * @param fn - The transformation function
 * @returns A new Result with the transformed value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Transforms the error value of a Result using the provided function.
 * @template T - The success value type
 * @template E - The original error value type
 * @template F - The transformed error value type
 * @param result - The Result to transform
 * @param fn - The transformation function
 * @returns A new Result with the transformed error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Extracts the success value from a Result.
 * @template T - The success value type
 * @template E - The error value type
 * @param result - The Result to unwrap
 * @returns The success value
 * @throws Throws an Error wrapping the error value if the Result is Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Extracts the success value from a Result, or returns a default value.
 * @template T - The success value type
 * @template E - The error value type
 * @param result - The Result to unwrap
 * @param defaultValue - The default value to return if Err
 * @returns The success value or the default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}
