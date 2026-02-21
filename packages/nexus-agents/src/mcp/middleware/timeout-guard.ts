/**
 * nexus-agents/mcp - Timeout Guard Middleware
 *
 * Provides timeout protection for MCP operations to mitigate ReDoS and
 * other denial-of-service vectors. Implements configurable timeouts with
 * proper cleanup and error handling.
 *
 * (Source: CVE-2026-0621, GHSA-8r9q-7v3j-jr4g)
 * (Source: Issue #107)
 *
 * @module mcp/middleware/timeout-guard
 */

import {
  getErrorMessage,
  createLogger,
  type ILogger,
  type Result,
  ok,
  err,
  getTimeProvider,
} from '../../core/index.js';

/**
 * Error codes for timeout-related failures.
 */
export type TimeoutErrorCode =
  | 'OPERATION_TIMEOUT'
  | 'OPERATION_CANCELLED'
  | 'INVALID_TIMEOUT'
  | 'GUARD_ERROR';

/**
 * Timeout guard error.
 */
export interface TimeoutError {
  readonly code: TimeoutErrorCode;
  readonly message: string;
  readonly operation?: string;
  readonly timeoutMs?: number;
  readonly cause?: Error;
}

/**
 * Configuration for timeout guard.
 */
export interface TimeoutGuardConfig {
  /** Default timeout in milliseconds (default: 30000) */
  readonly defaultTimeoutMs?: number;
  /** Maximum allowed timeout in milliseconds (default: 300000) */
  readonly maxTimeoutMs?: number;
  /** Whether to log timeout events (default: true) */
  readonly enableLogging?: boolean;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Result of a guarded operation.
 */
export interface GuardedResult<T> {
  /** The operation result */
  readonly value: T;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Whether the operation was near timeout */
  readonly nearTimeout: boolean;
}

/** Execution options for guarded operations. */
export interface ExecuteOptions {
  /** Custom timeout for this operation */
  readonly timeoutMs?: number;
  /** Name for logging/debugging */
  readonly operationName?: string;
  /** Cleanup function to call on timeout */
  readonly onTimeout?: () => void;
  /** AbortSignal for client-initiated cancellation */
  readonly signal?: AbortSignal;
}

// Canonical source: config/timeouts.ts (Issue #1046)
import { TIMEOUT_GUARD } from '../../config/timeouts.js';

const DEFAULT_TIMEOUT_MS = TIMEOUT_GUARD.defaultMs;
const MAX_TIMEOUT_MS = TIMEOUT_GUARD.maxMs;
const NEAR_TIMEOUT_THRESHOLD = TIMEOUT_GUARD.nearTimeoutThreshold;

/** Internal state for tracking timeout. */
interface TimeoutState {
  timeoutId: ReturnType<typeof setTimeout> | undefined;
  timedOut: boolean;
}

/**
 * Creates a timeout error for operation timeout.
 */
function createTimeoutError(operationName: string, timeoutMs: number): TimeoutError {
  return {
    code: 'OPERATION_TIMEOUT',
    message: `Operation '${operationName}' timed out after ${String(timeoutMs)}ms`,
    operation: operationName,
    timeoutMs,
  };
}

/**
 * Creates a guard error from a caught exception.
 */
function createGuardError(error: unknown, operationName: string): TimeoutError {
  const guardError: TimeoutError = {
    code: 'GUARD_ERROR',
    message: getErrorMessage(error),
    operation: operationName,
  };
  if (error instanceof Error) {
    return { ...guardError, cause: error };
  }
  return guardError;
}

/**
 * Timeout guard for protecting async operations from hanging.
 *
 * Provides protection against:
 * - ReDoS attacks (CVE-2026-0621)
 * - Slow/hanging external services
 * - Resource exhaustion
 *
 * @example
 * ```typescript
 * const guard = new TimeoutGuard({ defaultTimeoutMs: 5000 });
 *
 * const result = await guard.execute(
 *   () => someAsyncOperation(),
 *   { operationName: 'process-uri' }
 * );
 *
 * if (result.ok) {
 *   console.log('Completed in', result.value.durationMs, 'ms');
 * }
 * ```
 */
export class TimeoutGuard {
  private readonly defaultTimeoutMs: number;
  private readonly maxTimeoutMs: number;
  private readonly enableLogging: boolean;
  private readonly logger: ILogger;

  constructor(config?: TimeoutGuardConfig) {
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTimeoutMs = config?.maxTimeoutMs ?? MAX_TIMEOUT_MS;
    this.enableLogging = config?.enableLogging ?? true;
    this.logger = config?.logger ?? createLogger({ component: 'timeout-guard' });
  }

  /** Resolves effective timeout and operation name from options. */
  private resolveOptions(options?: ExecuteOptions): {
    timeoutMs: number;
    operationName: string;
  } {
    return {
      timeoutMs: Math.min(options?.timeoutMs ?? this.defaultTimeoutMs, this.maxTimeoutMs),
      operationName: options?.operationName ?? 'unknown',
    };
  }

  /**
   * Executes an async operation with timeout protection.
   */
  async execute<T>(
    operation: () => Promise<T>,
    options?: ExecuteOptions
  ): Promise<Result<GuardedResult<T>, TimeoutError>> {
    const { timeoutMs, operationName } = this.resolveOptions(options);

    const validationError = this.validateTimeout(timeoutMs, operationName);
    if (validationError !== null) {
      return err(validationError);
    }

    return this.runGuarded(operation, timeoutMs, operationName, options);
  }

