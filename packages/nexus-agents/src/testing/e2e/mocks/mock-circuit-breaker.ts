/**
 * Mock Circuit Breaker for E2E Testing
 *
 * Manual state control for testing circuit breaker behavior.
 *
 * @module testing/e2e/mocks/mock-circuit-breaker
 */

import { getTimeProvider } from '../../../core/index.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  initialState?: CircuitState;
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeout?: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}

/**
 * Mock Circuit Breaker for E2E testing.
 * Provides manual state control for testing fallback and recovery.
 */
export class MockCircuitBreaker {
  private _state: CircuitState;
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeout: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this._state = config.initialState ?? 'closed';
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 2;
    this.resetTimeout = config.resetTimeout ?? 30000;
  }

  get state(): CircuitState {
    return this._state;
  }

  isOpen(): boolean {
    return this._state === 'open';
  }

  isClosed(): boolean {
    return this._state === 'closed';
  }

  isHalfOpen(): boolean {
    return this._state === 'half_open';
  }

  /**
   * Manually set the circuit state (for testing).
   */
  setState(state: CircuitState): void {
    this._state = state;
  }

  /**
   * Record a failure.
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailure = getTimeProvider().now();

    if (this._state === 'closed' && this.failures >= this.failureThreshold) {
      this._state = 'open';
    } else if (this._state === 'half_open') {
      this._state = 'open';
      this.successes = 0;
    }
  }

  /**
   * Record a success.
   */
  recordSuccess(): void {
    this.successes++;
    this.lastSuccess = getTimeProvider().now();

    if (this._state === 'half_open') {
      if (this.successes >= this.successThreshold) {
        this._state = 'closed';
        this.failures = 0;
      }
    }
  }

  /**
   * Attempt to transition from open to half-open.
   */
  tryReset(): boolean {
    if (this._state === 'open') {
      const now = getTimeProvider().now();
      if (this.lastFailure === null || now - this.lastFailure >= this.resetTimeout) {
        this._state = 'half_open';
        this.successes = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Execute an operation through the circuit breaker.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this._state === 'open') {
      const didReset = this.tryReset();
      if (!didReset) {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Reset the circuit breaker to initial state.
   */
  reset(): void {
    this._state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
  }

  /**
   * Get statistics for testing assertions.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this._state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }
}
