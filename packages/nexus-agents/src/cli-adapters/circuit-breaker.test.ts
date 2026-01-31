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
  createCircuitBreakerRegistryWithMetrics,
  categorizeError,
  integrateCapacityMonitorWithCircuitBreaker,
  type CircuitStateChangeEvent,
} from './circuit-breaker.js';

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
        expect(result.error.message).toContain('null');
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

    it('should categorize rate limit errors', async () => {
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

describe('createCircuitBreakerRegistryWithMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create registry with logging listener', async () => {
    const logMessages: Array<{ message: string; context: Record<string, unknown> | undefined }> =
      [];
    const mockLogger = {
      info: (message: string, context?: Record<string, unknown>): void => {
        logMessages.push({ message, context });
      },
    };

    const registry = createCircuitBreakerRegistryWithMetrics(mockLogger);
    const breaker = registry.getBreaker('claude');

    for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
      await breaker.execute(() => Promise.reject(new Error('error')));
    }

    expect(logMessages).toHaveLength(1);
    const logEntry = logMessages[0];
    expect(logEntry).toBeDefined();
    expect(logEntry!.message).toBe('Circuit breaker state change');
    expect(logEntry!.context?.cliName).toBe('claude');
    expect(logEntry!.context?.previousState).toBe('closed');
    expect(logEntry!.context?.newState).toBe('open');
  });

  it('should apply custom config', () => {
    const mockLogger = { info: vi.fn() };
    const registry = createCircuitBreakerRegistryWithMetrics(mockLogger, {
      failureThreshold: 10,
    });

    const breaker = registry.getBreaker('claude');
    expect(breaker.getSnapshot().config.failureThreshold).toBe(10);
  });
});

describe('CircuitError', () => {
  it('should contain circuit breaker context', () => {
    const error = new CircuitError('Test error', {
      circuitErrorCode: CircuitErrorCode.CIRCUIT_OPEN,
      cliName: 'claude',
      circuitState: 'open',
    });

    expect(error.circuitErrorCode).toBe(CircuitErrorCode.CIRCUIT_OPEN);
    expect(error.cliName).toBe('claude');
    expect(error.circuitState).toBe('open');
    expect(error.name).toBe('CircuitError');
  });

  it('should include failure category when provided', () => {
    const error = new CircuitError('Test error', {
      circuitErrorCode: CircuitErrorCode.EXECUTION_FAILED,
      cliName: 'gemini',
      circuitState: 'closed',
      failureCategory: 'timeout',
    });

    expect(error.failureCategory).toBe('timeout');
  });

  it('should include cause when provided', () => {
    const cause = new Error('Original error');
    const error = new CircuitError('Wrapped error', {
      circuitErrorCode: CircuitErrorCode.EXECUTION_FAILED,
      cliName: 'codex',
      circuitState: 'half-open',
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('should serialize to JSON correctly', () => {
    const error = new CircuitError('Test error', {
      circuitErrorCode: CircuitErrorCode.CIRCUIT_OPEN,
      cliName: 'claude',
      circuitState: 'open',
      failureCategory: 'rate_limit',
    });

    const json = error.toJSON();

    expect(json.name).toBe('CircuitError');
    expect(json.message).toBe('Test error');
    expect(json.context?.circuitErrorCode).toBe(CircuitErrorCode.CIRCUIT_OPEN);
    expect(json.context?.cliName).toBe('claude');
    expect(json.context?.circuitState).toBe('open');
    expect(json.context?.failureCategory).toBe('rate_limit');
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
  });

  it('should categorize connection errors', () => {
    expect(categorizeError(new Error('Connection refused'))).toBe('connection');
    expect(categorizeError(new Error('ECONNREFUSED'))).toBe('connection');
    expect(categorizeError(new Error('ENOTFOUND'))).toBe('connection');
    expect(categorizeError(new Error('MCP connection lost'))).toBe('connection');
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

describe('integrateCapacityMonitorWithCircuitBreaker', () => {
  let registry: CircuitBreakerRegistry;
  let mockMonitor: {
    callbacks: Array<(provider: string, remaining: number) => void>;
    onLowCapacity: (callback: (provider: string, remaining: number) => void) => () => void;
  };
  let mockLogger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
    mockMonitor = {
      callbacks: [],
      onLowCapacity: (callback) => {
        mockMonitor.callbacks.push(callback);
        return () => {
          const index = mockMonitor.callbacks.indexOf(callback);
          if (index >= 0) mockMonitor.callbacks.splice(index, 1);
        };
      },
    };
    mockLogger = { warn: vi.fn() };
  });

  it('should register callback with capacity monitor', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry);
    expect(mockMonitor.callbacks.length).toBe(1);
  });

  it('should return unsubscribe function', () => {
    const unsubscribe = integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry);
    expect(mockMonitor.callbacks.length).toBe(1);
    unsubscribe();
    expect(mockMonitor.callbacks.length).toBe(0);
  });

  it('should trip circuit breaker when capacity is critically low', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry, {
      criticalTokenThreshold: 1000,
    });

    // Get a breaker first
    registry.getBreaker('claude');

    // Simulate low capacity callback
    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('anthropic', 500); // Below threshold
    }

    // Circuit should have recorded failure
    const snapshot = registry.getBreaker('claude').getSnapshot();
    expect(snapshot.failureCount).toBeGreaterThan(0);
  });

  it('should not trip circuit breaker when capacity is above threshold', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry, {
      criticalTokenThreshold: 1000,
    });

    registry.getBreaker('claude');

    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('anthropic', 5000); // Above threshold
    }

    const snapshot = registry.getBreaker('claude').getSnapshot();
    expect(snapshot.failureCount).toBe(0);
  });

  it('should map provider names to CLI names correctly', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry, {
      criticalTokenThreshold: 1000,
    });

    registry.getBreaker('codex');
    registry.getBreaker('gemini');

    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('openai', 100);
      callback('google', 100);
    }

    expect(registry.getBreaker('codex').getSnapshot().failureCount).toBeGreaterThan(0);
    expect(registry.getBreaker('gemini').getSnapshot().failureCount).toBeGreaterThan(0);
  });

  it('should log warning for unknown providers', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry, undefined, mockLogger);

    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('unknown-provider', 100);
    }

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Unknown provider for capacity monitoring',
      expect.objectContaining({ provider: 'unknown-provider' })
    );
  });

  it('should log warning when circuit is tripped', () => {
    integrateCapacityMonitorWithCircuitBreaker(
      mockMonitor,
      registry,
      { criticalTokenThreshold: 1000 },
      mockLogger
    );

    registry.getBreaker('claude');

    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('anthropic', 500);
    }

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Circuit tripped due to low capacity',
      expect.objectContaining({
        provider: 'anthropic',
        cliName: 'claude',
        remaining: 500,
        threshold: 1000,
      })
    );
  });

  it('should support custom provider to CLI mapping', () => {
    integrateCapacityMonitorWithCircuitBreaker(mockMonitor, registry, {
      criticalTokenThreshold: 1000,
      providerToCliMapping: {
        'my-custom-provider': 'claude',
      },
    });

    registry.getBreaker('claude');

    const callback = mockMonitor.callbacks[0];
    expect(callback).toBeDefined();
    if (callback !== undefined) {
      callback('my-custom-provider', 500);
    }

    expect(registry.getBreaker('claude').getSnapshot().failureCount).toBeGreaterThan(0);
  });
});
