/**
 * nexus-agents/core - Error Metrics Collection
 *
 * Provides error telemetry and metrics aggregation for monitoring and debugging.
 * Tracks error counts by code, component, and time.
 *
 * (Source: Issue #112)
 */

import { type ErrorCode, NexusError } from './errors.js';
import { getTimeProvider } from './time-provider.js';

/**
 * Snapshot of error metrics at a point in time.
 */
export interface ErrorMetrics {
  /** Total number of errors recorded */
  readonly totalErrors: number;
  /** Error counts by error code */
  readonly errorsByCode: ReadonlyMap<ErrorCode, number>;
  /** Error counts by component/source */
  readonly errorsByComponent: ReadonlyMap<string, number>;
  /** Most recent error info */
  readonly lastError?: {
    readonly code: ErrorCode;
    readonly component: string;
    readonly message: string;
    readonly timestamp: Date;
  };
  /** Timestamp when metrics collection started */
  readonly startedAt: Date;
  /** Number of milliseconds since metrics collection started */
  readonly uptimeMs: number;
}

/**
 * Options for recording an error.
 */
export interface RecordErrorOptions {
  /** The component or source of the error */
  readonly component: string;
  /** The error to record */
  readonly error: Error | NexusError;
  /** Optional additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Metrics export format for monitoring systems.
 */
export interface MetricsExport {
  /** Unix timestamp in milliseconds */
  readonly timestamp: number;
  /** Total error count */
  readonly totalErrors: number;
  /** Error rate per minute (last 5 minutes) */
  readonly errorRatePerMinute: number;
  /** Top 5 error codes by count */
  readonly topErrorCodes: ReadonlyArray<{ code: string; count: number }>;
  /** Top 5 components by error count */
  readonly topComponents: ReadonlyArray<{ component: string; count: number }>;
  /** Uptime in seconds */
  readonly uptimeSeconds: number;
}

/**
 * Internal error record for time-series tracking.
 */
interface ErrorRecord {
  readonly code: ErrorCode;
  readonly component: string;
  readonly message: string;
  readonly timestamp: Date;
}

/**
 * Maximum number of recent errors to keep for rate calculation.
 */
const MAX_RECENT_ERRORS = 1000;

/**
 * Time window for error rate calculation (5 minutes).
 */
const RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Error metrics collector for monitoring and debugging.
 *
 * Thread-safe singleton that aggregates error data across the application.
 */
export class ErrorMetricsCollector {
  private totalErrors = 0;
  private readonly errorsByCode = new Map<ErrorCode, number>();
  private readonly errorsByComponent = new Map<string, number>();
  private readonly recentErrors: ErrorRecord[] = [];
  private lastError: ErrorRecord | undefined;
  private readonly startedAt: Date;

  constructor() {
    this.startedAt = new Date(getTimeProvider().now());
  }

  /**
   * Records an error occurrence.
   *
   * @param options - Error recording options
   */
  record(options: RecordErrorOptions): void {
    const { component, error } = options;
    const code = this.extractErrorCode(error);
    const timestamp = new Date(getTimeProvider().now());

    // Update counters
    this.totalErrors++;
    this.errorsByCode.set(code, (this.errorsByCode.get(code) ?? 0) + 1);
    this.errorsByComponent.set(component, (this.errorsByComponent.get(component) ?? 0) + 1);

    // Track recent error
    const record: ErrorRecord = {
      code,
      component,
      message: error.message,
      timestamp,
    };
    this.lastError = record;

    // Maintain bounded recent errors list for rate calculation
    this.recentErrors.push(record);
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  /**
   * Gets the current error metrics snapshot.
   */
  getMetrics(): ErrorMetrics {
    const now = getTimeProvider().now();
    const base = {
      totalErrors: this.totalErrors,
      errorsByCode: new Map(this.errorsByCode),
      errorsByComponent: new Map(this.errorsByComponent),
      startedAt: this.startedAt,
      uptimeMs: now - this.startedAt.getTime(),
    };

    // Use spread to conditionally include lastError (satisfies exactOptionalPropertyTypes)
    if (this.lastError) {
      return {
        ...base,
        lastError: {
          code: this.lastError.code,
          component: this.lastError.component,
          message: this.lastError.message,
          timestamp: this.lastError.timestamp,
        },
      };
    }
    return base;
  }

  /**
   * Exports metrics in a format suitable for monitoring systems.
   */
  export(): MetricsExport {
    const now = getTimeProvider().now();
    const windowStart = now - RATE_WINDOW_MS;

    // Calculate error rate from recent errors
    const recentCount = this.recentErrors.filter((e) => e.timestamp.getTime() > windowStart).length;
    const errorRatePerMinute = (recentCount / 5) * 1; // errors per minute over 5 minute window

    // Get top error codes
    const sortedCodes = [...this.errorsByCode.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }));

    // Get top components
    const sortedComponents = [...this.errorsByComponent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([component, count]) => ({ component, count }));

    return {
      timestamp: now,
      totalErrors: this.totalErrors,
      errorRatePerMinute,
      topErrorCodes: sortedCodes,
      topComponents: sortedComponents,
      uptimeSeconds: Math.floor((now - this.startedAt.getTime()) / 1000),
    };
  }

  /**
   * Gets the count of errors for a specific error code.
   *
   * @param code - The error code to query
   */
  getCountByCode(code: ErrorCode): number {
    return this.errorsByCode.get(code) ?? 0;
  }

  /**
   * Gets the count of errors for a specific component.
   *
   * @param component - The component name to query
   */
  getCountByComponent(component: string): number {
    return this.errorsByComponent.get(component) ?? 0;
  }

  /**
   * Resets all metrics. Useful for testing or metric rotation.
   */
  reset(): void {
    this.totalErrors = 0;
    this.errorsByCode.clear();
    this.errorsByComponent.clear();
    this.recentErrors.length = 0;
    this.lastError = undefined;
  }

  /**
   * Extracts the error code from an error object.
   */
  private extractErrorCode(error: Error | NexusError): ErrorCode {
    if (error instanceof NexusError) {
      return error.code;
    }
    // Default to INTERNAL_ERROR for non-NexusError errors
    return 'INTERNAL_ERROR';
  }
}

/**
 * Global error metrics collector instance.
 *
 * Use this singleton for application-wide error tracking.
 */
export const errorMetrics = new ErrorMetricsCollector();

/**
 * Helper function to record an error with minimal boilerplate.
 *
 * @param component - The component or source of the error
 * @param error - The error to record
 */
export function recordError(component: string, error: Error | NexusError): void {
  errorMetrics.record({ component, error });
}
