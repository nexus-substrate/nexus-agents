/**
 * Tests for Resilient Adapter
 *
 * @module adapters/resilient-adapter.test
 * (Source: Issue #811 - Resilient model adapter architecture)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterSelection } from './auto-adapter.js';
import type {} from '../core/types/model.js';
import { ok, err } from '../core/result.js';
import { ModelError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/index.js';
import type { CircuitStateChangeEvent } from '../cli-adapters/circuit-breaker-types.js';
import {
  CircuitBreakerRegistry,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../cli-adapters/circuit-breaker.js';

// ============================================================================
// Mocks — vi.mock is hoisted, so use inline factories only
// ============================================================================

const mockComplete = vi.fn();
const mockStream = vi.fn();
const mockCountTokens = vi.fn();
const mockValidateConfig = vi.fn();

vi.mock('./auto-adapter.js', () => {
  const createAutoAdapterMock = vi.fn();
  return { createAutoAdapter: createAutoAdapterMock };
});

vi.mock('../agents/collaboration/event-bus.js', () => ({
  getGlobalEventBus: vi.fn().mockReturnValue({ emit: vi.fn() }),
}));

vi.mock('./rate-limit-detector.js', () => ({
  isRateLimitLikeError: vi.fn().mockReturnValue(false),
  toRateLimitError: vi.fn().mockReturnValue({ message: 'rate limit', retryAfterMs: undefined }),
  recordRateLimitEvent: vi.fn(),
}));

import { createAutoAdapter } from './auto-adapter.js';
import { ResilientAdapter } from './resilient-adapter.js';
import {
  isRateLimitLikeError,
  toRateLimitError,
  recordRateLimitEvent,
} from './rate-limit-detector.js';
import { getGlobalEventBus } from '../core/event-bus.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSelection(name = 'claude') {
  return {
    adapter: {
      providerId: 'mock-provider',
      modelId: 'mock-model',
      capabilities: ['completion'],
      complete: mockComplete,
      stream: mockStream,
      countTokens: mockCountTokens,
      validateConfig: mockValidateConfig,
    },
    source: 'cli' as const,
    name,
    reason: 'test',
  } satisfies AdapterSelection;
}

function setupDefaultMocks(): void {
  mockComplete.mockReturnValue(
    Promise.resolve(
      ok({
        content: [{ type: 'text', text: 'hello' }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        stopReason: 'end_turn',
        model: 'mock-model',
      })
    )
  );
  mockCountTokens.mockReturnValue(Promise.resolve(42));
  mockValidateConfig.mockReturnValue(ok(undefined));
  vi.mocked(createAutoAdapter).mockReturnValue(Promise.resolve(makeSelection()));
}

// ============================================================================
// Tests
// ============================================================================

describe('ResilientAdapter', () => {
  let adapter: ResilientAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    adapter = new ResilientAdapter();
  });

  describe('lazy initialization', () => {
    it('does not detect adapter at construction', () => {
      expect(createAutoAdapter).not.toHaveBeenCalled();
      expect(adapter.getHealth()).toBeUndefined();
    });

    it('detects adapter on first complete() call', async () => {
      await adapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);
      expect(adapter.getHealth()).toBeDefined();
      expect(adapter.getHealth()?.state).toBe('healthy');
    });

    it('detects adapter on first countTokens() call', async () => {
      const count = await adapter.countTokens('hello');
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);
      expect(count).toBe(42);
    });
  });

  describe('caching', () => {
    it('reuses cached adapter on subsequent calls', async () => {
      await adapter.complete({ messages: [] });
      await adapter.complete({ messages: [] });
      await adapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('property forwarding', () => {
    it('returns proxy values before detection', () => {
      expect(adapter.providerId).toBe('resilient-proxy');
      expect(adapter.modelId).toBe('pending-detection');
      expect(adapter.capabilities).toEqual([]);
    });

    it('forwards properties after detection', async () => {
      await adapter.complete({ messages: [] });
      expect(adapter.providerId).toBe('mock-provider');
      expect(adapter.modelId).toBe('mock-model');
    });
  });

  describe('validateConfig', () => {
    it('returns ok before detection', () => {
      const result = adapter.validateConfig();
      expect(result.ok).toBe(true);
    });

    it('delegates to underlying adapter after detection', async () => {
      await adapter.complete({ messages: [] });
      adapter.validateConfig();
      expect(mockValidateConfig).toHaveBeenCalled();
    });
  });

  describe('detection failure', () => {
    it('returns ModelError when no adapter available', async () => {
      vi.mocked(createAutoAdapter).mockRejectedValueOnce(new Error('No CLIs'));
      const result = await adapter.complete({ messages: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ModelError);
      }
      expect(adapter.getHealth()?.state).toBe('unavailable');
    });

    it('retries detection after failure on next call', async () => {
      vi.mocked(createAutoAdapter).mockRejectedValueOnce(new Error('No CLIs'));
      await adapter.complete({ messages: [] });
      expect(adapter.getHealth()?.state).toBe('unavailable');

      vi.mocked(createAutoAdapter).mockResolvedValueOnce(makeSelection());
      await adapter.complete({ messages: [] });
      expect(adapter.getHealth()?.state).toBe('healthy');
      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh()', () => {
    it('invalidates cache and re-detects', async () => {
      await adapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);

      await adapter.refresh();
      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe('setPreferredCli()', () => {
    it('clears cache and uses preferred CLI on next call', async () => {
      await adapter.complete({ messages: [] });

      adapter.setPreferredCli('gemini');
      await adapter.complete({ messages: [] });

      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(createAutoAdapter).mock.calls[1];
      expect(secondCall?.[0]).toMatchObject({ preferredCli: 'gemini' });
    });
  });

  describe('onFailover callback', () => {
    it('fires on failover after refresh', async () => {
      await adapter.complete({ messages: [] });

      const callback = vi.fn();
      adapter.onFailover(callback);

      vi.mocked(createAutoAdapter).mockResolvedValueOnce(makeSelection('gemini'));
      await adapter.refresh();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ failoverCount: 1 }));
    });

    it('returns unsubscribe function', async () => {
      await adapter.complete({ messages: [] });

      const callback = vi.fn();
      const unsub = adapter.onFailover(callback);
      unsub();

      await adapter.refresh();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('circuit breaker integration', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function makeMockRegistry() {
      const listeners = new Set<(event: CircuitStateChangeEvent) => void>();
      const registry = {
        addGlobalStateChangeListener: vi.fn((cb: (event: CircuitStateChangeEvent) => void) => {
          listeners.add(cb);
        }),
        removeGlobalStateChangeListener: vi.fn((cb: (event: CircuitStateChangeEvent) => void) => {
          listeners.delete(cb);
        }),
      } as unknown as CircuitBreakerRegistry;
      return { registry, listeners };
    }

    it('clears adapter when current CLI circuit opens', async () => {
      await adapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);

      const { registry, listeners } = makeMockRegistry();
      adapter.attachCircuitBreakerRegistry(registry);

      for (const listener of listeners) {
        listener({
          cliName: 'claude',
          previousState: 'closed',
          newState: 'open',
          timestamp: Date.now(),
          failureCount: 5,
          reason: 'Failure threshold exceeded',
        });
      }

      expect(adapter.getHealth()?.state).toBe('degraded');

      await adapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
    });

    it('ignores circuit events for non-current CLIs', async () => {
      await adapter.complete({ messages: [] });

      const { registry, listeners } = makeMockRegistry();
      adapter.attachCircuitBreakerRegistry(registry);

      for (const listener of listeners) {
        listener({
          cliName: 'gemini',
          previousState: 'closed',
          newState: 'open',
          timestamp: Date.now(),
          failureCount: 5,
          reason: 'Failure threshold exceeded',
        });
      }

      expect(adapter.getHealth()?.state).toBe('healthy');
    });
  });

  describe('detection coalescing (#1423)', () => {
    it('coalesces concurrent detection into a single probe call', async () => {
      let resolveDetection: ((v: AdapterSelection) => void) | undefined;
      vi.mocked(createAutoAdapter).mockImplementation(
        () =>
          new Promise<AdapterSelection>((resolve) => {
            resolveDetection = resolve;
          })
      );

      const freshAdapter = new ResilientAdapter();

      // Launch 3 concurrent complete() calls — all trigger ensureAdapter()
      const p1 = freshAdapter.complete({ messages: [] });
      const p2 = freshAdapter.complete({ messages: [] });
      const p3 = freshAdapter.complete({ messages: [] });

      // Resolve the single detection
      resolveDetection!(makeSelection());

      await Promise.all([p1, p2, p3]);

      // createAutoAdapter should only be called ONCE despite 3 concurrent calls
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);
    });

    it('allows new detection after previous completes', async () => {
      const freshAdapter = new ResilientAdapter();
      await freshAdapter.complete({ messages: [] });
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);

      // Force re-detection via refresh
      await freshAdapter.refresh();
      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe('stream() when adapter unavailable', () => {
    it('throws instead of silently yielding nothing — matches complete() error semantics', async () => {
      // #3105: a bare `return` made an unavailable adapter look like a clean
      // empty stream, so streamWithFallback could not tell failure from a
      // legitimately-empty completion. stream() now errors like complete().
      vi.mocked(createAutoAdapter).mockRejectedValueOnce(new Error('No CLIs'));
      const drain = (async () => {
        const chunks: unknown[] = [];
        for await (const chunk of adapter.stream({ messages: [] })) {
          chunks.push(chunk);
        }
        return chunks;
      })();
      await expect(drain).rejects.toThrow('No model adapter available');
    });
  });

  describe('countTokens() when adapter unavailable', () => {
    it('returns 0 when no adapter detected', async () => {
      vi.mocked(createAutoAdapter).mockRejectedValueOnce(new Error('No CLIs'));
      const count = await adapter.countTokens('hello');
      expect(count).toBe(0);
    });
  });

  describe('rate limit detection in complete()', () => {
    it('records rate limit event when error is rate-limit-like', async () => {
      const rateLimitError = new ModelError('Rate limit exceeded, retry after 30 seconds');
      mockComplete.mockReturnValue(Promise.resolve(err(rateLimitError)));
      vi.mocked(isRateLimitLikeError).mockReturnValue(true);
      vi.mocked(toRateLimitError).mockReturnValue({
        message: 'Rate limit exceeded',
        retryAfterMs: 30000,
      } as unknown as ReturnType<typeof toRateLimitError>);

      const result = await adapter.complete({ messages: [] });

      expect(result.ok).toBe(false);
      expect(isRateLimitLikeError).toHaveBeenCalledWith(rateLimitError);
      expect(toRateLimitError).toHaveBeenCalledWith(rateLimitError, 'mock-provider');
      expect(recordRateLimitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'mock-provider',
          retryAfterMs: 30000,
        })
      );
    });

    it('does not record rate limit event for non-rate-limit errors', async () => {
      const genericError = new ModelError('Something went wrong');
      mockComplete.mockReturnValue(Promise.resolve(err(genericError)));
      vi.mocked(isRateLimitLikeError).mockReturnValue(false);

      await adapter.complete({ messages: [] });

      expect(recordRateLimitEvent).not.toHaveBeenCalled();
    });
  });

  describe('circuit breaker non-open state handling', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function makeMockRegistry() {
      const listeners = new Set<(event: CircuitStateChangeEvent) => void>();
      const registry = {
        addGlobalStateChangeListener: vi.fn((cb: (event: CircuitStateChangeEvent) => void) => {
          listeners.add(cb);
        }),
        removeGlobalStateChangeListener: vi.fn((cb: (event: CircuitStateChangeEvent) => void) => {
          listeners.delete(cb);
        }),
      } as unknown as CircuitBreakerRegistry;
      return { registry, listeners };
    }

    it('ignores half-open state changes for current CLI', async () => {
      await adapter.complete({ messages: [] });
      const { registry, listeners } = makeMockRegistry();
      adapter.attachCircuitBreakerRegistry(registry);

      for (const listener of listeners) {
        listener({
          cliName: 'claude',
          previousState: 'open',
          newState: 'half-open',
          timestamp: Date.now(),
          failureCount: 5,
          reason: 'Half-open probe',
        });
      }

      expect(adapter.getHealth()?.state).toBe('healthy');
    });

    it('ignores closed state changes for current CLI', async () => {
      await adapter.complete({ messages: [] });
      const { registry, listeners } = makeMockRegistry();
      adapter.attachCircuitBreakerRegistry(registry);

      for (const listener of listeners) {
        listener({
          cliName: 'claude',
          previousState: 'half-open',
          newState: 'closed',
          timestamp: Date.now(),
          failureCount: 0,
          reason: 'Recovered',
        });
      }

      expect(adapter.getHealth()?.state).toBe('healthy');
    });
  });

  describe('failover callback error handling', () => {
    it('catches and logs errors thrown by failover callbacks', async () => {
      await adapter.complete({ messages: [] });

      const throwingCallback = vi.fn(() => {
        throw new Error('Callback exploded');
      });
      adapter.onFailover(throwingCallback);

      // Trigger failover via refresh with a different adapter name
      vi.mocked(createAutoAdapter).mockResolvedValueOnce(makeSelection('gemini'));
      await adapter.refresh();

      // Callback was called and error was caught (no throw propagated)
      expect(throwingCallback).toHaveBeenCalledTimes(1);
      expect(adapter.getHealth()?.state).toBe('healthy');
    });
  });

  describe('EventBus emit failure handling', () => {
    it('catches EventBus errors during failover emit', async () => {
      await adapter.complete({ messages: [] });

      vi.mocked(getGlobalEventBus).mockImplementation(() => {
        throw new Error('EventBus unavailable');
      });

      // Trigger failover
      vi.mocked(createAutoAdapter).mockResolvedValueOnce(makeSelection('codex'));
      await adapter.refresh();

      // Failover completed despite EventBus error
      expect(adapter.getHealth()?.state).toBe('healthy');
      expect(adapter.getHealth()?.failoverCount).toBe(1);
    });
  });

  describe('mapSelectionSource with API source', () => {
    it('returns api when selection source is not cli', async () => {
      vi.mocked(createAutoAdapter).mockResolvedValueOnce({
        ...makeSelection(),
        source: 'api' as const,
      });

      await adapter.complete({ messages: [] });

      expect(adapter.getHealth()?.source).toBe('api');
    });
  });

  describe('dispose()', () => {
    it('removes circuit breaker listener', () => {
      const removeListener = vi.fn();
      const registry = {
        addGlobalStateChangeListener: vi.fn(),
        removeGlobalStateChangeListener: removeListener,
      } as unknown as CircuitBreakerRegistry;

      adapter.attachCircuitBreakerRegistry(registry);
      adapter.dispose();

      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('is safe to call multiple times', () => {
      adapter.dispose();
      adapter.dispose();
    });
  });

  describe('API failure → circuit breaker (#3423)', () => {
    function makeLogger(): ILogger {
      const logger: ILogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => logger),
        setLevel: vi.fn(),
      };
      return logger;
    }

    it('opens the breaker after repeated API ModelError failures', async () => {
      const registry = new CircuitBreakerRegistry();
      const failingAdapter = new ResilientAdapter();
      failingAdapter.attachCircuitBreakerRegistry(registry);

      mockComplete.mockReturnValue(
        Promise.resolve(err(new ModelError('upstream failed', { code: ErrorCode.MODEL_ERROR })))
      );

      const threshold = DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold;
      for (let i = 0; i < threshold; i++) {
        await failingAdapter.complete({ messages: [] });
      }

      expect(registry.getBreaker('claude').getState()).toBe('open');
    });

    it('clears the cached adapter and re-detects (failover) once the breaker opens', async () => {
      const registry = new CircuitBreakerRegistry();
      const failingAdapter = new ResilientAdapter();
      failingAdapter.attachCircuitBreakerRegistry(registry);

      const onFailover = vi.fn();
      failingAdapter.onFailover(onFailover);

      mockComplete.mockReturnValue(
        Promise.resolve(err(new ModelError('upstream failed', { code: ErrorCode.MODEL_ERROR })))
      );

      const threshold = DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold;
      // First call detects the 'claude' adapter; reaching the threshold opens
      // the breaker, whose open event clears the cached adapter.
      for (let i = 0; i < threshold; i++) {
        await failingAdapter.complete({ messages: [] });
      }
      expect(createAutoAdapter).toHaveBeenCalledTimes(1);
      expect(failingAdapter.getHealth()?.state).toBe('degraded');

      // Next call re-detects (failover) — a different adapter name confirms
      // the failover path fired.
      vi.mocked(createAutoAdapter).mockResolvedValueOnce(makeSelection('gemini'));
      mockComplete.mockReturnValueOnce(
        Promise.resolve(
          ok({
            content: [{ type: 'text', text: 'ok' }],
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            stopReason: 'end_turn',
            model: 'mock-model',
          })
        )
      );
      await failingAdapter.complete({ messages: [] });

      expect(createAutoAdapter).toHaveBeenCalledTimes(2);
      expect(onFailover).toHaveBeenCalledTimes(1);
      expect(failingAdapter.getHealth()?.failoverCount).toBe(1);
    });

    it('never leaks credential-bearing error content into the logged payload', async () => {
      const registry = new CircuitBreakerRegistry();
      const breaker = registry.getBreaker('claude');
      const recordFailureSpy = vi.spyOn(breaker, 'recordFailure');
      const logger = makeLogger();
      const failingAdapter = new ResilientAdapter({ logger });
      failingAdapter.attachCircuitBreakerRegistry(registry);

      // Use a code that maps deterministically (MODEL_UNAVAILABLE → connection)
      // so the secret in the message cannot influence the category.
      const secretError = new ModelError('failed for key sk-SECRET-deadbeef', {
        code: ErrorCode.MODEL_UNAVAILABLE,
      });
      mockComplete.mockReturnValue(Promise.resolve(err(secretError)));

      await failingAdapter.complete({ messages: [] });

      // recordFailure received only a FailureCategory string, never the error.
      expect(recordFailureSpy).toHaveBeenCalledTimes(1);
      expect(recordFailureSpy).toHaveBeenCalledWith('connection');
      const recordedArg = recordFailureSpy.mock.calls[0]?.[0];
      expect(typeof recordedArg).toBe('string');

      // No logged call's serialized args contain the secret.
      const allLogCalls = [
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.debug).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
      ];
      for (const call of allLogCalls) {
        expect(JSON.stringify(call)).not.toContain('sk-SECRET');
      }
    });

    it('does not double-count rate-limit failures against the breaker', async () => {
      const registry = new CircuitBreakerRegistry();
      const breaker = registry.getBreaker('claude');
      const recordFailureSpy = vi.spyOn(breaker, 'recordFailure');
      const failingAdapter = new ResilientAdapter();
      failingAdapter.attachCircuitBreakerRegistry(registry);

      const rateLimitError = new ModelError('Rate limit exceeded', {
        code: ErrorCode.MODEL_RATE_LIMITED,
      });
      mockComplete.mockReturnValue(Promise.resolve(err(rateLimitError)));
      vi.mocked(isRateLimitLikeError).mockReturnValue(true);
      vi.mocked(toRateLimitError).mockReturnValue({
        message: 'Rate limit exceeded',
        retryAfterMs: 30000,
      } as unknown as ReturnType<typeof toRateLimitError>);

      await failingAdapter.complete({ messages: [] });

      // The rate-limit telemetry branch fired...
      expect(recordRateLimitEvent).toHaveBeenCalledTimes(1);
      // ...but the breaker path skipped recordFailure to avoid double-count.
      expect(recordFailureSpy).not.toHaveBeenCalled();
      expect(breaker.getSnapshot().failureCount).toBe(0);
    });
  });
});
