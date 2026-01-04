/**
 * @nexus-agents/adapters - Stream Operators
 *
 * Stream transformation operators for AsyncIterables.
 * Provides filter, map, merge, concat, buffer, and other stream operations.
 */

import { type Result, ok, err } from '../core/index.js';
import { TimeoutError } from '../core/index.js';
import {
  StreamError,
  StreamCancelledError,
  createStream,
  type CreateStreamOptions,
} from './streaming.js';

/**
 * Transforms stream chunks using a mapping function.
 * @param stream - The source stream
 * @param fn - Transformation function
 * @param options - Options including optional AbortSignal
 * @returns Transformed stream
 */
export async function* transformStream<T, U>(
  stream: AsyncIterable<T>,
  fn: (chunk: T, index: number) => U | Promise<U>,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<U> {
  let index = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('Transform aborted');
    }

    yield await fn(chunk, index);
    index++;
  }
}

/**
 * Merges multiple streams into a single stream.
 * Chunks are yielded as they arrive from any source.
 * @param streams - The streams to merge
 * @param options - Options including optional AbortSignal
 * @returns Merged stream
 */
export async function* mergeStreams<T>(
  streams: AsyncIterable<T>[],
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  if (streams.length === 0) {
    return;
  }

  const streamOptions: CreateStreamOptions = {};
  if (options.signal) {
    streamOptions.signal = options.signal;
  }
  const [controller, merged] = createStream<T>(streamOptions);
  let activeCount = streams.length;

  // Start consuming all streams in parallel
  const consumers = streams.map(async (stream, streamIndex) => {
    try {
      for await (const chunk of stream) {
        if (options.signal?.aborted === true) {
          break;
        }
        controller.push(chunk);
      }
    } catch (error) {
      if (error instanceof StreamCancelledError) {
        // Propagate cancellation
        controller.cancel(`Stream ${String(streamIndex)} was cancelled`);
        return;
      }
      controller.error(error instanceof Error ? error : new Error(String(error)));
      return;
    } finally {
      activeCount--;
      if (activeCount === 0) {
        controller.complete();
      }
    }
  });

  // Start all consumers without blocking
  void Promise.all(consumers);

  yield* merged;
}

/**
 * Takes chunks from a stream until a predicate returns true.
 * @param stream - The source stream
 * @param predicate - Function that returns true to stop taking
 * @param options - Options including whether to include the matching chunk
 * @returns Stream of chunks up to (and optionally including) the match
 */
export async function* takeUntil<T>(
  stream: AsyncIterable<T>,
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
  options: { signal?: AbortSignal; inclusive?: boolean } = {}
): AsyncIterable<T> {
  let index = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('takeUntil aborted');
    }

    const shouldStop = await predicate(chunk, index);

    if (shouldStop) {
      if (options.inclusive === true) {
        yield chunk;
      }
      return;
    }

    yield chunk;
    index++;
  }
}

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
 * Filters stream chunks based on a predicate.
 * @param stream - The source stream
 * @param predicate - Function that returns true to keep the chunk
 * @param options - Options including optional AbortSignal
 * @returns Filtered stream
 */
export async function* filterStream<T>(
  stream: AsyncIterable<T>,
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  let index = 0;

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('filter aborted');
    }

    if (await predicate(chunk, index)) {
      yield chunk;
    }

    index++;
  }
}

/**
 * Adds a timeout to a stream. If no chunk is received within the timeout,
 * the stream throws a TimeoutError.
 * @param stream - The source stream
 * @param timeoutMs - Timeout in milliseconds
 * @param options - Options including optional AbortSignal
 * @returns Stream with timeout applied
 */
export async function* withTimeout<T>(
  stream: AsyncIterable<T>,
  timeoutMs: number,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T> {
  const iterator = stream[Symbol.asyncIterator]();

  try {
    let running = true;
    while (running) {
      if (options.signal?.aborted === true) {
        throw new StreamCancelledError('withTimeout aborted');
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          iterator.next().then((res) => {
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
            }
            return res;
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(
                new TimeoutError(`Stream timed out after ${String(timeoutMs)}ms`, {
                  context: { timeoutMs },
                })
              );
            }, timeoutMs);
          }),
        ]);

        if (result.done === true) {
          running = false;
        } else {
          yield result.value;
        }
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    }
  } finally {
    // Ensure the iterator is properly closed
    if (iterator.return !== undefined) {
      await iterator.return();
    }
  }
}

/**
 * Buffers stream chunks into groups of a specified size.
 * @param stream - The source stream
 * @param size - Buffer size
 * @param options - Options including optional AbortSignal
 * @returns Stream of chunk arrays
 */
export async function* bufferStream<T>(
  stream: AsyncIterable<T>,
  size: number,
  options: { signal?: AbortSignal } = {}
): AsyncIterable<T[]> {
  if (size <= 0) {
    throw new StreamError('Buffer size must be positive');
  }

  let buffer: T[] = [];

  for await (const chunk of stream) {
    if (options.signal?.aborted === true) {
      throw new StreamCancelledError('buffer aborted');
    }

    buffer.push(chunk);

    if (buffer.length >= size) {
      yield buffer;
      buffer = [];
    }
  }

  // Yield remaining chunks
  if (buffer.length > 0) {
    yield buffer;
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
