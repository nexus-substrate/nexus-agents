/**
 * nexus-agents/adapters - Capacity Monitor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CapacityMonitor,
  createCapacityMonitor,
  type HeadersLike,
  type LowCapacityCallback,
} from './capacity-monitor.js';
import {
  parseAnthropicHeaders,
  parseOpenAIHeaders,
  GoogleQuotaTracker,
  createGoogleQuotaTracker,
} from './capacity-monitor-helpers.js';

/**
 * Mock Headers implementation for testing.
 */
class MockHeaders implements HeadersLike {
  private readonly headers: Map<string, string>;

  constructor(init?: Record<string, string>) {
    this.headers = new Map(Object.entries(init ?? {}));
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
}

describe('CapacityMonitor', () => {
  let monitor: CapacityMonitor;

  beforeEach(() => {
    monitor = new CapacityMonitor();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const mon = new CapacityMonitor();
      expect(mon.getTrackedProviders()).toEqual([]);
    });

    it('should accept custom configuration', () => {
      const mon = new CapacityMonitor({
        lowCapacityThreshold: 90,
        defaultTotalTokens: 50000,
        defaultTotalRequests: 500,
      });
      // Configuration is internal but affects behavior
      expect(mon).toBeInstanceOf(CapacityMonitor);
    });
  });

