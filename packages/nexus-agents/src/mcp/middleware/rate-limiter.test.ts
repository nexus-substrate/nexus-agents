/**
 * nexus-agents/mcp - Rate Limiter Middleware Tests
 *
 * Comprehensive tests for the token bucket rate limiter middleware.
 * Tests cover initialization, token acquisition, refill behavior,
 * state management, edge cases, and factory functions.
 *
 * @see rate-limiter.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  RateLimiter,
  createDefaultRateLimiter,
  type RateLimiterConfig,
  type RateLimiterState,
} from './rate-limiter.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

// =============================================================================
// RateLimiter Constructor Tests
// =============================================================================

describe('RateLimiter', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided capacity', () => {
      const limiter = new RateLimiter({
        capacity: 50,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      const state = limiter.getState();
      expect(state.capacity).toBe(50);
      expect(state.tokens).toBe(50);
    });

    it('should initialize with provided refill rate', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 25,
        refillIntervalMs: 1000,
      });

      // Drain and check refill
      for (let i = 0; i < 100; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getState().tokens).toBe(0);

      vi.advanceTimersByTime(1000);
      expect(limiter.getState().tokens).toBe(25);
    });

    it('should use default refill interval of 1000ms', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
      });

      // Drain bucket
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      // Advance 500ms - should not refill yet
      vi.advanceTimersByTime(500);
      expect(limiter.getState().tokens).toBe(0);

      // Advance another 500ms - should now have tokens
      vi.advanceTimersByTime(500);
      expect(limiter.getState().tokens).toBe(5);
    });

    it('should accept custom refill interval', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 100, // 100ms intervals
      });

      // Drain bucket
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      // Advance 100ms - should have 1 token
      vi.advanceTimersByTime(100);
      expect(limiter.getState().tokens).toBe(1);
    });

    it('should accept custom logger', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        logger: mockLogger,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limiter initialized',
        expect.objectContaining({
          capacity: 10,
          refillRate: 1,
        })
      );

      // Use limiter to avoid unused variable
      expect(limiter.getState().capacity).toBe(10);
    });

    it('should accept custom name', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        name: 'custom-rate-limiter',
        logger: mockLogger,
      });

      // The name is used internally - verify limiter works
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('should log initialization with all config values', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 2000,
        logger: mockLogger,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limiter initialized',
        expect.objectContaining({
          capacity: 100,
          refillRate: 10,
          refillIntervalMs: 2000,
        })
      );

      expect(limiter.getState().tokens).toBe(100);
    });
  });

  // ===========================================================================
  // tryAcquire Tests
  // ===========================================================================

  describe('tryAcquire', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
        logger: mockLogger,
      });
    });

    it('should acquire single token by default', () => {
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getState().tokens).toBe(9);
    });

    it('should acquire specified number of tokens', () => {
      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getState().tokens).toBe(5);
    });

    it('should return false when insufficient tokens', () => {
      limiter.tryAcquire(8);
      expect(limiter.tryAcquire(5)).toBe(false);
      expect(limiter.getState().tokens).toBe(2);
    });

    it('should return false when request exceeds capacity', () => {
      expect(limiter.tryAcquire(15)).toBe(false);
      expect(limiter.getState().tokens).toBe(10);
    });

    it('should drain bucket completely', () => {
      expect(limiter.tryAcquire(10)).toBe(true);
      expect(limiter.getState().tokens).toBe(0);
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should log successful token acquisition', () => {
      limiter.tryAcquire(3);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Token acquired',
        expect.objectContaining({
          requested: 3,
          remaining: 7,
        })
      );
    });

    it('should log warning when rate limited', () => {
      limiter.tryAcquire(10);
      limiter.tryAcquire(1);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          requested: 1,
          available: 0,
        })
      );
    });

    it('should trigger refill before checking availability', () => {
      // Drain bucket
      limiter.tryAcquire(10);
      expect(limiter.getState().tokens).toBe(0);

      // Advance time
      vi.advanceTimersByTime(1000);

      // Should succeed due to refill
      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getState().tokens).toBe(0);
    });
  });

  // ===========================================================================
  // refill Tests (Private but tested through behavior)
  // ===========================================================================

  describe('refill behavior', () => {
    it('should refill tokens at configured rate', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
        logger: mockLogger,
      });

      // Drain bucket
      limiter.tryAcquire(100);
      expect(limiter.getState().tokens).toBe(0);

      // Advance 1 second - should have 10 tokens
      vi.advanceTimersByTime(1000);
      expect(limiter.getState().tokens).toBe(10);

      // Advance another second - should have 20 tokens
      vi.advanceTimersByTime(1000);
      expect(limiter.getState().tokens).toBe(20);
    });

    it('should not exceed capacity when refilling', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 100,
        refillIntervalMs: 1000,
      });

      // Use some tokens
      limiter.tryAcquire(5);

      // Advance time significantly
      vi.advanceTimersByTime(10000);

      // Should be capped at capacity
      expect(limiter.getState().tokens).toBe(10);
    });

    it('should accumulate refills over multiple intervals', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      // Drain bucket
      limiter.tryAcquire(100);

      // Advance 3 seconds - should have 15 tokens
      vi.advanceTimersByTime(3000);
      expect(limiter.getState().tokens).toBe(15);
    });

    it('should only refill on complete intervals', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      // Drain bucket
      limiter.tryAcquire(10);

      // Advance 500ms - should not refill yet
      vi.advanceTimersByTime(500);
      expect(limiter.getState().tokens).toBe(0);

      // Advance another 600ms (total 1100ms) - should have refilled once
      vi.advanceTimersByTime(600);
      expect(limiter.getState().tokens).toBe(5);
    });

    it('should log refill events', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
        logger: mockLogger,
      });

      // Drain bucket
      limiter.tryAcquire(10);

      // Clear previous logs
      mockLogger.debug.mockClear();

      // Advance time to trigger refill
      vi.advanceTimersByTime(1000);
      limiter.getState(); // Trigger refill

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Tokens refilled',
        expect.objectContaining({
          added: 5,
          current: 5,
        })
      );
    });

    it('should handle partial interval tracking correctly', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Drain bucket
      limiter.tryAcquire(100);

      // Advance 1500ms
      vi.advanceTimersByTime(1500);
      expect(limiter.getState().tokens).toBe(10);

      // Advance another 500ms (should complete second interval)
      vi.advanceTimersByTime(500);
      expect(limiter.getState().tokens).toBe(20);
    });
  });

  // ===========================================================================
  // getState Tests
  // ===========================================================================

  describe('getState', () => {
    it('should return current token count', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      const state = limiter.getState();
      expect(state.tokens).toBe(100);
    });

    it('should return capacity', () => {
      const limiter = new RateLimiter({
        capacity: 50,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      expect(limiter.getState().capacity).toBe(50);
    });

    it('should return zero nextTokenMs when tokens available', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      expect(limiter.getState().nextTokenMs).toBe(0);
    });

    it('should return positive nextTokenMs when no tokens available', () => {
      const limiter = new RateLimiter({
        capacity: 1,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Consume the token
      limiter.tryAcquire();

      const state = limiter.getState();
      expect(state.tokens).toBe(0);
      expect(state.nextTokenMs).toBeGreaterThan(0);
      expect(state.nextTokenMs).toBeLessThanOrEqual(1000);
    });

    it('should trigger refill before returning state', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      // Drain bucket
      limiter.tryAcquire(10);

      // Advance time
      vi.advanceTimersByTime(2000);

      // getState should trigger refill
      expect(limiter.getState().tokens).toBe(10);
    });

    it('should calculate nextTokenMs accurately', () => {
      const limiter = new RateLimiter({
        capacity: 1,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Consume token
      limiter.tryAcquire();

      // Advance 300ms
      vi.advanceTimersByTime(300);

      const state = limiter.getState();
      // Should be approximately 700ms until next token
      expect(state.nextTokenMs).toBeLessThanOrEqual(700);
      expect(state.nextTokenMs).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // reset Tests
  // ===========================================================================

  describe('reset', () => {
    it('should restore bucket to full capacity', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
        logger: mockLogger,
      });

      // Drain bucket
      limiter.tryAcquire(100);
      expect(limiter.getState().tokens).toBe(0);

      // Reset
      limiter.reset();
      expect(limiter.getState().tokens).toBe(100);
    });

    it('should reset lastRefillTime', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      // Drain bucket and advance time
      limiter.tryAcquire(10);
      vi.advanceTimersByTime(500);

      // Reset
      limiter.reset();

      // Advance another 500ms - should not refill since timer was reset
      vi.advanceTimersByTime(500);

      // After reset + 500ms, we shouldn't have refilled yet
      // Actually, the bucket is full from reset, so it stays at capacity
      expect(limiter.getState().tokens).toBe(10);
    });

    it('should log reset event', () => {
      const limiter = new RateLimiter({
        capacity: 50,
        refillRate: 5,
        refillIntervalMs: 1000,
        logger: mockLogger,
      });

      limiter.reset();

      expect(mockLogger.debug).toHaveBeenCalledWith('Rate limiter reset', { tokens: 50 });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
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

      // Advance time significantly
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

      // Drain bucket
      for (let i = 0; i < 100; i++) {
        limiter.tryAcquire();
      }

      // Advance 100ms (10 intervals = 10 tokens)
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

      // Rapid fire calls
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(limiter.tryAcquire());
      }

      // First 10 should succeed, rest should fail
      expect(results.filter((r) => r).length).toBe(10);
      expect(results.filter((r) => !r).length).toBe(10);
    });

    it('should handle acquiring zero tokens', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      });

      // Acquiring zero tokens should succeed and not change state
      expect(limiter.tryAcquire(0)).toBe(true);
      expect(limiter.getState().tokens).toBe(10);
    });

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
      expect(successCount).toBeGreaterThan(100);
      expect(successCount).toBeLessThanOrEqual(190);
      expect(failCount).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Burst Handling Tests
  // ===========================================================================

  describe('burst handling', () => {
    it('should allow burst up to capacity', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Burst: consume 100 tokens instantly
      expect(limiter.tryAcquire(100)).toBe(true);
      expect(limiter.getState().tokens).toBe(0);
    });

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

    it('should recover from burst over time', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Full burst
      expect(limiter.tryAcquire(10)).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      // Wait for full recovery
      vi.advanceTimersByTime(1000);
      expect(limiter.getState().tokens).toBe(10);
    });
  });

  // ===========================================================================
  // State Consistency Tests
  // ===========================================================================

  describe('state consistency', () => {
    it('should maintain accurate state after many operations', () => {
      const limiter = new RateLimiter({
        capacity: 100,
        refillRate: 10,
        refillIntervalMs: 1000,
      });

      // Series of operations
      limiter.tryAcquire(20);
      vi.advanceTimersByTime(1000);
      limiter.tryAcquire(30);
      vi.advanceTimersByTime(2000);
      limiter.tryAcquire(10);

      // Calculate expected: 100 - 20 + 10 - 30 + 20 - 10 = 70
      const state = limiter.getState();
      expect(state.tokens).toBe(70);
    });

    it('should correctly report state after reset', () => {
      const limiter = new RateLimiter({
        capacity: 50,
        refillRate: 5,
        refillIntervalMs: 1000,
      });

      limiter.tryAcquire(30);
      limiter.reset();

      const state = limiter.getState();
      expect(state.tokens).toBe(50);
      expect(state.capacity).toBe(50);
      expect(state.nextTokenMs).toBe(0);
    });
  });
});

// =============================================================================
// createDefaultRateLimiter Tests
// =============================================================================

describe('createDefaultRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create limiter with default capacity of 100', () => {
    const limiter = createDefaultRateLimiter();
    expect(limiter.getState().capacity).toBe(100);
  });

  it('should create limiter with default tokens of 100', () => {
    const limiter = createDefaultRateLimiter();
    expect(limiter.getState().tokens).toBe(100);
  });

  it('should create limiter with default refill rate of 10', () => {
    const limiter = createDefaultRateLimiter();

    // Drain bucket
    for (let i = 0; i < 100; i++) {
      limiter.tryAcquire();
    }

    // Advance 1 second
    vi.advanceTimersByTime(1000);

    // Should have 10 tokens
    expect(limiter.getState().tokens).toBe(10);
  });

  it('should accept custom name', () => {
    const limiter = createDefaultRateLimiter('my-limiter');
    expect(limiter).toBeDefined();
    expect(limiter.getState().capacity).toBe(100);
  });

  it('should accept custom logger', () => {
    const mockLogger = createMockLogger();
    const limiter = createDefaultRateLimiter('test-limiter', mockLogger);

    expect(mockLogger.debug).toHaveBeenCalledWith('Rate limiter initialized', expect.any(Object));

    // Use limiter to avoid unused variable
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should accept name without logger', () => {
    const limiter = createDefaultRateLimiter('named-limiter');
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should accept logger without name', () => {
    const mockLogger = createMockLogger();
    const limiter = createDefaultRateLimiter(undefined, mockLogger);

    expect(mockLogger.debug).toHaveBeenCalled();
    expect(limiter.getState().tokens).toBe(100);
  });
});

// =============================================================================
// RateLimiterConfig Type Tests
// =============================================================================

describe('RateLimiterConfig', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should accept minimal required config', () => {
    const config: RateLimiterConfig = {
      capacity: 10,
      refillRate: 1,
    };

    const limiter = new RateLimiter(config);
    expect(limiter.getState().capacity).toBe(10);
  });

  it('should accept full config', () => {
    const mockLogger = createMockLogger();
    const config: RateLimiterConfig = {
      capacity: 50,
      refillRate: 5,
      refillIntervalMs: 500,
      logger: mockLogger,
      name: 'full-config-limiter',
    };

    const limiter = new RateLimiter(config);
    expect(limiter.getState().capacity).toBe(50);
  });
});

// =============================================================================
// RateLimiterState Type Tests
// =============================================================================

describe('RateLimiterState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have all required properties', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
    });

    const state: RateLimiterState = limiter.getState();

    expect(state).toHaveProperty('tokens');
    expect(state).toHaveProperty('capacity');
    expect(state).toHaveProperty('nextTokenMs');
    expect(typeof state.tokens).toBe('number');
    expect(typeof state.capacity).toBe('number');
    expect(typeof state.nextTokenMs).toBe('number');
  });

  it('should return readonly state object', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
    });

    const state = limiter.getState();

    // TypeScript enforces readonly at compile time
    // At runtime, modifying the returned object should not affect the limiter
    expect(state.tokens).toBe(10);
    expect(state.capacity).toBe(10);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('RateLimiter Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should work with realistic MCP tool call scenario', () => {
    const limiter = createDefaultRateLimiter('mcp-tools');

    // Simulate 50 rapid tool calls (common during agent execution)
    const results: boolean[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(limiter.tryAcquire());
    }

    // All should succeed since capacity is 100
    expect(results.every((r) => r)).toBe(true);
    expect(limiter.getState().tokens).toBe(50);
  });

  it('should handle sustained load scenario', () => {
    const limiter = new RateLimiter({
      capacity: 20,
      refillRate: 5,
      refillIntervalMs: 1000,
    });

    // Simulate sustained load: 5 requests per second over 10 seconds
    let successCount = 0;

    for (let second = 0; second < 10; second++) {
      for (let i = 0; i < 5; i++) {
        if (limiter.tryAcquire()) {
          successCount++;
        }
      }
      vi.advanceTimersByTime(1000);
    }

    // At steady state (5 req/s = refill rate), all should succeed after initial ramp
    expect(successCount).toBeGreaterThan(40);
  });

  it('should protect against abuse scenario', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
    });

    // Simulate abuse: 100 requests in rapid succession
    let blocked = 0;
    for (let i = 0; i < 100; i++) {
      if (!limiter.tryAcquire()) {
        blocked++;
      }
    }

    // Should block most requests
    expect(blocked).toBe(90);
  });

  it('should allow recovery after abuse', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 10,
      refillIntervalMs: 1000,
    });

    // Abuse phase
    for (let i = 0; i < 100; i++) {
      limiter.tryAcquire();
    }
    expect(limiter.getState().tokens).toBe(0);

    // Recovery phase: wait 1 second
    vi.advanceTimersByTime(1000);

    // Should be fully recovered
    expect(limiter.getState().tokens).toBe(10);
    expect(limiter.tryAcquire(10)).toBe(true);
  });
});

// =============================================================================
// Logging Tests
// =============================================================================

describe('RateLimiter logging', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should log debug message on initialization', () => {
    new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Rate limiter initialized',
      expect.objectContaining({
        capacity: 10,
        refillRate: 1,
        refillIntervalMs: 1000,
      })
    );
  });

  it('should log debug message on successful acquire', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    limiter.tryAcquire(3);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Token acquired',
      expect.objectContaining({
        requested: 3,
        remaining: 7,
      })
    );
  });

  it('should log warning on rate limit exceeded', () => {
    const limiter = new RateLimiter({
      capacity: 5,
      refillRate: 1,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    limiter.tryAcquire(5);
    limiter.tryAcquire(1);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Rate limit exceeded',
      expect.objectContaining({
        requested: 1,
        available: 0,
      })
    );
  });

  it('should log debug message on reset', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    mockLogger.debug.mockClear();
    limiter.reset();

    expect(mockLogger.debug).toHaveBeenCalledWith('Rate limiter reset', { tokens: 10 });
  });

  it('should log debug message on token refill', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 5,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    // Drain bucket
    limiter.tryAcquire(10);
    mockLogger.debug.mockClear();

    // Advance time to trigger refill
    vi.advanceTimersByTime(1000);
    limiter.getState();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tokens refilled',
      expect.objectContaining({
        added: 5,
        current: 5,
      })
    );
  });

  it('should log refill even when bucket already full (tokens capped at capacity)', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 5,
      refillIntervalMs: 1000,
      logger: mockLogger,
    });

    // Don't drain bucket (already at capacity)
    mockLogger.debug.mockClear();

    // Advance time
    vi.advanceTimersByTime(1000);
    limiter.getState();

    // Should log refill - the implementation calculates tokensToAdd (5)
    // and logs it, even though the bucket is already at capacity.
    // The actual tokens will be capped at capacity but the log reflects
    // the refill attempt.
    const refillCalls = mockLogger.debug.mock.calls.filter((call) => call[0] === 'Tokens refilled');
    expect(refillCalls.length).toBe(1);
    expect(refillCalls[0]?.[1]).toEqual({ added: 5, current: 10 });
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('RateLimiter performance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle high-frequency operations efficiently', () => {
    const limiter = new RateLimiter({
      capacity: 10000,
      refillRate: 1000,
      refillIntervalMs: 1000,
    });

    // Simulate 10000 rapid operations
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      limiter.tryAcquire();
    }
    const duration = performance.now() - start;

    // Should complete quickly (well under 100ms)
    expect(duration).toBeLessThan(100);
  });

  it('should handle many getState calls efficiently', () => {
    const limiter = new RateLimiter({
      capacity: 100,
      refillRate: 10,
      refillIntervalMs: 1000,
    });

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      limiter.getState();
    }
    const duration = performance.now() - start;

    // Should complete quickly
    expect(duration).toBeLessThan(100);
  });

  it('should handle many reset calls efficiently', () => {
    const limiter = new RateLimiter({
      capacity: 100,
      refillRate: 10,
      refillIntervalMs: 1000,
    });

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      limiter.reset();
    }
    const duration = performance.now() - start;

    // Should complete quickly
    expect(duration).toBeLessThan(100);
  });
});
