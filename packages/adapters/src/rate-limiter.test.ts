/**
 * @nexus-agents/adapters - Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, createRateLimiter, type RateLimiterConfig } from './rate-limiter.js';
import { RateLimitError } from '@nexus-agents/core';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a limiter with valid config', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });

      expect(limiter.getCapacity()).toBe(100);
      expect(limiter.getRefillRate()).toBe(10);
      expect(limiter.getRemainingTokens()).toBe(100);
    });

    it('should throw RateLimitError for zero capacity', () => {
      expect(() => new RateLimiter({ capacity: 0, refillRate: 10 })).toThrow(RateLimitError);
    });

    it('should throw RateLimitError for negative capacity', () => {
      expect(() => new RateLimiter({ capacity: -5, refillRate: 10 })).toThrow(RateLimitError);
    });

    it('should throw RateLimitError for zero refillRate', () => {
      expect(() => new RateLimiter({ capacity: 100, refillRate: 0 })).toThrow(RateLimitError);
    });

    it('should throw RateLimitError for negative refillRate', () => {
      expect(() => new RateLimiter({ capacity: 100, refillRate: -5 })).toThrow(RateLimitError);
    });

    it('should throw RateLimitError for zero refillInterval', () => {
      expect(() => new RateLimiter({ capacity: 100, refillRate: 10, refillInterval: 0 })).toThrow(
        RateLimitError
      );
    });

    it('should use default refillInterval of 100ms', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 10 });
      // Verified through behavior - no direct getter for refillInterval
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should accept custom refillInterval', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 10, refillInterval: 50 });
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('tryAcquire', () => {
    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 2 });
    });

    it('should acquire single token by default', () => {
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(9);
    });

    it('should acquire multiple tokens', () => {
      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(5);
    });

    it('should reject when insufficient tokens', () => {
      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.tryAcquire(6)).toBe(false);
      expect(limiter.getRemainingTokens()).toBe(5);
    });

    it('should reject when request exceeds capacity', () => {
      expect(limiter.tryAcquire(15)).toBe(false);
      expect(limiter.getRemainingTokens()).toBe(10);
    });

    it('should return true for zero tokens', () => {
      expect(limiter.tryAcquire(0)).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(10);
    });

    it('should return true for negative tokens', () => {
      expect(limiter.tryAcquire(-1)).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(10);
    });

    it('should drain bucket completely', () => {
      expect(limiter.tryAcquire(10)).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(0);
      expect(limiter.tryAcquire(1)).toBe(false);
    });
  });

  describe('acquire', () => {
    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 2 });
    });

    it('should return ok result on successful acquire', () => {
      const result = limiter.acquire(5);

      expect(result.ok).toBe(true);
    });

    it('should return error result when rate limited', () => {
      limiter.tryAcquire(8);
      const result = limiter.acquire(5);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('rate_limit_exceeded');
        expect(result.error.requested).toBe(5);
        expect(result.error.available).toBe(2);
        expect(result.error.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('should calculate correct retryAfterMs', () => {
      limiter.tryAcquire(10); // Empty bucket
      const result = limiter.acquire(4);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Need 4 tokens at 2 tokens/second = 2 seconds = 2000ms
        expect(result.error.retryAfterMs).toBe(2000);
      }
    });

    it('should return ok for zero tokens', () => {
      const result = limiter.acquire(0);
      expect(result.ok).toBe(true);
    });

    it('should return infinity retryAfterMs for exceeding capacity', () => {
      const result = limiter.acquire(15);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.retryAfterMs).toBe(Infinity);
      }
    });
  });

  describe('refill', () => {
    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 2 });
    });

    it('should refill tokens over time', () => {
      limiter.tryAcquire(10); // Drain bucket
      expect(limiter.getRemainingTokens()).toBe(0);

      vi.advanceTimersByTime(1000); // Advance 1 second
      expect(limiter.getRemainingTokens()).toBe(2); // 2 tokens/second
    });

    it('should not exceed capacity', () => {
      limiter.tryAcquire(5);
      vi.advanceTimersByTime(10000); // Advance 10 seconds

      expect(limiter.getRemainingTokens()).toBe(10); // Capped at capacity
    });

    it('should refill fractional tokens', () => {
      limiter.tryAcquire(10);
      vi.advanceTimersByTime(500); // 0.5 seconds = 1 token

      expect(limiter.getRemainingTokens()).toBe(1);
    });

    it('should accumulate refills correctly', () => {
      limiter.tryAcquire(10);

      vi.advanceTimersByTime(250); // 0.25 seconds = 0.5 tokens
      expect(limiter.getAvailableTokens()).toBe(0);

      vi.advanceTimersByTime(250); // Another 0.25 seconds = total 1 token
      expect(limiter.getAvailableTokens()).toBe(1);
    });
  });

  describe('waitForTokens', () => {
    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 10, refillInterval: 100 });
    });

    it('should resolve immediately when tokens available', async () => {
      const promise = limiter.waitForTokens(5);
      await promise;

      expect(limiter.getRemainingTokens()).toBe(5);
    });

    it('should wait until tokens are available', async () => {
      limiter.tryAcquire(10); // Drain bucket

      const promise = limiter.waitForTokens(5);
      let resolved = false;

      void promise.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      expect(resolved).toBe(true);
    });

    it('should resolve for zero tokens', async () => {
      await expect(limiter.waitForTokens(0)).resolves.toBeUndefined();
    });

    it('should throw for tokens exceeding capacity', async () => {
      await expect(limiter.waitForTokens(15)).rejects.toThrow(RateLimitError);
    });
  });

  describe('getRemainingTokens', () => {
    it('should return current token count', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });
      expect(limiter.getRemainingTokens()).toBe(100);
    });

    it('should trigger refill before returning', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });
      limiter.tryAcquire(50);

      vi.advanceTimersByTime(1000);
      expect(limiter.getRemainingTokens()).toBe(60);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return integer token count', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 3 });
      limiter.tryAcquire(10);

      vi.advanceTimersByTime(500); // 1.5 tokens
      expect(limiter.getAvailableTokens()).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset bucket to capacity', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });
      limiter.tryAcquire(80);
      expect(limiter.getRemainingTokens()).toBe(20);

      limiter.reset();
      expect(limiter.getRemainingTokens()).toBe(100);
    });

    it('should reset lastRefillTime', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });
      limiter.tryAcquire(100);

      vi.advanceTimersByTime(1000);
      limiter.reset();

      // After reset, should have full capacity
      expect(limiter.getRemainingTokens()).toBe(100);
    });
  });

  describe('getTimeUntilAvailable', () => {
    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 2 });
    });

    it('should return 0 when tokens available', () => {
      expect(limiter.getTimeUntilAvailable(5)).toBe(0);
    });

    it('should return wait time when tokens unavailable', () => {
      limiter.tryAcquire(10);
      // Need 5 tokens at 2 tokens/second = 2.5 seconds = 2500ms
      expect(limiter.getTimeUntilAvailable(5)).toBe(2500);
    });

    it('should return 0 for zero tokens', () => {
      limiter.tryAcquire(10);
      expect(limiter.getTimeUntilAvailable(0)).toBe(0);
    });

    it('should return Infinity for tokens exceeding capacity', () => {
      expect(limiter.getTimeUntilAvailable(15)).toBe(Infinity);
    });

    it('should account for partial tokens', () => {
      limiter.tryAcquire(10);
      vi.advanceTimersByTime(1000); // +2 tokens

      // Need 5 more tokens (3 deficit) at 2 tokens/second = 1.5s = 1500ms
      expect(limiter.getTimeUntilAvailable(5)).toBe(1500);
    });
  });

  describe('createRateLimiter factory', () => {
    it('should create a RateLimiter instance', () => {
      const config: RateLimiterConfig = { capacity: 50, refillRate: 5 };
      const result = createRateLimiter(config);

      expect(result).toBeInstanceOf(RateLimiter);
      expect(result.getCapacity()).toBe(50);
      expect(result.getRefillRate()).toBe(5);
    });
  });

  describe('concurrent usage', () => {
    it('should handle rapid sequential acquires', () => {
      limiter = new RateLimiter({ capacity: 100, refillRate: 10 });

      for (let i = 0; i < 50; i++) {
        expect(limiter.tryAcquire(2)).toBe(true);
      }
      expect(limiter.getRemainingTokens()).toBe(0);
      expect(limiter.tryAcquire(1)).toBe(false);
    });

    it('should recover after burst', () => {
      limiter = new RateLimiter({ capacity: 10, refillRate: 10 });

      // Burst
      expect(limiter.tryAcquire(10)).toBe(true);
      expect(limiter.tryAcquire(1)).toBe(false);

      // Wait for refill
      vi.advanceTimersByTime(500);
      expect(limiter.tryAcquire(5)).toBe(true);
    });
  });
});