  describe('updateFromHeaders', () => {
    describe('Anthropic headers', () => {
      it('should parse Anthropic rate limit headers', () => {
        const headers = new MockHeaders({
          'anthropic-ratelimit-tokens-remaining': '80000',
          'anthropic-ratelimit-tokens-limit': '100000',
          'anthropic-ratelimit-tokens-reset': '2026-01-05T12:01:00Z',
          'anthropic-ratelimit-requests-remaining': '900',
          'anthropic-ratelimit-requests-limit': '1000',
        });

        monitor.updateFromHeaders('anthropic', headers);

        const capacity = monitor.getCapacity('anthropic');
        expect(capacity).not.toBeNull();
        expect(capacity?.remainingTokens).toBe(80000);
        expect(capacity?.remainingRequests).toBe(900);
        expect(capacity?.utilizationPercent).toBe(20);
        expect(capacity?.resetTime?.toISOString()).toBe('2026-01-05T12:01:00.000Z');
      });

      it('should handle partial Anthropic headers', () => {
        const headers = new MockHeaders({
          'anthropic-ratelimit-tokens-remaining': '50000',
        });

        monitor.updateFromHeaders('anthropic', headers);

        const capacity = monitor.getCapacity('anthropic');
        expect(capacity?.remainingTokens).toBe(50000);
        expect(capacity?.resetTime).toBeNull();
      });
    });

    describe('OpenAI headers', () => {
      it('should parse OpenAI rate limit headers', () => {
        const headers = new MockHeaders({
          'x-ratelimit-remaining-tokens': '45000',
          'x-ratelimit-limit-tokens': '90000',
          'x-ratelimit-reset-tokens': '60s',
          'x-ratelimit-remaining-requests': '450',
          'x-ratelimit-limit-requests': '500',
        });

        monitor.updateFromHeaders('openai', headers);

        const capacity = monitor.getCapacity('openai');
        expect(capacity).not.toBeNull();
        expect(capacity?.remainingTokens).toBe(45000);
        expect(capacity?.remainingRequests).toBe(450);
        expect(capacity?.utilizationPercent).toBe(50);
        // Reset time should be 60 seconds from now
        expect(capacity?.resetTime?.getTime()).toBe(
          new Date('2026-01-05T12:00:00Z').getTime() + 60000
        );
      });

      it('should handle millisecond reset times', () => {
        const headers = new MockHeaders({
          'x-ratelimit-remaining-tokens': '1000',
          'x-ratelimit-reset-tokens': '500ms',
        });

        monitor.updateFromHeaders('openai', headers);

        const capacity = monitor.getCapacity('openai');
        expect(capacity?.resetTime?.getTime()).toBe(
          new Date('2026-01-05T12:00:00Z').getTime() + 500
        );
      });

      it('should handle minute reset times', () => {
        const headers = new MockHeaders({
          'x-ratelimit-remaining-tokens': '1000',
          'x-ratelimit-reset-tokens': '5m',
        });

        monitor.updateFromHeaders('openai', headers);

        const capacity = monitor.getCapacity('openai');
        expect(capacity?.resetTime?.getTime()).toBe(
          new Date('2026-01-05T12:00:00Z').getTime() + 5 * 60 * 1000
        );
      });
    });

    describe('Generic headers', () => {
      it('should parse generic rate limit headers for unknown providers', () => {
        const headers = new MockHeaders({
          'ratelimit-remaining': '100',
          'ratelimit-reset': '30',
        });

        monitor.updateFromHeaders('custom-provider', headers);

        const capacity = monitor.getCapacity('custom-provider');
        expect(capacity?.remainingRequests).toBe(100);
        expect(capacity?.resetTime).not.toBeNull();
      });

      it('should try x-ratelimit-remaining header pattern', () => {
        const headers = new MockHeaders({
          'x-ratelimit-remaining': '200',
        });

        monitor.updateFromHeaders('another-provider', headers);

        const capacity = monitor.getCapacity('another-provider');
        expect(capacity?.remainingRequests).toBe(200);
      });
    });

    describe('Reset time parsing', () => {
      it('should parse ISO 8601 format', () => {
        const headers = new MockHeaders({
          'anthropic-ratelimit-tokens-remaining': '1000',
          'anthropic-ratelimit-tokens-reset': '2026-01-05T13:00:00.000Z',
        });

        monitor.updateFromHeaders('anthropic', headers);

        const capacity = monitor.getCapacity('anthropic');
        expect(capacity?.resetTime?.toISOString()).toBe('2026-01-05T13:00:00.000Z');
      });

      it('should parse Unix timestamp', () => {
        const headers = new MockHeaders({
          'ratelimit-remaining': '100',
          'ratelimit-reset': '1736078400', // Unix timestamp
        });

        monitor.updateFromHeaders('custom', headers);

        const capacity = monitor.getCapacity('custom');
        expect(capacity?.resetTime).not.toBeNull();
      });

      it('should handle invalid reset time gracefully', () => {
        const headers = new MockHeaders({
          'anthropic-ratelimit-tokens-remaining': '1000',
          'anthropic-ratelimit-tokens-reset': 'invalid-date',
        });

        monitor.updateFromHeaders('anthropic', headers);

        const capacity = monitor.getCapacity('anthropic');
        expect(capacity?.resetTime).toBeNull();
      });
    });
  });