  /** Runs the operation with timeout and optional abort signal. */
  private async runGuarded<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
    options?: ExecuteOptions
  ): Promise<Result<GuardedResult<T>, TimeoutError>> {
    this.logStart(operationName, timeoutMs);
    const startTime = getTimeProvider().now();
    const state: TimeoutState = { timeoutId: undefined, timedOut: false };

    try {
      const result = await this.runWithTimeout(
        operation,
        timeoutMs,
        state,
        options?.onTimeout,
        options?.signal
      );
      return this.handleSuccess(result, startTime, timeoutMs, operationName);
    } catch {
      const cancelled = options?.signal?.aborted === true && !state.timedOut;
      return err(
        this.handleFailure(state.timedOut, operationName, timeoutMs, startTime, cancelled)
      );
    } finally {
      if (state.timeoutId !== undefined) {
        clearTimeout(state.timeoutId);
      }
    }
  }

  private validateTimeout(timeoutMs: number, operationName: string): TimeoutError | null {
    if (timeoutMs <= 0) {
      return {
        code: 'INVALID_TIMEOUT',
        message: `Invalid timeout: ${String(timeoutMs)}ms`,
        operation: operationName,
      };
    }
    return null;
  }

  private logStart(operationName: string, timeoutMs: number): void {
    if (this.enableLogging) {
      this.logger.debug('Starting guarded operation', { operation: operationName, timeoutMs });
    }
  }

  private async runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    state: TimeoutState,
    onTimeout?: () => void,
    signal?: AbortSignal
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      state.timeoutId = setTimeout(() => {
        state.timedOut = true;
        onTimeout?.();
        reject(new Error(`Operation timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);
    });

    const promises: Array<Promise<T>> = [operation(), timeoutPromise];

    // Race against client AbortSignal if provided
    if (signal !== undefined && !signal.aborted) {
      const abortPromise = new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('Operation cancelled by client'));
          },
          { once: true }
        );
      });
      promises.push(abortPromise);
    }

    return Promise.race(promises);
  }

  private handleSuccess<T>(
    result: T,
    startTime: number,
    timeoutMs: number,
    operationName: string
  ): Result<GuardedResult<T>, TimeoutError> {
    const durationMs = getTimeProvider().now() - startTime;
    const nearTimeout = durationMs > timeoutMs * NEAR_TIMEOUT_THRESHOLD;

    if (nearTimeout && this.enableLogging) {
      this.logger.warn('Operation completed near timeout threshold', {
        operation: operationName,
        durationMs,
        timeoutMs,
        thresholdPercent: Math.round((durationMs / timeoutMs) * 100),
      });
    }

    if (this.enableLogging) {
      this.logger.debug('Guarded operation completed', { operation: operationName, durationMs });
    }

    return ok({ value: result, durationMs, nearTimeout });
  }

  private handleFailure(
    timedOut: boolean,
    operationName: string,
    timeoutMs: number,
    startTime: number,
    cancelled = false
  ): TimeoutError {
    const durationMs = getTimeProvider().now() - startTime;

    if (cancelled) {
      this.logger.info('Operation cancelled by client', {
        operation: operationName,
        durationMs,
      });
      return {
        code: 'OPERATION_CANCELLED',
        message: `Operation '${operationName}' cancelled by client`,
        operation: operationName,
      };
    }

    if (timedOut) {
      this.logger.error('Operation timed out', undefined, {
        operation: operationName,
        timeoutMs,
        durationMs,
      });
      return createTimeoutError(operationName, timeoutMs);
    }

    return createGuardError(new Error('Unknown error'), operationName);
  }

  /**
   * Creates a guarded version of an async function.
   */
  guard<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: { readonly timeoutMs?: number; readonly operationName?: string }
  ): (...args: TArgs) => Promise<Result<GuardedResult<TResult>, TimeoutError>> {
    return async (...args: TArgs): Promise<Result<GuardedResult<TResult>, TimeoutError>> => {
      return this.execute(() => fn(...args), options);
    };
  }
}

/**
 * URI validation utilities to complement timeout protection.
 */
export const UriValidation = {
  MAX_URI_LENGTH: 8192,
  MAX_TEMPLATE_DEPTH: 3,
  SUSPICIOUS_PATTERN: /\{[+#./;?&]?[^}]*\*\}.*\{[+#./;?&]?[^}]*\*\}|\{(?:[^{}]*\{){3,}/,

  validate(uri: string): Result<string, TimeoutError> {
    if (uri.length > this.MAX_URI_LENGTH) {
      return err({
        code: 'GUARD_ERROR',
        message: `URI exceeds maximum length: ${String(uri.length)} > ${String(this.MAX_URI_LENGTH)}`,
        operation: 'uri-validation',
      });
    }

    if (this.SUSPICIOUS_PATTERN.test(uri)) {
      return err({
        code: 'GUARD_ERROR',
        message: 'URI contains suspicious patterns that may cause performance issues',
        operation: 'uri-validation',
      });
    }

    return ok(uri);
  },

  sanitize(uri: string): string {
    const sanitized = uri.slice(0, this.MAX_URI_LENGTH);
    let depth = 0;
    let result = '';

    for (const char of sanitized) {
      if (char === '{') {
        depth++;
        if (depth > this.MAX_TEMPLATE_DEPTH) continue;
      } else if (char === '}') {
        if (depth > this.MAX_TEMPLATE_DEPTH) {
          depth--;
          continue;
        }
        depth--;
      }
      result += char;
    }

    return result;
  },
};

/**
 * Creates a timeout guard with default MCP-appropriate settings.
 */
export function createDefaultTimeoutGuard(logger?: ILogger): TimeoutGuard {
  const config: TimeoutGuardConfig = {
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maxTimeoutMs: MAX_TIMEOUT_MS,
    enableLogging: true,
  };
  if (logger !== undefined) {
    return new TimeoutGuard({ ...config, logger });
  }
  return new TimeoutGuard(config);
}
