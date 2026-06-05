/**
 * nexus-agents/cli-adapters - Circuit Breaker Implementation
 *
 * Implements the circuit breaker pattern to handle CLI failures gracefully
 * and prevent cascade failures in the multi-CLI mesh.
 *
 * (Source: Issue #81 - Circuit breaker for CLI failures)
 * (Source: Martin Fowler's Circuit Breaker pattern)
 */

import type { Result } from '../core/index.js';
import { getErrorMessage, err, ok, getTimeProvider } from '../core/index.js';

import { ErrorCode, type ModelError } from '../core/errors.js';

import type { CliName, CliErrorCode } from './types.js';
import {
  CircuitError,
  CircuitErrorCode,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  categorizeError,
  type CircuitState,
  type FailureCategory,
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
  type CircuitStateChangeEvent,
  type CircuitStateChangeListener,
  type ICircuitBreaker,
} from './circuit-breaker-types.js';

// Re-export all types for convenience
export {
  CircuitError,
  CircuitErrorCode,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  categorizeError,
  type CircuitState,
  type FailureCategory,
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
  type CircuitStateChangeEvent,
  type CircuitStateChangeListener,
  type ICircuitBreaker,
} from './circuit-breaker-types.js';

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit breaker implementation for CLI adapters.
 *
 * Provides protection against cascading failures by:
 * 1. Tracking failure counts
 * 2. Opening circuit when threshold exceeded
 * 3. Allowing gradual recovery through half-open state
 */
export class CliCircuitBreaker implements ICircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number;
  private halfOpenRequests = 0;
  private readonly listeners: Set<CircuitStateChangeListener> = new Set();

  constructor(
    private readonly cliName: CliName,
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
  ) {
    this.lastStateChange = getTimeProvider().now();
  }

  /**
   * Executes a function with circuit breaker protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<Result<T, CircuitError>> {
    const canExecute = this.canExecute();
    if (!canExecute.ok) {
      return canExecute;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return ok(result);
    } catch (error) {
      const category = categorizeError(error);
      if (this.shouldCountFailure(category)) {
        this.onFailure(category);
      }
      return err(this.createExecutionError(error, category));
    }
  }

  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  getSnapshot(): CircuitBreakerSnapshot {
    this.checkStateTransition();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      halfOpenRequests: this.halfOpenRequests,
      config: this.config,
    };
  }

  reset(): void {
    const previousState = this.state;
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;
    this.lastStateChange = getTimeProvider().now();

    if (previousState !== 'closed') {
      this.emitStateChange(previousState, 'closed', 'Manual reset');
    }
  }

  recordFailure(category: FailureCategory): void {
    if (this.shouldCountFailure(category)) {
      this.onFailure(category);
    }
  }

  recordSuccess(): void {
    this.onSuccess();
  }

  addStateChangeListener(listener: CircuitStateChangeListener): void {
    this.listeners.add(listener);
  }

  removeStateChangeListener(listener: CircuitStateChangeListener): void {
    this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private canExecute(): Result<true, CircuitError> {
    this.checkStateTransition();

    if (this.state === 'closed') {
      return ok(true);
    }

    if (this.state === 'open') {
      return err(
        new CircuitError(`Circuit is open for CLI: ${this.cliName}`, {
          circuitErrorCode: CircuitErrorCode.CIRCUIT_OPEN,
          cliName: this.cliName,
          circuitState: this.state,
        })
      );
    }

    // half-open state
    if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
      return err(
        new CircuitError(`Circuit half-open request limit reached for CLI: ${this.cliName}`, {
          circuitErrorCode: CircuitErrorCode.CIRCUIT_HALF_OPEN_REJECTED,
          cliName: this.cliName,
          circuitState: this.state,
        })
      );
    }
    this.halfOpenRequests++;
    return ok(true);
  }

  private checkStateTransition(): void {
    if (this.state === 'open' && this.lastFailureTime !== null) {
      const elapsed = getTimeProvider().now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open', 'Reset timeout elapsed');
      }
    }
  }

  private onSuccess(): void {
    if (this.state === 'closed') {
      this.failureCount = 0;
    } else if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        const reason = `${String(this.successCount)} consecutive successes in half-open state`;
        this.transitionTo('closed', reason);
      }
    }
  }

  private onFailure(category: FailureCategory): void {
    this.failureCount++;
    this.lastFailureTime = getTimeProvider().now();

    if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      const reason = `Failure threshold (${String(this.config.failureThreshold)}) exceeded`;
      this.transitionTo('open', reason);
    } else if (this.state === 'half-open') {
      this.transitionTo('open', `Failure during half-open recovery (category: ${category})`);
    }
  }

  private transitionTo(newState: CircuitState, reason: string): void {
    const previousState = this.state;
    this.state = newState;
    this.lastStateChange = getTimeProvider().now();

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenRequests = 0;
    } else if (newState === 'half-open') {
      // #3026 finding 5: pre-fix `failureCount` carried over across
      // recovery cycles. transitionTo('open',…) only zeroes counts on
      // 'closed', so a half-open→open→half-open flaky pattern grew
      // `failureCount` monotonically across cycles. The count served
      // its threshold purpose when we opened the circuit; resetting on
      // 'half-open' restores the documented per-cycle semantic that
      // operator dashboards / alerts read from `getSnapshot()`.
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenRequests = 0;
    }

    this.emitStateChange(previousState, newState, reason);
  }

  private emitStateChange(
    previousState: CircuitState,
    newState: CircuitState,
    reason: string
  ): void {
    const event: CircuitStateChangeEvent = {
      cliName: this.cliName,
      previousState,
      newState,
      timestamp: this.lastStateChange,
      failureCount: this.failureCount,
      reason,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors to prevent cascade
      }
    }
  }

  private shouldCountFailure(category: FailureCategory): boolean {
    if (category === 'timeout') return this.config.countTimeoutsAsFailures;
    if (category === 'authentication') return this.config.countAuthFailuresAsFailures;
    if (category === 'rate_limit') return this.config.countRateLimitsAsFailures;
    return true;
  }

  private createExecutionError(error: unknown, category: FailureCategory): CircuitError {
    const message = getErrorMessage(error);
    const cause = error instanceof Error ? error : new Error(String(error));
    return new CircuitError(`CLI execution failed: ${message}`, {
      circuitErrorCode: CircuitErrorCode.EXECUTION_FAILED,
      cliName: this.cliName,
      circuitState: this.state,
      failureCategory: category,
      cause,
    });
  }
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Registry for managing per-CLI circuit breakers.
 */
