/**
 * Tests for CapacityTracker
 *
 * @see Issue #456 - Real API rate limit tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CapacityTracker,
  createCapacityTracker,
  getDefaultConfig,
  DEFAULT_TOKEN_LIMITS,
  DEFAULT_REQUEST_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  type CapacityTrackerConfig,
} from './capacity-tracker.js';

describe('CapacityTracker', () => {
  let tracker: CapacityTracker;
  const testConfig: CapacityTrackerConfig = {
    tokenLimit: 10000,
    requestLimit: 100,
    windowMs: 60000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new CapacityTracker(testConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCapacity()', () => {
    it('returns full capacity when no usage recorded', () => {
      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(10000);
      expect(capacity.remainingRequests).toBe(100);
      expect(capacity.utilizationPercent).toBe(0);
      expect(capacity.rateLimited).toBe(false);
    });

    it('tracks token usage correctly', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(8500);
      expect(capacity.remainingRequests).toBe(99);
      expect(capacity.utilizationPercent).toBe(15);
      expect(capacity.rateLimited).toBe(false);
    });

    it('calculates utilization from tokens when higher than requests', () => {
      tracker.recordUsage({ inputTokens: 8000, outputTokens: 1000, totalTokens: 9000 });

      const capacity = tracker.getCapacity();

      expect(capacity.utilizationPercent).toBe(90);
    });

    it('calculates utilization from requests when higher than tokens', () => {
      // Record many small requests
      for (let i = 0; i < 90; i++) {
        tracker.recordUsage({ inputTokens: 10, outputTokens: 10, totalTokens: 20 });
      }

      const capacity = tracker.getCapacity();

      // 90 requests out of 100 = 90% request utilization
      // 1800 tokens out of 10000 = 18% token utilization
      // Should use the higher one
      expect(capacity.utilizationPercent).toBe(90);
    });

    it('marks exhausted when tokens are depleted', () => {
      tracker.recordUsage({ inputTokens: 5000, outputTokens: 5000, totalTokens: 10000 });

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(0);
      expect(capacity.rateLimited).toBe(true);
    });

    it('marks exhausted when requests are depleted', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordUsage({ inputTokens: 10, outputTokens: 10 });
      }

      const capacity = tracker.getCapacity();

      expect(capacity.remainingRequests).toBe(0);
      expect(capacity.rateLimited).toBe(true);
    });

    it('provides valid reset time', () => {
      const now = Date.now();
      const capacity = tracker.getCapacity();

      expect(capacity.resetTime.getTime()).toBeGreaterThan(now);
      expect(capacity.resetTime.getTime()).toBeLessThanOrEqual(now + 60000);
    });
  });

  describe('recordUsage()', () => {
    it('handles undefined usage gracefully', () => {
      tracker.recordUsage(undefined);

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(10000);
      expect(capacity.remainingRequests).toBe(99); // Request still counted
    });

    it('uses totalTokens when available', () => {
      tracker.recordUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 200 });

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(9800); // Uses totalTokens, not input+output
    });

    it('calculates total from input+output when totalTokens not provided', () => {
      tracker.recordUsage({ inputTokens: 100, outputTokens: 50 });

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(9850); // 10000 - (100 + 50)
    });
  });

  describe('window expiry', () => {
    it('resets usage after window expires', () => {
      tracker.recordUsage({ inputTokens: 5000, outputTokens: 4000, totalTokens: 9000 });

      // Advance time past the window
      vi.advanceTimersByTime(60001);

      const capacity = tracker.getCapacity();

      expect(capacity.remainingTokens).toBe(10000);
      expect(capacity.remainingRequests).toBe(100);
      expect(capacity.utilizationPercent).toBe(0);
    });

    it('prunes old entries from sliding window', () => {
      // Record usage at t=0
      tracker.recordUsage({ inputTokens: 3000, outputTokens: 0, totalTokens: 3000 });

      // Advance time to t=30s
      vi.advanceTimersByTime(30000);

      // Record more usage at t=30s
      tracker.recordUsage({ inputTokens: 2000, outputTokens: 0, totalTokens: 2000 });

      // At t=30s, both entries should be counted
      let capacity = tracker.getCapacity();
      expect(capacity.remainingTokens).toBe(5000);

      // Advance to t=61s: the t=0 entry is outside the 60s sliding
      // window and should be pruned; the t=30s entry (within the
      // [1s, 61s] window) must remain. Pre-#3026 finding 4 fix, the
      // tumbling-reset branch incorrectly dropped both — see the
      // sibling test for the request-count side of the same bug.
      vi.advanceTimersByTime(31000);

      capacity = tracker.getCapacity();
      expect(capacity.remainingTokens).toBe(8000); // 10000 - 2000 from t=30s entry
    });

    // #3026 finding 4: pre-fix, `requestCount` only reset via the
    // tumbling-window branch ("windowStart < cutoff"), which dropped
    // requests that were still inside the *sliding* window. With one
    // request at t=0 and another at t=61s, the t=0 request should have
    // pruned out individually (it's outside [1, 61s]), but the
    // tumbling-reset branch also dropped the t=30s request that should
    // still count. After the fix, request counting follows the same
    // sliding-window semantics as token counting.
    it('counts requests via sliding window, not tumbling reset (#3026 finding 4)', () => {
      // Burst 5 requests at t=0
      for (let i = 0; i < 5; i++) {
        tracker.recordUsage({ inputTokens: 100, outputTokens: 100, totalTokens: 200 });
      }
      expect(tracker.getCapacity().remainingRequests).toBe(95);

      // Advance to t=30s, record 3 more requests
      vi.advanceTimersByTime(30000);
      for (let i = 0; i < 3; i++) {
        tracker.recordUsage({ inputTokens: 100, outputTokens: 100, totalTokens: 200 });
      }
      // All 8 are still inside the window
      expect(tracker.getCapacity().remainingRequests).toBe(92);

      // Advance to t=61s — the 5 requests at t=0 are now outside the
      // 60s window; the 3 requests at t=30s should still count.
      // Pre-fix, the tumbling-reset branch dropped ALL 8.
      vi.advanceTimersByTime(31000);
      expect(tracker.getCapacity().remainingRequests).toBe(97); // 100 - 3
    });
  });

  describe('reset()', () => {
    it('clears all tracked usage', () => {
      tracker.recordUsage({ inputTokens: 5000, outputTokens: 5000, totalTokens: 10000 });

      expect(tracker.getCapacity().rateLimited).toBe(true);

      tracker.reset();

      const capacity = tracker.getCapacity();
      expect(capacity.remainingTokens).toBe(10000);
      expect(capacity.remainingRequests).toBe(100);
      expect(capacity.rateLimited).toBe(false);
    });
  });

  describe('updateConfig()', () => {
    it('updates token limit', () => {
      tracker.updateConfig({ tokenLimit: 20000 });

      const config = tracker.getConfig();
      expect(config.tokenLimit).toBe(20000);
    });

    it('updates request limit', () => {
      tracker.updateConfig({ requestLimit: 200 });

      const config = tracker.getConfig();
      expect(config.requestLimit).toBe(200);
    });

    it('recalculates utilization with new limits', () => {
      tracker.recordUsage({ inputTokens: 5000, outputTokens: 0, totalTokens: 5000 });

      const initialUtilization = tracker.getCapacity().utilizationPercent;

      tracker.updateConfig({ tokenLimit: 5000 });

      // With halved limit, utilization should at least double (or hit 100%)
      const newUtilization = tracker.getCapacity().utilizationPercent;
      expect(newUtilization).toBeGreaterThanOrEqual(initialUtilization);
      expect(newUtilization).toBe(100); // 5000 used / 5000 limit = 100%
    });
  });

  describe('getTimeUntilReset()', () => {
    it('returns time remaining in window', () => {
      const timeUntilReset = tracker.getTimeUntilReset();

      expect(timeUntilReset).toBe(60000);
    });

    it('decreases as time passes', () => {
      vi.advanceTimersByTime(30000);

      const timeUntilReset = tracker.getTimeUntilReset();

      expect(timeUntilReset).toBe(30000);
    });

    it('returns 0 when window has expired', () => {
      vi.advanceTimersByTime(60001);

      // Getting capacity triggers prune which resets window
      tracker.getCapacity();
      const timeUntilReset = tracker.getTimeUntilReset();

      // After reset, should have full window again
      expect(timeUntilReset).toBe(60000);
    });
  });
});

describe('createCapacityTracker()', () => {
  it('creates tracker with default config for claude', () => {
    const tracker = createCapacityTracker('claude');
    const capacity = tracker.getCapacity();

    expect(capacity.remainingTokens).toBe(DEFAULT_TOKEN_LIMITS.claude);
    expect(capacity.remainingRequests).toBe(DEFAULT_REQUEST_LIMITS.claude);
  });

  it('creates tracker with default config for gemini', () => {
    const tracker = createCapacityTracker('gemini');
    const capacity = tracker.getCapacity();

    expect(capacity.remainingTokens).toBe(DEFAULT_TOKEN_LIMITS.gemini);
    expect(capacity.remainingRequests).toBe(DEFAULT_REQUEST_LIMITS.gemini);
  });

  it('creates tracker with default config for codex', () => {
    const tracker = createCapacityTracker('codex');
    const capacity = tracker.getCapacity();

    expect(capacity.remainingTokens).toBe(DEFAULT_TOKEN_LIMITS.codex);
    expect(capacity.remainingRequests).toBe(DEFAULT_REQUEST_LIMITS.codex);
  });
});

describe('getDefaultConfig()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default values when no env vars set', () => {
    const config = getDefaultConfig('claude');

    expect(config.tokenLimit).toBe(DEFAULT_TOKEN_LIMITS.claude);
    expect(config.requestLimit).toBe(DEFAULT_REQUEST_LIMITS.claude);
    expect(config.windowMs).toBe(RATE_LIMIT_WINDOW_MS);
  });

  it('uses environment variable for token limit', () => {
    process.env.NEXUS_CLAUDE_TOKEN_LIMIT = '200000';

    const config = getDefaultConfig('claude');

    expect(config.tokenLimit).toBe(200000);
  });

  it('uses environment variable for request limit', () => {
    process.env.NEXUS_GEMINI_REQUEST_LIMIT = '120';

    const config = getDefaultConfig('gemini');

    expect(config.requestLimit).toBe(120);
  });
});

describe('DEFAULT_TOKEN_LIMITS', () => {
  it('has values for all CLIs', () => {
    expect(DEFAULT_TOKEN_LIMITS.claude).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.gemini).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.codex).toBeGreaterThan(0);
  });
});

describe('DEFAULT_REQUEST_LIMITS', () => {
  it('has values for all CLIs', () => {
    expect(DEFAULT_REQUEST_LIMITS.claude).toBeGreaterThan(0);
    expect(DEFAULT_REQUEST_LIMITS.gemini).toBeGreaterThan(0);
    expect(DEFAULT_REQUEST_LIMITS.codex).toBeGreaterThan(0);
  });
});

describe('#4456: a local rate window is not provider-asserted quota', () => {
  const config: CapacityTrackerConfig = {
    tokenLimit: 1_000,
    requestLimit: 2,
    windowMs: RATE_LIMIT_WINDOW_MS,
  };

  let tracker: CapacityTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    tracker = new CapacityTracker(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Burn the rolling request window. */
  const burnWindow = (): void => {
    tracker.recordUsage(undefined);
    tracker.recordUsage(undefined);
  };

  it('reports rateLimited when this process fills its own rolling window', () => {
    burnWindow();

    expect(tracker.getCapacity().rateLimited).toBe(true);
  });

  it('does NOT report quotaExhausted for a purely local burst', () => {
    // The whole point of #4456. A 7-voter panel fills the window while the
    // account has plenty of quota; calling that "exhausted" is what kept
    // enforcement switched off.
    burnWindow();

    expect(tracker.getCapacity().quotaExhausted).toBe(false);
  });

  it('keeps the deprecated exhausted field equal to rateLimited', () => {
    // The single deliberate read of the deprecated name in the tree: it is the
    // alias contract, so it must be asserted somewhere or the alias could
    // silently drift from the field it claims to mirror. Everywhere else the
    // type-aware no-deprecated rule blocks new readers.
    burnWindow();
    const status = tracker.getCapacity();

    expect(status.rateLimited).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- asserts the alias itself
    expect(status.exhausted).toBe(status.rateLimited);
  });

  it('records quota exhaustion when the provider asks for longer than the window', () => {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS * 60;

    expect(tracker.recordProviderQuotaExhaustion(retryAfterMs)).toBe(true);

    const status = tracker.getCapacity();
    expect(status.quotaExhausted).toBe(true);
    expect(status.quotaResetAt?.getTime()).toBe(Date.now() + retryAfterMs);
  });

  it('treats a short retry-after as a throttle, not quota exhaustion', () => {
    // Shorter than our own window means a per-minute limit, which rateLimited
    // already covers. Escalating it would empty the candidate pool for a
    // condition that clears within the minute.
    expect(tracker.recordProviderQuotaExhaustion(RATE_LIMIT_WINDOW_MS - 1)).toBe(false);
    expect(tracker.getCapacity().quotaExhausted).toBe(false);
  });

  it('asserts nothing when the provider gave no horizon', () => {
    // An exhaustion with no stated end is indistinguishable here from a
    // transient error. Inventing a horizon would manufacture a measurement.
    expect(tracker.recordProviderQuotaExhaustion(undefined)).toBe(false);
    expect(tracker.getCapacity().quotaExhausted).toBe(false);
  });

  it('clears the assertion once the provider-stated horizon passes', () => {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS * 10;
    tracker.recordProviderQuotaExhaustion(retryAfterMs);

    vi.advanceTimersByTime(retryAfterMs + 1);

    expect(tracker.getCapacity().quotaExhausted).toBe(false);
  });

  it('holds the assertion right up to the stated horizon', () => {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS * 10;
    tracker.recordProviderQuotaExhaustion(retryAfterMs);

    vi.advanceTimersByTime(retryAfterMs - 1);

    expect(tracker.getCapacity().quotaExhausted).toBe(true);
  });

  it('does not let a provider assertion decay with the local window', () => {
    // The two clocks are independent: a week-long quota must survive the 60s
    // rolling window rolling over many times.
    tracker.recordProviderQuotaExhaustion(RATE_LIMIT_WINDOW_MS * 1000);

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS * 5);

    const status = tracker.getCapacity();
    expect(status.rateLimited).toBe(false);
    expect(status.quotaExhausted).toBe(true);
  });

  it('drops the assertion on reset', () => {
    tracker.recordProviderQuotaExhaustion(RATE_LIMIT_WINDOW_MS * 10);

    tracker.reset();

    expect(tracker.getCapacity().quotaExhausted).toBe(false);
  });
});
