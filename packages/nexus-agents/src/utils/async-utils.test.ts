/**
 * Tests for async-utils utilities
 *
 * @module utils/async-utils.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sleep, delay, withTimeout, sequence, type TimeoutResult } from './async-utils.js';

describe('async-utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('resolves after specified delay', async () => {
      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    });

    it('does not resolve before delay', async () => {
      let resolved = false;
      void sleep(1000).then(() => {
        resolved = true;
      });

      vi.advanceTimersByTime(999);
      await Promise.resolve(); // Flush microtasks
      expect(resolved).toBe(false);

      vi.advanceTimersByTime(1);
      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('handles zero delay', async () => {
      const promise = sleep(0);
      vi.advanceTimersByTime(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('delay', () => {
    it('is alias for sleep', () => {
      expect(delay).toBe(sleep);
    });

    it('resolves after specified delay', async () => {
      const promise = delay(500);
      vi.advanceTimersByTime(500);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('withTimeout', () => {
    it('returns value if promise resolves within timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000, 'Timed out');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('returns error if promise takes longer than timeout', async () => {
      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('success');
        }, 2000);
      });

      const resultPromise = withTimeout(slowPromise, 1000, 'Timed out after 1s');

      vi.advanceTimersByTime(1000);
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Timed out after 1s');
      }
    });

    it('returns error if promise rejects', async () => {
      const failingPromise = Promise.reject(new Error('Failed'));
      const result = await withTimeout(failingPromise, 1000, 'Timed out');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Failed');
      }
    });

    it('returns error if promise rejects with non-Error', async () => {
      const failingPromise = Promise.reject(new Error('string error'));
      const result = await withTimeout(failingPromise, 1000, 'Timed out');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('string error');
      }
    });

    it('clears timeout when promise resolves', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('done');

      await withTimeout(promise, 1000, 'Timed out');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('handles promise that resolves with undefined', async () => {
      const promise = Promise.resolve(undefined);
      const result = await withTimeout(promise, 1000, 'Timed out');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it('handles promise that resolves with null', async () => {
      const promise = Promise.resolve(null);
      const result = await withTimeout(promise, 1000, 'Timed out');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('sequence', () => {
    it('executes tasks in order', async () => {
      vi.useRealTimers();

      const order: number[] = [];
      const tasks = [
        async () => {
          order.push(1);
          return await Promise.resolve('a');
        },
        async () => {
          order.push(2);
          return await Promise.resolve('b');
        },
        async () => {
          order.push(3);
          return await Promise.resolve('c');
        },
      ];

      await sequence(tasks);

      expect(order).toEqual([1, 2, 3]);
    });

    it('returns results in order', async () => {
      vi.useRealTimers();

      const tasks = [
        () => Promise.resolve('first'),
        () => Promise.resolve('second'),
        () => Promise.resolve('third'),
      ];

      const results = await sequence(tasks);

      expect(results).toEqual(['first', 'second', 'third']);
    });

    it('handles empty array', async () => {
      const results = await sequence([]);
      expect(results).toEqual([]);
    });

    it('waits for each task before starting next', async () => {
      vi.useRealTimers();

      const executionTimes: number[] = [];
      const start = Date.now();

      const tasks = [
        async () => {
          executionTimes.push(Date.now() - start);
          await new Promise((r) => setTimeout(r, 10));
          return 1;
        },
        async () => {
          executionTimes.push(Date.now() - start);
          await new Promise((r) => setTimeout(r, 10));
          return 2;
        },
      ];

      await sequence(tasks);

      // Second task should start after first completes (~10ms later)
      expect(executionTimes[1]! - executionTimes[0]!).toBeGreaterThanOrEqual(5);
    });

    it('propagates errors', async () => {
      vi.useRealTimers();

      const tasks = [
        () => Promise.resolve('ok'),
        () => Promise.reject(new Error('Task failed')),
        () => Promise.resolve('never reached'),
      ];

      await expect(sequence(tasks)).rejects.toThrow('Task failed');
    });

    it('handles single task', async () => {
      const results = await sequence([() => Promise.resolve('only')]);
      expect(results).toEqual(['only']);
    });
  });

  describe('TimeoutResult type', () => {
    it('represents success result', () => {
      const success: TimeoutResult<string> = { ok: true, value: 'data' };
      expect(success.ok).toBe(true);
      if (success.ok) {
        expect(success.value).toBe('data');
      }
    });

    it('represents error result', () => {
      const errorResult: TimeoutResult<string> = { ok: false, error: 'timeout' };
      expect(errorResult.ok).toBe(false);
      if (!errorResult.ok) {
        expect(errorResult.error).toBe('timeout');
      }
    });
  });
});
