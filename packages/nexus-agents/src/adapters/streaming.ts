/**
 * nexus-agents/adapters - Streaming Utilities
 *
 * AsyncIterator-based streaming utilities for model responses.
 * Provides stream creation, backpressure handling, cancellation support,
 * and chunk collection helpers.
 *
 * For stream transformation operators (map, filter, merge, etc.),
 * see ./stream-operators.ts
 */

import { type Result, ok, err } from '../core/index.js';

// Re-export core streaming types and utilities from shared module
export {
  StreamError,
  StreamCancelledError,
  StreamController,
  createStream,
  type StreamState,
  type CreateStreamOptions,
} from './streaming-types.js';

// Import for use in this file
import { StreamError, StreamCancelledError } from './streaming-types.js';

/**
 * Collects all chunks from a stream into an array.
 * @param stream - The stream to collect
 * @param options - Options including optional AbortSignal
 * @returns Result containing collected chunks or error
 */
export async function collectStream<T>(
  stream: AsyncIterable<T>,
  options: { signal?: AbortSignal; maxChunks?: number } = {}
): Promise<Result<T[], StreamError>> {
  const chunks: T[] = [];
  const maxChunks = options.maxChunks ?? Infinity;

  try {
    for await (const chunk of stream) {
      if (options.signal?.aborted === true) {
        return err(new StreamError('Collection aborted'));
      }

      chunks.push(chunk);

      if (chunks.length >= maxChunks) {
        break;
      }
    }

    return ok(chunks);
  } catch (error) {
    if (error instanceof StreamCancelledError) {
      return err(new StreamError('Stream was cancelled during collection', { cause: error }));
    }
    return err(
      new StreamError('Failed to collect stream', {
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    );
  }
}

// Re-export all stream operators for convenience
export {
  transformStream,
  mergeStreams,
  takeUntil,
  take,
  skip,
  filterStream,
  withTimeout,
  bufferStream,
  concatStreams,
  fromArray,
  tapStream,
  reduceStream,
} from './stream-operators.js';