  describe('getCapacity', () => {
    it('should return null for unknown provider', () => {
      expect(monitor.getCapacity('unknown')).toBeNull();
    });

    it('should return capacity info after update', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '75000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity).toMatchObject({
        remainingTokens: 75000,
        utilizationPercent: 25,
      });
    });

    it('should include lastUpdated timestamp', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '1000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity?.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('onLowCapacity', () => {
    it('should call callback when capacity drops below threshold', () => {
      const callback = vi.fn<LowCapacityCallback>();
      monitor.onLowCapacity(callback);

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '15000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        'anthropic',
        15000,
        expect.objectContaining({
          remainingTokens: 15000,
          utilizationPercent: 85,
        })
      );
    });

    it('should not call callback when capacity is above threshold', () => {
      const callback = vi.fn<LowCapacityCallback>();
      monitor.onLowCapacity(callback);

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '80000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn<LowCapacityCallback>();
      const unsubscribe = monitor.onLowCapacity(callback);

      unsubscribe();

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '5000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', () => {
      const callback1 = vi.fn<LowCapacityCallback>();
      const callback2 = vi.fn<LowCapacityCallback>();

      monitor.onLowCapacity(callback1);
      monitor.onLowCapacity(callback2);

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '10000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle callback errors gracefully', () => {
      const throwingCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn<LowCapacityCallback>();

      monitor.onLowCapacity(throwingCallback);
      monitor.onLowCapacity(normalCallback);

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '10000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      // Should not throw
      expect(() => {
        monitor.updateFromHeaders('anthropic', headers);
      }).not.toThrow();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('setLowCapacityThreshold', () => {
    it('should update the threshold', () => {
      const callback = vi.fn<LowCapacityCallback>();
      monitor.onLowCapacity(callback);
      monitor.setLowCapacityThreshold(50);

      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '40000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      // 60% utilization exceeds 50% threshold
      expect(callback).toHaveBeenCalled();
    });

    it('should throw for invalid threshold', () => {
      expect(() => {
        monitor.setLowCapacityThreshold(-1);
      }).toThrow();
      expect(() => {
        monitor.setLowCapacityThreshold(101);
      }).toThrow();
    });

    it('should accept boundary values', () => {
      expect(() => {
        monitor.setLowCapacityThreshold(0);
      }).not.toThrow();
      expect(() => {
        monitor.setLowCapacityThreshold(100);
      }).not.toThrow();
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return null for unknown provider', () => {
      expect(monitor.getTimeUntilReset('unknown')).toBeNull();
    });

    it('should return null when reset time is not set', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '1000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(monitor.getTimeUntilReset('anthropic')).toBeNull();
    });

    it('should return milliseconds until reset', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '1000',
        'anthropic-ratelimit-tokens-reset': '2026-01-05T12:05:00Z',
      });

      monitor.updateFromHeaders('anthropic', headers);

      // 5 minutes = 300000 ms
      expect(monitor.getTimeUntilReset('anthropic')).toBe(300000);
    });

    it('should return 0 when reset time is in the past', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '1000',
        'anthropic-ratelimit-tokens-reset': '2026-01-05T11:00:00Z',
      });

      monitor.updateFromHeaders('anthropic', headers);

      expect(monitor.getTimeUntilReset('anthropic')).toBe(0);
    });
  });

  describe('updateCapacity', () => {
    it('should manually update capacity', () => {
      monitor.updateCapacity('anthropic', {
        remainingTokens: 50000,
        remainingRequests: 500,
      });

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity?.remainingTokens).toBe(50000);
      expect(capacity?.remainingRequests).toBe(500);
    });

    it('should update metadata', () => {
      monitor.updateCapacity('google', {
        remainingTokens: 10000,
        metadata: { projectId: 'my-project', region: 'us-east1' },
      });

      const capacity = monitor.getCapacity('google');
      expect(capacity?.metadata).toEqual({
        projectId: 'my-project',
        region: 'us-east1',
      });
    });

    it('should trigger low capacity callback', () => {
      const callback = vi.fn<LowCapacityCallback>();
      monitor.onLowCapacity(callback);

      monitor.updateCapacity('anthropic', {
        remainingTokens: 5000,
      });

      // With default 100000 total, 5000 remaining = 95% utilization
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('clearCapacity', () => {
    it('should remove provider capacity', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '1000',
      });

      monitor.updateFromHeaders('anthropic', headers);
      expect(monitor.getCapacity('anthropic')).not.toBeNull();

      monitor.clearCapacity('anthropic');
      expect(monitor.getCapacity('anthropic')).toBeNull();
    });

    it('should be idempotent', () => {
      monitor.clearCapacity('nonexistent');
      expect(monitor.getCapacity('nonexistent')).toBeNull();
    });
  });

  describe('getTrackedProviders', () => {
    it('should return empty array initially', () => {
      expect(monitor.getTrackedProviders()).toEqual([]);
    });

    it('should return all tracked providers', () => {
      monitor.updateFromHeaders(
        'anthropic',
        new MockHeaders({ 'anthropic-ratelimit-tokens-remaining': '1000' })
      );
      monitor.updateFromHeaders(
        'openai',
        new MockHeaders({ 'x-ratelimit-remaining-tokens': '2000' })
      );

      const providers = monitor.getTrackedProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });
  });

  describe('utilization calculation', () => {
    it('should calculate correct utilization', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '25000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity?.utilizationPercent).toBe(75);
    });

    it('should handle 0% utilization', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '100000',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity?.utilizationPercent).toBe(0);
    });

    it('should handle 100% utilization', () => {
      const headers = new MockHeaders({
        'anthropic-ratelimit-tokens-remaining': '0',
        'anthropic-ratelimit-tokens-limit': '100000',
      });

      monitor.updateFromHeaders('anthropic', headers);

      const capacity = monitor.getCapacity('anthropic');
      expect(capacity?.utilizationPercent).toBe(100);
    });

    it('should clamp utilization to 0-100', () => {
      // Edge case: remaining > total (shouldn't happen but handle gracefully)
      monitor.updateCapacity('test', {
        remainingTokens: 150000, // More than default 100000
      });

      const capacity = monitor.getCapacity('test');
      expect(capacity?.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(capacity?.utilizationPercent).toBeLessThanOrEqual(100);
    });
  });
});