export class CircuitBreakerRegistry {
  private readonly breakers: Map<CliName, CliCircuitBreaker> = new Map();
  private readonly globalListeners: Set<CircuitStateChangeListener> = new Set();

  constructor(private readonly defaultConfig: Partial<CircuitBreakerConfig> = {}) {}

  getBreaker(cliName: CliName, config?: Partial<CircuitBreakerConfig>): CliCircuitBreaker {
    let breaker = this.breakers.get(cliName);

    if (!breaker) {
      const mergedConfig: CircuitBreakerConfig = {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...this.defaultConfig,
        ...config,
      };
      breaker = new CliCircuitBreaker(cliName, mergedConfig);

      for (const listener of this.globalListeners) {
        breaker.addStateChangeListener(listener);
      }

      this.breakers.set(cliName, breaker);
    }

    return breaker;
  }

  isOpen(cliName: CliName): boolean {
    return this.breakers.get(cliName)?.getState() === 'open';
  }

  getAllSnapshots(): Map<CliName, CircuitBreakerSnapshot> {
    const snapshots = new Map<CliName, CircuitBreakerSnapshot>();
    for (const [name, breaker] of this.breakers) {
      snapshots.set(name, breaker.getSnapshot());
    }
    return snapshots;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  reset(cliName: CliName): void {
    this.breakers.get(cliName)?.reset();
  }

  addGlobalStateChangeListener(listener: CircuitStateChangeListener): void {
    this.globalListeners.add(listener);
    for (const breaker of this.breakers.values()) {
      breaker.addStateChangeListener(listener);
    }
  }

  removeGlobalStateChangeListener(listener: CircuitStateChangeListener): void {
    this.globalListeners.delete(listener);
    for (const breaker of this.breakers.values()) {
      breaker.removeStateChangeListener(listener);
    }
  }

  getHealthyClis(): CliName[] {
    const healthy: CliName[] = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.getState() === 'closed') {
        healthy.push(name);
      }
    }
    return healthy;
  }

  getUnhealthyClis(): CliName[] {
    const unhealthy: CliName[] = [];
    for (const [name, breaker] of this.breakers) {
      const state = breaker.getState();
      if (state === 'open' || state === 'half-open') {
        unhealthy.push(name);
      }
    }
    return unhealthy;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Maps CLI error codes to failure categories.
 */
export function mapCliErrorToCategory(errorCode: CliErrorCode): FailureCategory {
  const mapping: Record<string, FailureCategory> = {
    TIMEOUT: 'timeout',
    NOT_AUTHENTICATED: 'authentication',
    RATE_LIMITED: 'rate_limit',
    CONNECTION_ERROR: 'connection',
  };
  return mapping[errorCode] ?? 'unknown';
}

/**
 * Maps a direct-API {@link ModelError} to a circuit-breaker failure category.
 *
 * Mirrors {@link mapCliErrorToCategory} for the IModelAdapter layer (#3423):
 * API failures must drive the same breaker degradation/failover learning that
 * CLI subprocess failures already get. Maps by the structured `error.code`
 * first, then falls back to message-pattern categorization via
 * {@link categorizeError} (which returns `'unknown'` if nothing matches).
 *
 * The fallback is what turns a generic `MODEL_ERROR` whose message reads
 * "connection refused" into a `connection` category instead of `unknown`.
 */
export function mapModelErrorToCategory(error: ModelError): FailureCategory {
  switch (error.code) {
    case ErrorCode.MODEL_TIMEOUT:
    case ErrorCode.TIMEOUT_ERROR:
      return 'timeout';
    case ErrorCode.UNAUTHORIZED:
      return 'authentication';
    case ErrorCode.MODEL_RATE_LIMITED:
    case ErrorCode.RATE_LIMIT_ERROR:
      return 'rate_limit';
    case ErrorCode.MODEL_UNAVAILABLE:
    case ErrorCode.MODEL_NOT_FOUND:
      // Intentional reuse of `connection`: there is no dedicated "endpoint gone /
      // model retired" category, and `connection` is a counted, failover-driving
      // category — the right behaviour for an unavailable/missing model.
      return 'connection';
    default:
      // MODEL_ERROR and any other code: fall back to message-pattern matching.
      return categorizeError(error);
  }
}

// `createCircuitBreakerRegistryWithMetrics` and the
// `Capacity Monitor Integration` section
// (`integrateCapacityMonitorWithCircuitBreaker` + the
// `CapacityMonitorIntegrationConfig` interface and its default config)
// were removed in #3018 — both had only test-file callers in the tree.
// The `CircuitBreakerRegistry` above is what production adapters use;
// if metrics-logging or capacity-monitor integration come back as real
// requirements, reintroduce them alongside the consumer code in the
// same PR (activation-or-delete YAGNI — same pattern as #2937–#2940).
