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
import { NexusError, ErrorCode } from '../core/index.js';

/**
 * Error thrown when a stream operation fails.
 */
export class StreamError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'StreamError';
  }
}

/**
 * Error thrown when a stream is cancelled.
 */
export class StreamCancelledError extends NexusError {
  constructor(reason?: string) {
    super(reason ?? 'Stream was cancelled', { code: ErrorCode.INTERNAL_ERROR });
    this.name = 'StreamCancelledError';
  }
}

/**
 * State of a stream controller.
 */
export type StreamState = 'idle' | 'streaming' | 'paused' | 'cancelled' | 'completed' | 'error';

/**
 * Options for creating a stream.
 */
export interface CreateStreamOptions {
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Maximum buffer size for backpressure (default: 100) */
  maxBufferSize?: number;
}

/**
 * Controller for managing stream lifecycle.
 * Provides push/complete/error methods and cancellation support.
 */
export class StreamController<T> {
  private readonly chunks: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T, void>) => void;
    reject: (error: Error) => void;
  }> = [];

  private _state: StreamState = 'idle';
  private _error: Error | undefined;
  private readonly maxBufferSize: number;
  private readonly abortHandler: (() => void) | undefined;

  /**
   * Creates a new StreamController.
   * @param options - Stream creation options
   */
  constructor(options: CreateStreamOptions = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 100;

    if (options.signal) {
      this.abortHandler = (): void => {
        this.cancel('AbortSignal triggered');
      };
      options.signal.addEventListener('abort', this.abortHandler);
    }
  }

  /**
   * Current state of the stream.
   */
  get state(): StreamState {
    return this._state;
  }

  /**
   * Whether the stream is still active (can receive chunks).
   */
  get isActive(): boolean {
    return this._state === 'idle' || this._state === 'streaming' || this._state === 'paused';
  }

  /**
   * Current buffer size.
   */
  get bufferSize(): number {
    return this.chunks.length;
  }

  /**
   * Push a chunk to the stream.
   * @param chunk - The chunk to push
   * @returns Result indicating success or backpressure
   */
  push(chunk: T): Result<void, StreamError> {
    if (!this.isActive) {
      return err(new StreamError(`Cannot push to stream in state: ${this._state}`));
    }

    if (this._state === 'idle') {
      this._state = 'streaming';
    }

    // If there's a waiting consumer, deliver directly
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: chunk });
      return ok(undefined);
    }

    // Check backpressure
    if (this.chunks.length >= this.maxBufferSize) {
      this._state = 'paused';
      return err(
        new StreamError('Buffer full - backpressure applied', {
          context: { bufferSize: this.chunks.length, maxBufferSize: this.maxBufferSize },
        })
      );
    }

    this.chunks.push(chunk);
    return ok(undefined);
  }

  /**
   * Complete the stream successfully.
   */
  complete(): void {
    if (!this.isActive) {
      return;
    }

    this._state = 'completed';
    this.resolveAllWaiters();
  }

  /**
   * Complete the stream with an error.
   * @param error - The error that occurred
   */
  error(error: Error): void {
    if (!this.isActive) {
      return;
    }

    this._state = 'error';
    this._error = error;
    this.rejectAllWaiters(error);
  }

  /**
   * Cancel the stream.
   * @param reason - Optional reason for cancellation
   */
  cancel(reason?: string): void {
    if (!this.isActive) {
      return;
    }

    this._state = 'cancelled';
    this._error = new StreamCancelledError(reason);
    this.rejectAllWaiters(this._error);
  }

  /**
   * Get the AsyncIterable for consuming the stream.
   */
  getIterable(): AsyncIterable<T> {
    // Store reference to controller methods for closure
    const nextChunk = (): Promise<IteratorResult<T, void>> => this.nextChunk();
    const cancel = (reason: string): void => {
      this.cancel(reason);
    };

    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          async next(): Promise<IteratorResult<T, void>> {
            return nextChunk();
          },
          return(): Promise<IteratorResult<T, void>> {
            cancel('Iterator returned');
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  private async nextChunk(): Promise<IteratorResult<T, void>> {
    // If we have buffered chunks, return one
    const chunk = this.chunks.shift();
    if (chunk !== undefined) {
      // Resume if we were paused and buffer is now below threshold
      if (this._state === 'paused' && this.chunks.length < this.maxBufferSize / 2) {
        this._state = 'streaming';
      }
      return { done: false, value: chunk };
    }

    // Check terminal states
    if (this._state === 'completed') {
      return { done: true, value: undefined };
    }

    if (this._state === 'cancelled' || this._state === 'error') {
      throw this._error ?? new StreamCancelledError();
    }

    // Wait for next chunk
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private resolveAllWaiters(): void {
    for (const waiter of this.waiters) {
      waiter.resolve({ done: true, value: undefined });
    }
    this.waiters.length = 0;
  }

  private rejectAllWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      waiter.reject(error);
    }
    this.waiters.length = 0;
  }
}

/**
 * Creates a controllable stream.
 * @param options - Stream creation options
 * @returns Tuple of [controller, iterable]
 */
export function createStream<T>(
  options: CreateStreamOptions = {}
): [StreamController<T>, AsyncIterable<T>] {
  const controller = new StreamController<T>(options);
  return [controller, controller.getIterable()];
}

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
