/**
 * E2E Smoke Tests
 *
 * Basic tests to verify E2E infrastructure is working.
 *
 * @module testing/e2e/smoke
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertOk,
  assertErr,
  measureLatency,
  withTimeout,
  withCleanup,
  sleep,
  generateTestId,
} from './utils/index.js';
import { MockCliAdapter, createMockAdapters, MockCircuitBreaker } from './mocks/index.js';
import { ok, err } from '../../core/index.js';

describe('E2E Infrastructure Smoke Tests', () => {
  describe('Test Utilities', () => {
    it('should assert Ok results correctly', () => {
      const result = ok('success');
      const value = assertOk(result);
      expect(value).toBe('success');
    });

    it('should throw on assertOk with Err', () => {
      const result = err(new Error('failure'));
      expect(() => assertOk(result)).toThrow('Expected Ok but got Err');
    });

    it('should assert Err results correctly', () => {
      const result = err(new Error('failure'));
      const error = assertErr(result);
      expect(error.message).toBe('failure');
    });

    it('should throw on assertErr with Ok', () => {
      const result = ok('success');
      expect(() => assertErr(result)).toThrow('Expected Err but got Ok');
    });

    it('should measure latency correctly', async () => {
      const { result, ms } = await measureLatency(async () => {
        await sleep(50);
        return 'done';
      });
      expect(result).toBe('done');
      expect(ms).toBeGreaterThanOrEqual(45);
      expect(ms).toBeLessThan(200);
    });

    it('should timeout long operations', async () => {
      const promise = sleep(1000);
      await expect(withTimeout(promise, 50)).rejects.toThrow('Timeout after 50ms');
    });

    it('should cleanup after operation', async () => {
      let cleaned = false;
      const result = await withCleanup(
        () => Promise.resolve('result'),
        () => {
          cleaned = true;
          return Promise.resolve();
        }
      );
      expect(result).toBe('result');
      expect(cleaned).toBe(true);
    });

    it('should cleanup even on error', async () => {
      let cleaned = false;
      try {
        await withCleanup(
          () => {
            throw new Error('test error');
          },
          () => {
            cleaned = true;
            return Promise.resolve();
          }
        );
      } catch {
        // Expected
      }
      expect(cleaned).toBe(true);
    });

    it('should generate unique test IDs', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
    });
  });

  describe('Mock CLI Adapter', () => {
    let adapter: MockCliAdapter;

    beforeEach(() => {
      adapter = new MockCliAdapter({
        name: 'claude',
        available: true,
        version: '4.5.0',
        responseDelay: 10,
      });
    });

    afterEach(() => {
      adapter.reset();
    });

    it('should report availability', async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
      expect(adapter.available).toBe(true);
    });

    it('should handle unavailable state', async () => {
      adapter.setAvailable(false);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should execute tasks', async () => {
      const task = {
        id: generateTestId('task'),
        description: 'Test task',
        priority: 1 as const,
        context: {},
      };

      const result = await adapter.execute(task);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('claude');
        expect(result.value.tokensUsed).toBeGreaterThan(0);
      }
    });

    it('should track call count', async () => {
      expect(adapter.getCallCount()).toBe(0);

      const task = {
        id: generateTestId('task'),
        description: 'Test task',
        priority: 1 as const,
        context: {},
      };

      await adapter.execute(task);
      await adapter.execute(task);
      expect(adapter.getCallCount()).toBe(2);
    });

    it('should fail with configured failure rate', async () => {
      adapter.setFailureRate(1.0); // 100% failure

      const task = {
        id: generateTestId('task'),
        description: 'Test task',
        priority: 1 as const,
        context: {},
      };

      const result = await adapter.execute(task);
      expect(result.ok).toBe(false);
    });

    it('should use custom responses', async () => {
      adapter.addResponse('custom', 'Custom response content');

      const task = {
        id: generateTestId('task'),
        description: 'custom task',
        priority: 1 as const,
        context: {},
      };

      const result = await adapter.execute(task);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Custom response content');
      }
    });
  });

  describe('Mock CLI Adapter Set', () => {
    it('should create all three adapters', () => {
      const adapters = createMockAdapters();
      expect(adapters.size).toBe(3);
      expect(adapters.has('claude')).toBe(true);
      expect(adapters.has('gemini')).toBe(true);
      expect(adapters.has('codex')).toBe(true);
    });
  });

  describe('Mock Circuit Breaker', () => {
    let breaker: MockCircuitBreaker;

    beforeEach(() => {
      breaker = new MockCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeout: 100,
      });
    });

    afterEach(() => {
      breaker.reset();
    });

    it('should start in closed state', () => {
      expect(breaker.state).toBe('closed');
      expect(breaker.isClosed()).toBe(true);
    });

    it('should open after failure threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.state).toBe('closed');

      breaker.recordFailure();
      expect(breaker.state).toBe('open');
      expect(breaker.isOpen()).toBe(true);
    });

    it('should transition to half-open after timeout', async () => {
      // Open the circuit
      breaker.setState('open');
      // Record a failure in the past
      breaker.recordFailure();

      // Wait for reset timeout
      await sleep(150);

      // Try to reset
      const reset = breaker.tryReset();
      expect(reset).toBe(true);
      expect(breaker.state).toBe('half_open');
    });

    it('should close after success threshold in half-open', () => {
      breaker.setState('half_open');

      breaker.recordSuccess();
      expect(breaker.state).toBe('half_open');

      breaker.recordSuccess();
      expect(breaker.state).toBe('closed');
    });

    it('should re-open on failure in half-open', () => {
      breaker.setState('half_open');
      breaker.recordFailure();
      expect(breaker.state).toBe('open');
    });

    it('should execute operations when closed', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should reject operations when open', async () => {
      breaker.setState('open');
      // Record a recent failure so tryReset() doesn't immediately transition to half_open
      breaker.recordFailure();
      await expect(breaker.execute(() => Promise.resolve('success'))).rejects.toThrow(
        'Circuit breaker is open'
      );
    });

    it('should provide stats', () => {
      breaker.recordSuccess();
      breaker.recordFailure();

      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.successes).toBe(1);
      expect(stats.failures).toBe(1);
    });
  });
});
