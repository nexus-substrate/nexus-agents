/**
 * nexus-agents/adapters - Stream Operators Helpers
 *
 * Helper functions for stream operations extracted for maintainability.
 */

import { type Result, ok, err } from '../core/index.js';
import { StreamError, StreamCancelledError } from './streaming-types.js';

/**
 * Takes the first N chunks from a stream.
 * @param stream - The source stream
 * @param count - Number of chunks to take
 * @param options - Options including optional AbortSignal
 * @returns Stream of first N chunks
 */
export async function* take<T>(
  stream: AsyncIterable<T>,
  count: number,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  if (count <= 0) {
    return;
  }

  let taken = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('take aborted');
    }

    yield chunk;
    taken++;

    if (taken >= count) {
      return;
    }
  }
}

/**
 * Skips the first N chunks from a stream.
 * @param stream - The source stream
 * @param count - Number of chunks to skip
 * @param options - Options including optional AbortSignal
 * @returns Stream with first N chunks skipped
 */
export async function* skip<T>(
  stream: AsyncIterable<T>,
  count: number,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  let skipped = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('skip aborted');
    }

    if (skipped < count) {
      skipped++;
      continue;
    }

    yield chunk;
  }
}

/**
 * Concatenates multiple streams sequentially.
 * @param streams - The streams to concatenate
 * @param options - Options including optional AbortSignal
 * @returns Concatenated stream
 */
export async function* concatStreams<T>(
  streams: AsyncIterable<T>[],
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  for (const stream of streams) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('concat aborted');
    }

    yield* stream;
  }
}

/**
 * Creates a stream from an array of values.
 * @param values - The values to stream
 * @param options - Options including optional delay between chunks
 * @returns Stream of values
 */
export async function* fromArray<T>(
  values: T[],
  options: { delayMs?: number; signal?: AbortSignal } = {}
): AsyncIterable<T> {
  for (const value of values) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('fromArray aborted');
    }

    if (options.delayMs !== undefined && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    yield value;
  }
}

/**
 * Taps into a stream without modifying it (for side effects like logging).
 * @param stream - The source stream
 * @param fn - Side effect function called for each chunk
 * @param options - Options including optional AbortSignal
 * @returns Original stream unchanged
 */
export async function* tapStream<T>(
  stream: AsyncIterable<T>,
  fn: (chunk: T, index: number) => void | Promise<void>,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  let index = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('tap aborted');
    }

    await fn(chunk, index);
    yield chunk;
    index++;
  }
}

/**
 * Reduces a stream to a single value.
 * @param stream - The source stream
 * @param reducer - Reducer function
 * @param initialValue - Initial accumulator value
 * @param options - Options including optional AbortSignal
 * @returns Result containing the final value or error
 */
export async function reduceStream<T, U>(
  stream: AsyncIterable<T>,
  reducer: (accumulator: U, chunk: T, index: number) => U | Promise<U>,
  initialValue: U,
  options: { signal?: AbortSignal } = {}
): Promise<Result<U, StreamError>> {
  let accumulator = initialValue;
  let index = 0;

  try {
    for await (const chunk of stream) {
      if (options.signal?.aborted === true) {
        return err(new StreamError('Reduce aborted'));
      }

      accumulator = await reducer(accumulator, chunk, index);
      index++;
    }

    return ok(accumulator);
  } catch (error) {
    return err(
      new StreamError('Failed to reduce stream', {
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    );
  }
}