describe('createCapacityMonitor', () => {
  it('should create a CapacityMonitor instance', () => {
    const monitor = createCapacityMonitor();
    expect(monitor).toBeInstanceOf(CapacityMonitor);
  });

  it('should accept configuration', () => {
    const monitor = createCapacityMonitor({ lowCapacityThreshold: 95 });
    expect(monitor).toBeInstanceOf(CapacityMonitor);
  });
});

describe('parseAnthropicHeaders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return capacity info on success', () => {
    const headers = new MockHeaders({
      'anthropic-ratelimit-tokens-remaining': '80000',
      'anthropic-ratelimit-tokens-limit': '100000',
    });

    const result = parseAnthropicHeaders(headers);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingTokens).toBe(80000);
    }
  });

  it('should return capacity even with partial headers', () => {
    const headers = new MockHeaders({
      'anthropic-ratelimit-tokens-remaining': '50000',
    });

    const result = parseAnthropicHeaders(headers);
    expect(result.ok).toBe(true);
  });
});

describe('parseOpenAIHeaders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return capacity info on success', () => {
    const headers = new MockHeaders({
      'x-ratelimit-remaining-tokens': '45000',
      'x-ratelimit-limit-tokens': '90000',
    });

    const result = parseOpenAIHeaders(headers);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingTokens).toBe(45000);
    }
  });
});

