/**
 * nexus-agents/cli-adapters - Circuit Breaker Types
 *
 * Type definitions and error classes for the circuit breaker pattern.
 *
 * (Source: Issue #81 - Circuit breaker for CLI failures)
 */

import { NexusError, ErrorCode } from '../core/errors.js';
import type { CliName } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Circuit breaker states.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Categories of failures for circuit breaker decisions.
 */
export type FailureCategory =
  | 'timeout' // CLI didn't respond in time
  | 'crash' // Process crashed or exited unexpectedly
  | 'authentication' // OAuth/auth failure
  | 'rate_limit' // Rate limit exceeded
  | 'connection' // MCP connection failed
  | 'unknown'; // Uncategorized failure

/**
 * Configuration options for circuit breaker.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  readonly failureThreshold: number;
  /** Time in ms before attempting recovery (default: 30000) */
  readonly resetTimeoutMs: number;
  /** Successful calls needed in half-open to close (default: 2) */
  readonly halfOpenSuccessThreshold: number;
  /** Whether to count timeouts as failures (default: true) */
  readonly countTimeoutsAsFailures: boolean;
  /** Whether to count auth failures as failures (default: false) */
  readonly countAuthFailuresAsFailures: boolean;
  /** Maximum number of requests allowed in half-open state (default: 3) */
  readonly halfOpenMaxRequests: number;
}

/**
 * Circuit breaker state snapshot.
 */
export interface CircuitBreakerSnapshot {
  /** Current state */
  readonly state: CircuitState;
  /** Total failure count since last closed */
  readonly failureCount: number;
  /** Success count in half-open state */
  readonly successCount: number;
  /** Timestamp of last failure */
  readonly lastFailureTime: number | null;
  /** Timestamp of last state change */
  readonly lastStateChange: number;
  /** Requests in current half-open window */
  readonly halfOpenRequests: number;
  /** Configuration */
  readonly config: CircuitBreakerConfig;
}

/**
 * Event emitted on circuit state changes.
 */
export interface CircuitStateChangeEvent {
  /** CLI name */
  readonly cliName: CliName;
  /** Previous state */
  readonly previousState: CircuitState;
  /** New state */
  readonly newState: CircuitState;
  /** Timestamp of change */
  readonly timestamp: number;
  /** Failure count at time of change */
  readonly failureCount: number;
  /** Reason for state change */
  readonly reason: string;
}

/**
 * Event listener for circuit state changes.
 */
export type CircuitStateChangeListener = (event: CircuitStateChangeEvent) => void;

/**
 * Interface for circuit breaker operations.
 */
export interface ICircuitBreaker {
  /**
   * Executes a function with circuit breaker protection.
   */
  execute<T>(fn: () => Promise<T>): Promise<import('../core/index.js').Result<T, CircuitError>>;

  /**
   * Gets the current circuit state.
   */
  getState(): CircuitState;

  /**
   * Gets a full snapshot of circuit breaker state.
   */
  getSnapshot(): CircuitBreakerSnapshot;

  /**
   * Manually resets the circuit breaker to closed state.
   */
  reset(): void;

  /**
   * Records a failure manually (for external failure detection).
   */
  recordFailure(category: FailureCategory): void;

  /**
   * Records a success manually (for external success detection).
   */
  recordSuccess(): void;
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes specific to circuit breaker.
 */
export const CircuitErrorCode = {
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  CIRCUIT_HALF_OPEN_REJECTED: 'CIRCUIT_HALF_OPEN_REJECTED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
} as const;

export type CircuitErrorCode = (typeof CircuitErrorCode)[keyof typeof CircuitErrorCode];

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error thrown when circuit breaker blocks a request.
 */
export class CircuitError extends NexusError {
  readonly circuitErrorCode: CircuitErrorCode;
  readonly cliName: CliName;
  readonly circuitState: CircuitState;
  readonly failureCategory?: FailureCategory;

  constructor(
    message: string,
    options: {
      circuitErrorCode: CircuitErrorCode;
      cliName: CliName;
      circuitState: CircuitState;
      failureCategory?: FailureCategory;
      cause?: Error;
    }
  ) {
    const baseOptions: { code: ErrorCode; cause?: Error; context: Record<string, unknown> } = {
      code: ErrorCode.INTERNAL_ERROR,
      context: {
        circuitErrorCode: options.circuitErrorCode,
        cliName: options.cliName,
        circuitState: options.circuitState,
      },
    };
    if (options.cause !== undefined) {
      baseOptions.cause = options.cause;
    }
    if (options.failureCategory !== undefined) {
      baseOptions.context['failureCategory'] = options.failureCategory;
    }
    super(message, baseOptions);
    this.name = 'CircuitError';
    this.circuitErrorCode = options.circuitErrorCode;
    this.cliName = options.cliName;
    this.circuitState = options.circuitState;
    if (options.failureCategory !== undefined) {
      this.failureCategory = options.failureCategory;
    }
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
  countTimeoutsAsFailures: true,
  countAuthFailuresAsFailures: false,
  halfOpenMaxRequests: 3,
} as const;

// ============================================================================
// Error Categorization Patterns
// ============================================================================

/**
 * Pattern matchers for categorizing errors.
 */
const TIMEOUT_PATTERNS = ['timeout', 'timed out'];
const AUTH_PATTERNS = ['auth', 'unauthorized', 'forbidden', 'oauth'];
const RATE_LIMIT_PATTERNS = ['rate limit', 'too many requests', '429'];
const CONNECTION_PATTERNS = ['connection', 'econnrefused', 'enotfound', 'mcp'];
const CRASH_PATTERNS = ['crash', 'exited', 'killed', 'sigterm', 'sigkill'];

/**
 * Checks if text contains any of the patterns.
 */
function matchesPatterns(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

/**
 * Categorizes an error into a failure category.
 */
export function categorizeError(error: unknown): FailureCategory {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const combined = `${message} ${name}`;

  if (matchesPatterns(combined, TIMEOUT_PATTERNS)) return 'timeout';
  if (matchesPatterns(combined, AUTH_PATTERNS)) return 'authentication';
  if (matchesPatterns(combined, RATE_LIMIT_PATTERNS)) return 'rate_limit';
  if (matchesPatterns(combined, CONNECTION_PATTERNS)) return 'connection';
  if (matchesPatterns(combined, CRASH_PATTERNS)) return 'crash';

  return 'unknown';
}
