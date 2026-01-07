/**
 * Rate Limiting Tests
 *
 * Tests the token bucket rate limiter under various load conditions.
 * Verifies proper throttling, error responses, and edge cases.
 *
 * (Source: Issue #108, RFC 6585)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, createDefaultRateLimiter } from '../../mcp/middleware/rate-limiter.js';

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RateLimiter - Token Bucket Behavior', () => {
    it('should allow requests up to capacity', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Should allow exactly 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }

      // 11th request should fail
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should refill tokens over time', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.tryAcquire()).toBe(false);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Should have 5 tokens now
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should not exceed capacity when refilling', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 100,
        refillIntervalMs: 1000,
      });

      // Consume half the tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      // Advance time significantly
      vi.advanceTimersByTime(10000);

      // Check state - should be capped at capacity
      const state = limiter.getState();
      expect(state.tokens).toBe(10);
      expect(state.capacity).toBe(10);
    });

    it('should acquire multiple tokens at once', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Acquire 5 tokens at once
      expect(limiter.tryAcquire(5)).toBe(true);

      // Should have 5 left
      const state = limiter.getState();
      expect(state.tokens).toBe(5);

      // Trying to acquire 6 should fail
      expect(limiter.tryAcquire(6)).toBe(false);

      // But acquiring 5 should work
      expect(limiter.tryAcquire(5)).toBe(true);
    });

    it('should report correct nextTokenMs when exhausted', () => {
      const limiter = new RateLimiter({
        capacity: 1,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Consume the token
      limiter.tryAcquire();

      // Check when next token will be available
      const state = limiter.getState();
      expect(state.tokens).toBe(0);
      expect(state.nextTokenMs).toBeGreaterThan(0);
      expect(state.nextTokenMs).toBeLessThanOrEqual(1000);
    });

    it('should reset to full capacity', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getState().tokens).toBe(0);

      // Reset
      limiter.reset();
      expect(limiter.getState().tokens).toBe(10);
    });
  });

  describe('createDefaultRateLimiter', () => {
    it('should create limiter with default config', () => {
      const limiter = createDefaultRateLimiter();
      const state = limiter.getState();

      expect(state.capacity).toBe(100);
      expect(state.tokens).toBe(100);
    });

    it('should accept custom name', () => {
      const limiter = createDefaultRateLimiter('custom-limiter');
      // No direct way to check name, but it should not throw
      expect(limiter).toBeDefined();
    });
  });

  describe('Burst Handling', () => {
    it('should handle burst followed by steady rate', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Burst: consume 50 tokens instantly
      for (let i = 0; i < 50; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }

      // Steady: consume 10 per second (matches refill rate)
      for (let second = 0; second < 5; second++) {
        vi.advanceTimersByTime(1000);
        for (let i = 0; i < 10; i++) {
          expect(limiter.tryAcquire()).toBe(true);
        }
      }
    });

    it('should reject immediate burst exceeding capacity', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Try to acquire more than capacity
      expect(limiter.tryAcquire(15)).toBe(false);
      // Tokens should still be full since acquisition failed
      expect(limiter.getState().tokens).toBe(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero refill rate', () => {
      const limiter = new RateLimiter({
        capacity: 5,
        refillRate: 0,
        refillIntervalMs: 1000,
      });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      // Advance time
      vi.advanceTimersByTime(10000);

      // Should still be empty
      expect(limiter.getState().tokens).toBe(0);
    });

    it('should handle very small refill intervals', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 1,
        refillIntervalMs: 10, // 10ms intervals
      });

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        limiter.tryAcquire();
      }

      // Advance 100ms (should refill 10 tokens)
      vi.advanceTimersByTime(100);
      expect(limiter.getState().tokens).toBe(10);
    });

    it('should handle large token counts', () => {
      const limiter = new RateLimiter({
        capacity: 1000000,
        refillRate: 100000,
        refillIntervalMs: 1000,
      });

      // Should handle large numbers
      expect(limiter.tryAcquire(500000)).toBe(true);
      expect(limiter.getState().tokens).toBe(500000);
    });

    it('should handle rapid consecutive calls', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Rapid fire calls (simulating attack)
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(limiter.tryAcquire());
      }

      // First 10 should succeed, rest should fail
      expect(results.filter((r) => r).length).toBe(10);
      expect(results.filter((r) => !r).length).toBe(10);
    });
  });

  describe('Concurrent Access Simulation', () => {
    it('should maintain consistency under simulated concurrent access', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Simulate concurrent access by interleaving requests with time advances
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < 200; i++) {
        if (i % 20 === 0) {
          vi.advanceTimersByTime(1000);
        }
        if (limiter.tryAcquire()) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // Should have processed 100 initial + 9 refills of 10 = 190 max
      // Actual will be slightly less due to timing
      expect(successCount).toBeGreaterThan(100);
      expect(successCount).toBeLessThanOrEqual(190);
      expect(failCount).toBeGreaterThan(0);
    });
  });
});
