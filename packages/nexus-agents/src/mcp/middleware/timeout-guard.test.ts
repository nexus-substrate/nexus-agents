/**
 * Tests for TimeoutGuard - CVE-2026-0621 mitigation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeoutGuard, createDefaultTimeoutGuard, UriValidation } from './timeout-guard.js';

describe('TimeoutGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should complete successful operations', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 1000 });

      const operationPromise = guard.execute((): Promise<string> => Promise.resolve('success'), {
        operationName: 'test-op',
      });

      await vi.runAllTimersAsync();
      const result = await operationPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe('success');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should timeout slow operations', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 100 });

      const slowOperation = (): Promise<string> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve('completed');
          }, 200);
        });
      };

      const resultPromise = guard.execute(slowOperation, {
        operationName: 'slow-op',
        timeoutMs: 50,
      });

      // Advance time past the timeout
      vi.advanceTimersByTime(60);

      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OPERATION_TIMEOUT');
        expect(result.error.operation).toBe('slow-op');
      }
    });

    it('should enforce max timeout', async () => {
      const guard = new TimeoutGuard({
        defaultTimeoutMs: 1000,
        maxTimeoutMs: 500,
      });

      const operationPromise = guard.execute(
        (): Promise<string> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('done');
            }, 100);
          });
        },
        { timeoutMs: 10000 } // Request 10s but max is 500ms
      );

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      const result = await operationPromise;
      expect(result.ok).toBe(true);
    });

    it('should reject invalid timeout', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 1000 });

      const result = await guard.execute((): Promise<string> => Promise.resolve('test'), {
        timeoutMs: -100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TIMEOUT');
      }
    });

    it('should call onTimeout callback', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 50 });
      const onTimeout = vi.fn();

      const resultPromise = guard.execute(
        (): Promise<string> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('done');
            }, 200);
          });
        },
        { onTimeout }
      );

      vi.advanceTimersByTime(60);
      await resultPromise;

      expect(onTimeout).toHaveBeenCalled();
    });

    it('should detect near-timeout operations', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 100, enableLogging: false });

      // This will run very fast (virtually instant with fake timers)
      const operationPromise = guard.execute((): Promise<string> => Promise.resolve('fast'));

      await vi.runAllTimersAsync();
      const result = await operationPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nearTimeout).toBe(false);
      }
    });

    it('should handle operation errors as guard errors', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 1000 });

      const resultPromise = guard.execute((): Promise<never> => {
        return Promise.reject(new Error('Operation failed'));
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GUARD_ERROR');
      }
    });

    it('should cancel on AbortSignal', async () => {
      vi.useRealTimers();
      const guard = new TimeoutGuard({ defaultTimeoutMs: 10_000 });
      const controller = new AbortController();

      const resultPromise = guard.execute(
        () => new Promise<string>(() => {}), // never resolves
        { operationName: 'abort-test', signal: controller.signal }
      );

      // Abort after a short delay
      setTimeout(() => {
        controller.abort();
      }, 50);
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OPERATION_CANCELLED');
      }
    });
  });

  describe('guard', () => {
    it('should create guarded function', async () => {
      const guard = new TimeoutGuard({ defaultTimeoutMs: 1000 });

      const originalFn = (x: number, y: number): Promise<number> => Promise.resolve(x + y);
      const guardedFn = guard.guard(originalFn, { operationName: 'add' });

      const resultPromise = guardedFn(2, 3);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe(5);
      }
    });
  });

  describe('createDefaultTimeoutGuard', () => {
    it('should create guard with default settings', () => {
      const guard = createDefaultTimeoutGuard();
      expect(guard).toBeInstanceOf(TimeoutGuard);
    });
  });
});

describe('UriValidation', () => {
  describe('validate', () => {
    it('should accept valid URIs', () => {
      const result = UriValidation.validate('https://example.com/path');
      expect(result.ok).toBe(true);
    });

    it('should accept simple template URIs', () => {
      const result = UriValidation.validate('/users/{id}');
      expect(result.ok).toBe(true);
    });

    it('should reject URIs exceeding max length', () => {
      const longUri = 'https://example.com/' + 'a'.repeat(10000);
      const result = UriValidation.validate(longUri);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GUARD_ERROR');
        expect(result.error.message).toContain('exceeds maximum length');
      }
    });

    it('should reject suspicious nested patterns', () => {
      // Multiple exploded arrays - potential ReDoS
      const suspiciousUri = '/path/{+list*}/sub/{+other*}';
      const result = UriValidation.validate(suspiciousUri);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('suspicious patterns');
      }
    });

    it('should reject deeply nested templates', () => {
      const deeplyNested = '/path/{{{{{nested}}}}}';
      const result = UriValidation.validate(deeplyNested);

      expect(result.ok).toBe(false);
    });
  });

  describe('sanitize', () => {
    it('should truncate long URIs', () => {
      const longUri = 'a'.repeat(10000);
      const sanitized = UriValidation.sanitize(longUri);

      expect(sanitized.length).toBe(UriValidation.MAX_URI_LENGTH);
    });

    it('should preserve valid URIs', () => {
      const validUri = 'https://example.com/users/{id}';
      const sanitized = UriValidation.sanitize(validUri);

      expect(sanitized).toBe(validUri);
    });

    it('should remove deeply nested templates', () => {
      const nested = '/path/{{{{{deep}}}}}';
      const sanitized = UriValidation.sanitize(nested);

      // Should have removed excessive nesting
      const openBraces = (sanitized.match(/\{/g) ?? []).length;
      expect(openBraces).toBeLessThanOrEqual(UriValidation.MAX_TEMPLATE_DEPTH);
    });
  });

  describe('constants', () => {
    it('should have reasonable MAX_URI_LENGTH', () => {
      expect(UriValidation.MAX_URI_LENGTH).toBeGreaterThan(0);
      expect(UriValidation.MAX_URI_LENGTH).toBeLessThanOrEqual(65536);
    });

    it('should have reasonable MAX_TEMPLATE_DEPTH', () => {
      expect(UriValidation.MAX_TEMPLATE_DEPTH).toBeGreaterThan(0);
      expect(UriValidation.MAX_TEMPLATE_DEPTH).toBeLessThanOrEqual(10);
    });
  });
});