describe('GoogleQuotaTracker', () => {
  let tracker: GoogleQuotaTracker;

  beforeEach(() => {
    tracker = new GoogleQuotaTracker();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('updateQuota', () => {
    it('should update Google quota', () => {
      tracker.updateQuota({
        remainingTokens: 50000,
        remainingRequests: 500,
        projectId: 'my-project',
        region: 'us-central1',
      });

      const quota = tracker.getQuota();
      expect(quota?.remainingTokens).toBe(50000);
      expect(quota?.remainingRequests).toBe(500);
      expect(quota?.metadata).toMatchObject({
        projectId: 'my-project',
        region: 'us-central1',
      });
    });

    it('should update reset time', () => {
      const resetTime = new Date('2026-01-05T13:00:00Z');
      tracker.updateQuota({
        remainingTokens: 10000,
        resetTime,
      });

      const quota = tracker.getQuota();
      expect(quota?.resetTime?.toISOString()).toBe('2026-01-05T13:00:00.000Z');
    });
  });

  describe('getQuota', () => {
    it('should return null when no quota set', () => {
      expect(tracker.getQuota()).toBeNull();
    });

    it('should return quota after update', () => {
      tracker.updateQuota({ remainingTokens: 10000 });
      expect(tracker.getQuota()).not.toBeNull();
    });
  });

  describe('getMonitor', () => {
    it('should return underlying monitor', () => {
      const monitor = tracker.getMonitor();
      expect(monitor).toBeInstanceOf(CapacityMonitor);
    });

    it('should share monitor when provided', () => {
      const sharedMonitor = new CapacityMonitor();
      const tracker1 = new GoogleQuotaTracker(sharedMonitor);
      const tracker2 = new GoogleQuotaTracker(sharedMonitor);

      expect(tracker1.getMonitor()).toBe(tracker2.getMonitor());
    });
  });
});

describe('createGoogleQuotaTracker', () => {
  it('should create a GoogleQuotaTracker instance', () => {
    const tracker = createGoogleQuotaTracker();
    expect(tracker).toBeInstanceOf(GoogleQuotaTracker);
  });

  it('should accept shared monitor', () => {
    const monitor = new CapacityMonitor();
    const tracker = createGoogleQuotaTracker(monitor);
    expect(tracker.getMonitor()).toBe(monitor);
  });
});

describe('Edge cases', () => {
  let monitor: CapacityMonitor;

  beforeEach(() => {
    monitor = new CapacityMonitor();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle empty headers', () => {
    const headers = new MockHeaders({});
    monitor.updateFromHeaders('anthropic', headers);

    // Should create state with defaults
    const capacity = monitor.getCapacity('anthropic');
    expect(capacity).not.toBeNull();
    expect(capacity?.remainingTokens).toBe(100000); // Default
  });

  it('should handle malformed number values', () => {
    const headers = new MockHeaders({
      'anthropic-ratelimit-tokens-remaining': 'not-a-number',
    });

    monitor.updateFromHeaders('anthropic', headers);

    // Should use default
    const capacity = monitor.getCapacity('anthropic');
    expect(capacity?.remainingTokens).toBe(100000);
  });

  it('should handle comma-formatted numbers', () => {
    const headers = new MockHeaders({
      'anthropic-ratelimit-tokens-remaining': '100,000',
    });

    monitor.updateFromHeaders('anthropic', headers);

    const capacity = monitor.getCapacity('anthropic');
    expect(capacity?.remainingTokens).toBe(100000);
  });

  it('should handle multiple providers simultaneously', () => {
    monitor.updateFromHeaders(
      'anthropic',
      new MockHeaders({ 'anthropic-ratelimit-tokens-remaining': '50000' })
    );
    monitor.updateFromHeaders(
      'openai',
      new MockHeaders({ 'x-ratelimit-remaining-tokens': '30000' })
    );
    monitor.updateCapacity('google', { remainingTokens: 10000 });

    expect(monitor.getTrackedProviders()).toHaveLength(3);
    expect(monitor.getCapacity('anthropic')?.remainingTokens).toBe(50000);
    expect(monitor.getCapacity('openai')?.remainingTokens).toBe(30000);
    expect(monitor.getCapacity('google')?.remainingTokens).toBe(10000);
  });

  it('should update same provider multiple times', () => {
    monitor.updateFromHeaders(
      'anthropic',
      new MockHeaders({ 'anthropic-ratelimit-tokens-remaining': '100000' })
    );
    monitor.updateFromHeaders(
      'anthropic',
      new MockHeaders({ 'anthropic-ratelimit-tokens-remaining': '50000' })
    );

    const capacity = monitor.getCapacity('anthropic');
    expect(capacity?.remainingTokens).toBe(50000);
  });

  it('should evict oldest provider when exceeding max providers (#1205)', () => {
    const monitor = new CapacityMonitor();

    // Add 51 providers (max is 50) via updateCapacity
    for (let i = 0; i < 51; i++) {
      monitor.updateCapacity(`provider-${String(i)}`, { remainingTokens: i });
    }

    const tracked = monitor.getTrackedProviders();
    expect(tracked.length).toBeLessThanOrEqual(50);

    // Oldest provider (provider-0) should have been evicted
    expect(monitor.getCapacity('provider-0')).toBeNull();

    // Newest provider should still be present
    expect(monitor.getCapacity('provider-50')).not.toBeNull();
  });
});
