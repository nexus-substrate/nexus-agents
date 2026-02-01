/**
 * nexus-agents/adapters - Retry Logic with Exponential Backoff
 *
 * Provides retry functionality for fallible operations with exponential backoff
 * and jitter to prevent thundering herd problems.
 *
 * (Source: AWS Architecture Blog - Exponential Backoff and Jitter)
 * (Source: Google Cloud API Design Guide - Retry Strategy)
 */

import {
  type Result,
  type NexusErrorOptions,
  err,
  ok,
  NexusError,
  ErrorCode,
  getRandomProvider,
} from '../core/index.js';
import { sleep } from '../utils/async-utils.js';

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  readonly maxRetries: number;
  /** Base delay in milliseconds between retries. Default: 1000 */
  readonly baseDelayMs: number;
  /** Maximum delay in milliseconds between retries. Default: 30000 */
  readonly maxDelayMs: number;
  /** Jitter factor (0-1) to randomize delay. Default: 0.1 (10%) */
  readonly jitterFactor: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
} as const;

/**
 * Information about a retry attempt for logging/debugging.
 */
export interface RetryAttemptInfo {
  /** Current attempt number (1-based) */
  readonly attempt: number;
  /** Maximum attempts allowed */
  readonly maxAttempts: number;
  /** Delay before next retry in milliseconds */
  readonly delayMs: number;
  /** The error that triggered the retry */
  readonly error: unknown;
}

/**
 * Error thrown when all retry attempts are exhausted.
 */
export class RetryExhaustedError extends NexusError {
  /** Number of attempts made */
  readonly attempts: number;
  /** The last error encountered */
  readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    const message = `All ${String(attempts)} retry attempts exhausted`;
    const options: NexusErrorOptions = {
      code: ErrorCode.MODEL_ERROR,
      context: {
        attempts,
        lastErrorMessage: lastError instanceof Error ? lastError.message : String(lastError),
      },
    };
    // Only set cause if lastError is an Error (exactOptionalPropertyTypes compliance)
    if (lastError instanceof Error) {
      options.cause = lastError;
    }
    super(message, options);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Calculates delay with exponential backoff and jitter.
 *
 * Uses full jitter strategy: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 *
 * @param attempt - Current attempt number (0-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Apply jitter: delay +/- (delay * jitterFactor)
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (getRandomProvider().random() * 2 - 1) * jitterRange;

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

// Re-export sleep from canonical source for backward compatibility
export { sleep } from '../utils/async-utils.js';

/**
 * HTTP status codes that indicate a retryable error.
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * HTTP status codes that should NOT be retried.
 */
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  409, // Conflict
  410, // Gone
  422, // Unprocessable Entity
]);

/**
 * Error message patterns that indicate retryable network errors.
 */
const RETRYABLE_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /ENETUNREACH/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /network/i,
  /timeout/i,
  /timed out/i,
  /aborted/i,
] as const;

/**
 * Extracts HTTP status code from an error if available.
 *
 * @param error - The error to check
 * @returns The status code or undefined
 */
function getStatusCode(error: unknown): number | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }

  // Check common error object shapes
  if (typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;

    // Direct status property
    if (typeof errorObj['status'] === 'number') {
      return errorObj['status'];
    }

    // Nested in response
    if (typeof errorObj['response'] === 'object' && errorObj['response'] !== null) {
      const response = errorObj['response'] as Record<string, unknown>;
      if (typeof response['status'] === 'number') {
        return response['status'];
      }
    }

    // statusCode property (some HTTP clients)
    if (typeof errorObj['statusCode'] === 'number') {
      return errorObj['statusCode'];
    }
  }

  return undefined;
}

/**
 * Determines if an error is retryable based on its type, status code, or message.
 *
 * Retryable errors include:
 * - HTTP 429 (Too Many Requests)
 * - HTTP 5xx (Server Errors)
 * - HTTP 408 (Request Timeout)
 * - Network errors (connection reset, timeout, etc.)
 * - NexusError with rate limit or timeout codes
 *
 * Non-retryable errors include:
 * - HTTP 400, 401, 403, 404 (Client Errors)
 * - Validation errors
 * - Authentication errors
 *
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Null/undefined are not retryable
  if (error === null || error === undefined) {
    return false;
  }

  // Check HTTP status code first
  const statusCode = getStatusCode(error);
  if (statusCode !== undefined) {
    if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
      return false;
    }
    if (RETRYABLE_STATUS_CODES.has(statusCode)) {
      return true;
    }
  }

  // Check NexusError codes
  if (error instanceof NexusError) {
    const retryableCodes: ReadonlyArray<string> = [
      ErrorCode.MODEL_RATE_LIMITED,
      ErrorCode.MODEL_TIMEOUT,
      ErrorCode.TIMEOUT_ERROR,
      ErrorCode.RATE_LIMIT_ERROR,
    ];
    return retryableCodes.includes(error.code);
  }

  // Check error message patterns for network errors
  if (error instanceof Error) {
    const message = error.message;
    for (const pattern of RETRYABLE_ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Merges partial retry config with defaults.
 *
 * @param config - Partial configuration to merge
 * @returns Complete retry configuration
 */
function mergeConfig(config: Partial<RetryConfig>): RetryConfig {
  return {
    maxRetries: config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs: config.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: config.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitterFactor: config.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
  };
}

/**
 * Options for withRetry function.
 */
export interface WithRetryOptions {
  /** Retry configuration. Defaults to DEFAULT_RETRY_CONFIG. */
  readonly config?: Partial<RetryConfig>;
  /** Custom predicate to determine if an error is retryable. Defaults to isRetryableError. */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Callback invoked before each retry attempt. Useful for logging. */
  readonly onRetry?: (info: RetryAttemptInfo) => void;
}

/**
 * Executes an operation with retry logic using exponential backoff.
 *
 * @template T - The return type of the operation
 * @param operation - The async operation to execute
 * @param options - Retry options (config, isRetryable predicate, onRetry callback)
 * @returns A Result containing either the operation result or a RetryExhaustedError
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData('/api/data'),
 *   { config: { maxRetries: 5 } }
 * );
 *
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error('All retries failed:', result.error);
 * }
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: WithRetryOptions = {}
): Promise<Result<T, RetryExhaustedError>> {
  const config = mergeConfig(options.config ?? {});
  const isRetryable = options.isRetryable ?? isRetryableError;
  const onRetry = options.onRetry;

  const maxAttempts = config.maxRetries + 1; // Initial attempt + retries
  let lastError: unknown;
  let attemptsMade = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsMade = attempt + 1;
    try {
      const result = await operation();
      return ok(result);
    } catch (error: unknown) {
      lastError = error;

      // Check if we have more attempts and error is retryable
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable(error)) {
        break;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(attempt, config);

      // Notify about retry attempt
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxAttempts,
          delayMs,
          error,
        });
      }

      // Wait before next attempt
      await sleep(delayMs);
    }
  }

  return err(new RetryExhaustedError(attemptsMade, lastError));
}

/**
 * Wraps an async function with retry logic.
 *
 * @template TArgs - The argument types of the function
 * @template TReturn - The return type of the function
 * @param fn - The function to wrap
 * @param options - Retry options
 * @returns A wrapped function that will retry on failure
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetryWrapper(
 *   async (url: string) => fetch(url),
 *   { config: { maxRetries: 3 } }
 * );
 *
 * const result = await fetchWithRetry('https://api.example.com/data');
 * ```
 */
export function withRetryWrapper<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: WithRetryOptions = {}
): (...args: TArgs) => Promise<Result<TReturn, RetryExhaustedError>> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}
