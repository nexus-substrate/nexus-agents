/**
 * nexus-agents/cli-adapters - Circuit Breaker Tests
 *
 * Unit tests for the circuit breaker pattern implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CliCircuitBreaker,
  CircuitBreakerRegistry,
  CircuitError,
  CircuitErrorCode,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  mapCliErrorToCategory,
  mapModelErrorToCategory,
  categorizeError,
  type CircuitStateChangeEvent,
} from './circuit-breaker.js';
import { ErrorCode, ModelError } from '../core/errors.js';

describe('CliCircuitBreaker', () => {
  let breaker: CliCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CliCircuitBreaker('claude');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should have zero failure count initially', () => {
      const snapshot = breaker.getSnapshot();
      expect(snapshot.failureCount).toBe(0);
      expect(snapshot.successCount).toBe(0);
    });

    it('should have default configuration', () => {
      const snapshot = breaker.getSnapshot();
      expect(snapshot.config).toEqual(DEFAULT_CIRCUIT_BREAKER_CONFIG);
    });
  });

  describe('closed state behavior', () => {
    it('should allow execution in closed state', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should track failures but stay closed under threshold', async () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold - 1; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getSnapshot().failureCount).toBe(
        DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold - 1
      );
    });

    it('should reset failure count on success', async () => {
      await breaker.execute(() => Promise.reject(new Error('test error')));
      await breaker.execute(() => Promise.reject(new Error('test error')));

      expect(breaker.getSnapshot().failureCount).toBe(2);

      await breaker.execute(() => Promise.resolve('success'));

      expect(breaker.getSnapshot().failureCount).toBe(0);
    });

    it('should transition to open when threshold exceeded', async () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should handle non-Error rejection values', async () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const result = await breaker.execute(() => Promise.reject('string error'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CircuitError);
        expect(result.error.message).toContain('string error');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it('should handle null rejection values', async () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const result = await breaker.execute(() => Promise.reject(null));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CircuitError);
        expect(result.error.message).toContain('Unknown error');
      }
    });
  });

  describe('open state behavior', () => {
    beforeEach(async () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }
    });

    it('should reject requests immediately when open', async () => {
      const result = await breaker.execute(() => Promise.resolve('should not run'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CircuitError);
        expect(result.error.circuitErrorCode).toBe(CircuitErrorCode.CIRCUIT_OPEN);
        expect(result.error.circuitState).toBe('open');
      }
    });

    it('should not execute function when open', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      await breaker.execute(fn);

      expect(fn).not.toHaveBeenCalled();
    });

    it('recovers on schedule even while failures keep arriving (#5011)', () => {
      // The defect: the reset window was measured from `lastFailureTime`, and
      // `onFailure` updated it unconditionally — including while already open.
      // Since an open circuit does not shed load on the default paths, traffic
      // kept arriving and each failure pushed the half-open probe another
      // 30s out. A CLI serving 95% of requests correctly stayed evicted from
      // every voter panel until a manual reset.
      expect(breaker.getState()).toBe('open');

      // Two-thirds of the way through the window, a straggler fails.
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs * 0.7);
      breaker.recordFailure('unknown');

      // Past the window measured from the TRANSITION, not from that failure.
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs * 0.4);

      expect(breaker.getState()).toBe('half-open');
    });

    it('does not re-probe before the window has elapsed', () => {
      // The pair: fixing the restart must not make the circuit probe early.
      expect(breaker.getState()).toBe('open');

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs - 1);

      expect(breaker.getState()).toBe('open');
    });

    it('should transition to half-open after reset timeout', () => {
      expect(breaker.getState()).toBe('open');

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);

      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('half-open state behavior', () => {
    beforeEach(async () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);
    });

    it('should allow limited requests in half-open state', async () => {
      expect(breaker.getState()).toBe('half-open');

      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result.ok).toBe(true);
    });

    it('should close circuit after enough successes', async () => {
      expect(breaker.getState()).toBe('half-open');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenSuccessThreshold; i++) {
        await breaker.execute(() => Promise.resolve('success'));
      }

      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen circuit on any failure', async () => {
      expect(breaker.getState()).toBe('half-open');

      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getState()).toBe('half-open');

      await breaker.execute(() => Promise.reject(new Error('failure')));

      expect(breaker.getState()).toBe('open');
    });

    // #3026 finding 5: pre-fix, `failureCount` carried over across
    // half-open→open→half-open recovery cycles. transitionTo('open',…)
    // only zeroed counts on 'closed', so a flaky pattern grew
    // `failureCount` monotonically — operator dashboards / alerts
    // triggered on absolute failure count saw misleading inflation.
    it('resets failureCount on half-open transition (#3026 finding 5)', async () => {
      expect(breaker.getState()).toBe('half-open');
      // After opening + waiting + transitioning to half-open, the
      // failure count should be 0 — those failures served their
      // threshold purpose when the circuit opened.
      expect(breaker.getSnapshot().failureCount).toBe(0);

      // Cycle: half-open → open (one failure trips it back) → half-open.
      // The failureCount should reset on each half-open re-entry, not
      // grow monotonically.
      await breaker.execute(() => Promise.reject(new Error('flake')));
      expect(breaker.getState()).toBe('open');
      const afterFirstOpen = breaker.getSnapshot().failureCount;

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);
      // Probe via getState() to trigger the timer-based open→half-open
      // transition. After this, failureCount should be 0 again.
      expect(breaker.getState()).toBe('half-open');
      expect(breaker.getSnapshot().failureCount).toBe(0);
      expect(afterFirstOpen).toBeGreaterThan(0); // sanity: count was non-zero before reset
    });

    it('should reject requests beyond half-open limit', async () => {
      expect(breaker.getState()).toBe('half-open');

      const pending: Promise<unknown>[] = [];
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxRequests; i++) {
        pending.push(
          breaker.execute(
            () =>
              new Promise((resolve) => {
                setTimeout(resolve, 1000);
              })
          )
        );
      }

      const result = await breaker.execute(() => Promise.resolve('should be rejected'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.circuitErrorCode).toBe(CircuitErrorCode.CIRCUIT_HALF_OPEN_REJECTED);
      }

      vi.advanceTimersByTime(1000);
      await Promise.all(pending);
    });
  });

  describe('manual operations', () => {
    it('should reset circuit to closed state', async () => {
      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getSnapshot().failureCount).toBe(0);
    });

    it('should allow manual failure recording', () => {
      breaker.recordFailure('timeout');
      breaker.recordFailure('timeout');

      expect(breaker.getSnapshot().failureCount).toBe(2);
    });

    it('should allow manual success recording', () => {
      breaker.recordFailure('crash');
      breaker.recordFailure('crash');

      expect(breaker.getSnapshot().failureCount).toBe(2);

      breaker.recordSuccess();

      expect(breaker.getSnapshot().failureCount).toBe(0);
    });
  });

  describe('failure categorization', () => {
    it('should categorize timeout errors', async () => {
      const events: CircuitStateChangeEvent[] = [];
      breaker.addStateChangeListener((event) => events.push(event));

      await breaker.execute(() => Promise.reject(new Error('Request timeout exceeded')));

      expect(breaker.getSnapshot().failureCount).toBe(1);
    });

    it('should categorize authentication errors', async () => {
      const customBreaker = new CliCircuitBreaker('claude', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        countAuthFailuresAsFailures: true,
      });

      await customBreaker.execute(() =>
        Promise.reject(new Error('Unauthorized: OAuth token expired'))
      );

      expect(customBreaker.getSnapshot().failureCount).toBe(1);
    });

    it('should not count auth failures by default', async () => {
      await breaker.execute(() => Promise.reject(new Error('Unauthorized: OAuth token expired')));

      expect(breaker.getSnapshot().failureCount).toBe(0);
    });

    it('should count rate limit errors as failures by default (#1529)', async () => {
      await breaker.execute(() => Promise.reject(new Error('Rate limit exceeded, please retry')));

      expect(breaker.getSnapshot().failureCount).toBe(1);
    });

    it('should categorize connection errors', async () => {
      await breaker.execute(() => Promise.reject(new Error('ECONNREFUSED: connection refused')));

      expect(breaker.getSnapshot().failureCount).toBe(1);
    });

    it('should categorize crash errors', async () => {
      await breaker.execute(() => Promise.reject(new Error('Process exited with code 1')));

      expect(breaker.getSnapshot().failureCount).toBe(1);
    });
  });

  describe('state change events', () => {
    it('should emit event when circuit opens', async () => {
      const events: CircuitStateChangeEvent[] = [];
      breaker.addStateChangeListener((event) => events.push(event));

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      expect(events).toHaveLength(1);
      const openEvent = events[0];
      expect(openEvent).toBeDefined();
      expect(openEvent!.previousState).toBe('closed');
      expect(openEvent!.newState).toBe('open');
      expect(openEvent!.cliName).toBe('claude');
    });

    it('should emit event when circuit transitions to half-open', async () => {
      const events: CircuitStateChangeEvent[] = [];
      breaker.addStateChangeListener((event) => events.push(event));

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);
      breaker.getState();

      expect(events).toHaveLength(2);
      const halfOpenEvent = events[1];
      expect(halfOpenEvent).toBeDefined();
      expect(halfOpenEvent!.previousState).toBe('open');
      expect(halfOpenEvent!.newState).toBe('half-open');
    });

    it('should emit event when circuit closes', async () => {
      const events: CircuitStateChangeEvent[] = [];
      breaker.addStateChangeListener((event) => events.push(event));

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);
      breaker.getState();

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenSuccessThreshold; i++) {
        await breaker.execute(() => Promise.resolve('success'));
      }

      expect(events).toHaveLength(3);
      const closeEvent = events[2];
      expect(closeEvent).toBeDefined();
      expect(closeEvent!.previousState).toBe('half-open');
      expect(closeEvent!.newState).toBe('closed');
    });

    it('should emit event on manual reset', async () => {
      const events: CircuitStateChangeEvent[] = [];
      breaker.addStateChangeListener((event) => events.push(event));

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      breaker.reset();

      expect(events).toHaveLength(2);
      const resetEvent = events[1];
      expect(resetEvent).toBeDefined();
      expect(resetEvent!.previousState).toBe('open');
      expect(resetEvent!.newState).toBe('closed');
      expect(resetEvent!.reason).toBe('Manual reset');
    });

    it('should allow removing listeners', async () => {
      const events: CircuitStateChangeEvent[] = [];
      const listener = (event: CircuitStateChangeEvent): void => {
        events.push(event);
      };

      breaker.addStateChangeListener(listener);
      breaker.removeStateChangeListener(listener);

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      expect(events).toHaveLength(0);
    });

    it('should ignore listener errors and continue processing', async () => {
      const events: CircuitStateChangeEvent[] = [];
      const throwingListener = (): void => {
        throw new Error('Listener error');
      };
      const safeListener = (event: CircuitStateChangeEvent): void => {
        events.push(event);
      };

      breaker.addStateChangeListener(throwingListener);
      breaker.addStateChangeListener(safeListener);

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('test error')));
      }

      // The safe listener should still receive events even though the first listener throws
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event).toBeDefined();
      expect(event!.newState).toBe('open');
    });
  });

  describe('custom configuration', () => {
    it('should respect custom failure threshold', async () => {
      const customBreaker = new CliCircuitBreaker('gemini', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 3,
      });

      await customBreaker.execute(() => Promise.reject(new Error('error')));
      await customBreaker.execute(() => Promise.reject(new Error('error')));
      expect(customBreaker.getState()).toBe('closed');

      await customBreaker.execute(() => Promise.reject(new Error('error')));
      expect(customBreaker.getState()).toBe('open');
    });

    it('should respect custom reset timeout', async () => {
      const customBreaker = new CliCircuitBreaker('gemini', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 1,
        resetTimeoutMs: 10_000,
      });

      await customBreaker.execute(() => Promise.reject(new Error('error')));
      expect(customBreaker.getState()).toBe('open');

      vi.advanceTimersByTime(5_000);
      expect(customBreaker.getState()).toBe('open');

      vi.advanceTimersByTime(5_001);
      expect(customBreaker.getState()).toBe('half-open');
    });

    it('should respect custom half-open success threshold', async () => {
      const customBreaker = new CliCircuitBreaker('codex', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 1,
        halfOpenSuccessThreshold: 3,
      });

      await customBreaker.execute(() => Promise.reject(new Error('error')));

      vi.advanceTimersByTime(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs + 1);

      await customBreaker.execute(() => Promise.resolve('success'));
      await customBreaker.execute(() => Promise.resolve('success'));
      expect(customBreaker.getState()).toBe('half-open');

      await customBreaker.execute(() => Promise.resolve('success'));
      expect(customBreaker.getState()).toBe('closed');
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new CircuitBreakerRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('breaker management', () => {
    it('should create breakers on demand', () => {
      const breaker = registry.getBreaker('claude');
      expect(breaker).toBeInstanceOf(CliCircuitBreaker);
      expect(breaker.getState()).toBe('closed');
    });

    it('should return same breaker for same CLI', () => {
      const breaker1 = registry.getBreaker('claude');
      const breaker2 = registry.getBreaker('claude');
      expect(breaker1).toBe(breaker2);
    });

    it('should create different breakers for different CLIs', () => {
      const claudeBreaker = registry.getBreaker('claude');
      const geminiBreaker = registry.getBreaker('gemini');
      expect(claudeBreaker).not.toBe(geminiBreaker);
    });

    it('should apply default config to new breakers', () => {
      const customRegistry = new CircuitBreakerRegistry({
        failureThreshold: 10,
      });

      const breaker = customRegistry.getBreaker('claude');
      expect(breaker.getSnapshot().config.failureThreshold).toBe(10);
    });

    it('should apply per-CLI config when provided', () => {
      const breaker = registry.getBreaker('claude', {
        failureThreshold: 3,
      });
      expect(breaker.getSnapshot().config.failureThreshold).toBe(3);
    });
  });

  describe('health checks', () => {
    it('should report isOpen correctly', async () => {
      const breaker = registry.getBreaker('claude');

      expect(registry.isOpen('claude')).toBe(false);

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('error')));
      }

      expect(registry.isOpen('claude')).toBe(true);
    });

    it('should return false for unknown CLI', () => {
      expect(registry.isOpen('claude')).toBe(false);
    });

    it('should get healthy CLIs', async () => {
      registry.getBreaker('claude');
      registry.getBreaker('gemini');
      const codexBreaker = registry.getBreaker('codex');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await codexBreaker.execute(() => Promise.reject(new Error('error')));
      }

      const healthy = registry.getHealthyClis();
      expect(healthy).toContain('claude');
      expect(healthy).toContain('gemini');
      expect(healthy).not.toContain('codex');
    });

    it('should get unhealthy CLIs', async () => {
      registry.getBreaker('claude');
      const geminiBreaker = registry.getBreaker('gemini');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await geminiBreaker.execute(() => Promise.reject(new Error('error')));
      }

      const unhealthy = registry.getUnhealthyClis();
      expect(unhealthy).toContain('gemini');
      expect(unhealthy).not.toContain('claude');
    });
  });

  describe('reset operations', () => {
    it('should reset specific breaker', async () => {
      const breaker = registry.getBreaker('claude');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('error')));
      }
      expect(breaker.getState()).toBe('open');

      registry.reset('claude');
      expect(breaker.getState()).toBe('closed');
    });

    it('should reset all breakers', async () => {
      const claudeBreaker = registry.getBreaker('claude');
      const geminiBreaker = registry.getBreaker('gemini');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await claudeBreaker.execute(() => Promise.reject(new Error('error')));
        await geminiBreaker.execute(() => Promise.reject(new Error('error')));
      }

      expect(claudeBreaker.getState()).toBe('open');
      expect(geminiBreaker.getState()).toBe('open');

      registry.resetAll();

      expect(claudeBreaker.getState()).toBe('closed');
      expect(geminiBreaker.getState()).toBe('closed');
    });
  });

  describe('snapshots', () => {
    it('should get all snapshots', async () => {
      const claudeBreaker = registry.getBreaker('claude');
      registry.getBreaker('gemini');

      await claudeBreaker.execute(() => Promise.reject(new Error('error')));

      const snapshots = registry.getAllSnapshots();

      expect(snapshots.size).toBe(2);
      expect(snapshots.get('claude')?.failureCount).toBe(1);
      expect(snapshots.get('gemini')?.failureCount).toBe(0);
    });
  });

  describe('global listeners', () => {
    it('should add global listeners to new breakers', async () => {
      const events: CircuitStateChangeEvent[] = [];
      registry.addGlobalStateChangeListener((event) => events.push(event));

      const breaker = registry.getBreaker('claude');

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('error')));
      }

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event).toBeDefined();
      expect(event!.cliName).toBe('claude');
    });

    it('should add global listeners to existing breakers', async () => {
      const breaker = registry.getBreaker('claude');

      const events: CircuitStateChangeEvent[] = [];
      registry.addGlobalStateChangeListener((event) => events.push(event));

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('error')));
      }

      expect(events).toHaveLength(1);
    });

    it('should remove global listeners', async () => {
      const events: CircuitStateChangeEvent[] = [];
      const listener = (event: CircuitStateChangeEvent): void => {
        events.push(event);
      };

      registry.addGlobalStateChangeListener(listener);
      const breaker = registry.getBreaker('claude');
      registry.removeGlobalStateChangeListener(listener);

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
        await breaker.execute(() => Promise.reject(new Error('error')));
      }

      expect(events).toHaveLength(0);
    });
  });
});

describe('mapCliErrorToCategory', () => {
  it('should map TIMEOUT to timeout', () => {
    expect(mapCliErrorToCategory('TIMEOUT')).toBe('timeout');
  });

  it('should map NOT_AUTHENTICATED to authentication', () => {
    expect(mapCliErrorToCategory('NOT_AUTHENTICATED')).toBe('authentication');
  });

  it('should map RATE_LIMITED to rate_limit', () => {
    expect(mapCliErrorToCategory('RATE_LIMITED')).toBe('rate_limit');
  });

  it('should map CONNECTION_ERROR to connection', () => {
    expect(mapCliErrorToCategory('CONNECTION_ERROR')).toBe('connection');
  });

  it('should map other errors to unknown', () => {
    expect(mapCliErrorToCategory('NOT_FOUND')).toBe('unknown');
    expect(mapCliErrorToCategory('PARSE_ERROR')).toBe('unknown');
    expect(mapCliErrorToCategory('EXECUTION_ERROR')).toBe('unknown');
    expect(mapCliErrorToCategory('UNSUPPORTED_VERSION')).toBe('unknown');
    expect(mapCliErrorToCategory('UNKNOWN')).toBe('unknown');
  });
});

describe('mapModelErrorToCategory', () => {
  it('should map MODEL_TIMEOUT to timeout', () => {
    expect(mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.MODEL_TIMEOUT }))).toBe(
      'timeout'
    );
  });

  it('should map TIMEOUT_ERROR to timeout', () => {
    expect(mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.TIMEOUT_ERROR }))).toBe(
      'timeout'
    );
  });

  it('should map UNAUTHORIZED to authentication', () => {
    expect(mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.UNAUTHORIZED }))).toBe(
      'authentication'
    );
  });

  it('should map MODEL_RATE_LIMITED to rate_limit', () => {
    expect(
      mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.MODEL_RATE_LIMITED }))
    ).toBe('rate_limit');
  });

  it('should map RATE_LIMIT_ERROR to rate_limit', () => {
    expect(mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.RATE_LIMIT_ERROR }))).toBe(
      'rate_limit'
    );
  });

  it('should map MODEL_UNAVAILABLE to connection', () => {
    expect(
      mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.MODEL_UNAVAILABLE }))
    ).toBe('connection');
  });

  it('should map MODEL_NOT_FOUND to connection', () => {
    expect(mapModelErrorToCategory(new ModelError('x', { code: ErrorCode.MODEL_NOT_FOUND }))).toBe(
      'connection'
    );
  });

  it('should map plain MODEL_ERROR to unknown when message is uninformative', () => {
    expect(mapModelErrorToCategory(new ModelError('something went wrong'))).toBe('unknown');
  });

  it('should fall back to message-pattern categorization for MODEL_ERROR', () => {
    // A generic MODEL_ERROR whose message is connection-ish should categorize
    // as `connection` via the categorizeError fallback, not `unknown`.
    expect(mapModelErrorToCategory(new ModelError('ECONNREFUSED: connection refused'))).toBe(
      'connection'
    );
  });
});

describe('categorizeError', () => {
  it('should return unknown for non-Error values', () => {
    expect(categorizeError('string error')).toBe('unknown');
    expect(categorizeError(123)).toBe('unknown');
    expect(categorizeError(null)).toBe('unknown');
    expect(categorizeError(undefined)).toBe('unknown');
    expect(categorizeError({ message: 'object error' })).toBe('unknown');
  });

  it('should categorize timeout errors', () => {
    expect(categorizeError(new Error('Request timeout'))).toBe('timeout');
    expect(categorizeError(new Error('Operation timed out'))).toBe('timeout');
  });

  it('should categorize authentication errors', () => {
    expect(categorizeError(new Error('Unauthorized access'))).toBe('authentication');
    expect(categorizeError(new Error('OAuth token expired'))).toBe('authentication');
    expect(categorizeError(new Error('Forbidden resource'))).toBe('authentication');
    expect(categorizeError(new Error('Auth failed'))).toBe('authentication');
  });

  it('should categorize rate limit errors', () => {
    expect(categorizeError(new Error('Rate limit exceeded'))).toBe('rate_limit');
    expect(categorizeError(new Error('Too many requests'))).toBe('rate_limit');
    expect(categorizeError(new Error('HTTP 429 error'))).toBe('rate_limit');
    expect(categorizeError(new Error('Key limit exceeded'))).toBe('rate_limit');
  });

  it('should categorize connection errors', () => {
    expect(categorizeError(new Error('Connection refused'))).toBe('connection');
    expect(categorizeError(new Error('ECONNREFUSED'))).toBe('connection');
    expect(categorizeError(new Error('ENOTFOUND'))).toBe('connection');
    expect(categorizeError(new Error('MCP connection lost'))).toBe('connection');
  });

  it('should categorize EADDRINUSE as connection errors', () => {
    expect(categorizeError(new Error('EADDRINUSE: address already in use :::3000'))).toBe(
      'connection'
    );
    expect(categorizeError(new Error('listen EADDRINUSE :::8080'))).toBe('connection');
    expect(categorizeError(new Error('address already in use'))).toBe('connection');
  });

  it('should categorize crash errors', () => {
    expect(categorizeError(new Error('Process crashed'))).toBe('crash');
    expect(categorizeError(new Error('Process exited unexpectedly'))).toBe('crash');
    expect(categorizeError(new Error('Killed by SIGTERM'))).toBe('crash');
    expect(categorizeError(new Error('SIGKILL received'))).toBe('crash');
  });

  it('should return unknown for unrecognized errors', () => {
    expect(categorizeError(new Error('Some random error'))).toBe('unknown');
    expect(categorizeError(new Error('Network error'))).toBe('unknown');
    expect(categorizeError(new Error(''))).toBe('unknown');
  });

  it('should check error name as well as message', () => {
    const timeoutError = new Error('Some error');
    timeoutError.name = 'TimeoutError';
    expect(categorizeError(timeoutError)).toBe('timeout');
  });
});
