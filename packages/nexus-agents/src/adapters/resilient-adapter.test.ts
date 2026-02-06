/**
 * Tests for Resilient Adapter
 *
 * @module adapters/resilient-adapter.test
 * (Source: Issue #811 - Resilient model adapter architecture)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterSelection } from './auto-adapter.js';
import type { ModelCapability } from '../core/types/model.js';
import { ok } from '../core/result.js';
import { ModelError } from '../core/errors.js';
import type { CircuitStateChangeEvent } from '../cli-adapters/circuit-breaker-types.js';
import type { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';

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

import { createAutoAdapter } from './auto-adapter.js';
import { ResilientAdapter } from './resilient-adapter.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSelection(name = 'claude') {
  return {
    adapter: {
      providerId: 'mock-provider',
      modelId: 'mock-model',
      capabilities: ['completion' as ModelCapability],
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
});
