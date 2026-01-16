/**
 * nexus-agents/adapters - Stream Operators
 *
 * Stream transformation operators for AsyncIterables.
 * Provides filter, map, merge, concat, buffer, and other stream operations.
 */

import { TimeoutError } from '../core/index.js';
import {
  StreamError,
  StreamCancelledError,
  createStream,
  type CreateStreamOptions,
} from './streaming-types.js';

// Re-export helper functions for backward compatibility
export {
  take,
  skip,
  concatStreams,
  fromArray,
  tapStream,
  reduceStream,
} from './stream-operators-helpers.js';

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
