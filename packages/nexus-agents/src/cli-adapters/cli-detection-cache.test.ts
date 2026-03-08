/**
 * Tests for CLI Detection Cache
 *
 * Verifies caching behavior, TTL, and invalidation.
 * (Source: Issue #165)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CliDetectionCache,
  createCliDetectionCache,
  type CliHealthResult,
} from './cli-detection-cache.js';
import type { HealthStatus } from './types.js';

describe('CliDetectionCache', () => {
  let cache: CliDetectionCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new CliDetectionCache({ ttlMs: 60_000 }); // 1 minute for tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default TTL when not provided', () => {
      const defaultCache = new CliDetectionCache();
      expect(defaultCache.getStats().size).toBe(0);
    });

    it('should accept custom TTL', () => {
      const customCache = new CliDetectionCache({ ttlMs: 30_000 });
      expect(customCache.getStats().size).toBe(0);
    });

    it('should reject invalid TTL', () => {
      expect(() => new CliDetectionCache({ ttlMs: 100 })).toThrow();
      expect(() => new CliDetectionCache({ ttlMs: 4_000_000 })).toThrow();
    });
  });

  describe('get/set', () => {
    const mockResult: CliHealthResult = {
      healthy: true,
      version: '2.0.5',
      versionStatus: 'supported',
      checkedAt: new Date(),
    };

    it('should return undefined for uncached CLI', () => {
      expect(cache.get('claude')).toBeUndefined();
    });

    it('should return cached result', () => {
      cache.set('claude', mockResult);
      const result = cache.get('claude');
      expect(result).toBeDefined();
      expect(result?.healthy).toBe(true);
      expect(result?.version).toBe('2.0.5');
    });

    it('should cache multiple CLIs independently', () => {
      const geminiResult: CliHealthResult = {
        healthy: true,
        version: '1.0.0',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };

      cache.set('claude', mockResult);
      cache.set('gemini', geminiResult);

      expect(cache.get('claude')?.version).toBe('2.0.5');
      expect(cache.get('gemini')?.version).toBe('1.0.0');
    });

    it('should track cache hits', () => {
      cache.set('claude', mockResult);
      cache.get('claude');
      cache.get('claude');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('claude');
      cache.get('gemini');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });
  });

  describe('isStale', () => {
    const mockResult: CliHealthResult = {
      healthy: true,
      version: '2.0.5',
      versionStatus: 'supported',
      checkedAt: new Date(),
    };

    it('should return true for uncached CLI', () => {
      expect(cache.isStale('claude')).toBe(true);
    });

    it('should return false for fresh cache entry', () => {
      cache.set('claude', mockResult);
      expect(cache.isStale('claude')).toBe(false);
    });

    it('should return true after TTL expires', () => {
      cache.set('claude', mockResult);
      expect(cache.isStale('claude')).toBe(false);

      // Advance time past TTL
      vi.advanceTimersByTime(61_000);

      expect(cache.isStale('claude')).toBe(true);
    });

    it('should return stale result as undefined from get()', () => {
      cache.set('claude', mockResult);
      vi.advanceTimersByTime(61_000);

      expect(cache.get('claude')).toBeUndefined();
    });
  });

  describe('invalidate', () => {
    const mockResult: CliHealthResult = {
      healthy: true,
      version: '2.0.5',
      versionStatus: 'supported',
      checkedAt: new Date(),
    };

    it('should invalidate specific CLI', () => {
      cache.set('claude', mockResult);
      cache.set('gemini', mockResult);

      cache.invalidate('claude');

      expect(cache.get('claude')).toBeUndefined();
      expect(cache.get('gemini')).toBeDefined();
    });

    it('should invalidate all CLIs when no argument', () => {
      cache.set('claude', mockResult);
      cache.set('gemini', mockResult);
      cache.set('codex', mockResult);

      cache.invalidate();

      expect(cache.get('claude')).toBeUndefined();
      expect(cache.get('gemini')).toBeUndefined();
      expect(cache.get('codex')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty map when no entries', () => {
      expect(cache.getAll().size).toBe(0);
    });

    it('should return all cached entries', () => {
      const mockResult: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };

      cache.set('claude', mockResult);
      cache.set('gemini', mockResult);

      const all = cache.getAll();
      expect(all.size).toBe(2);
      expect(all.has('claude')).toBe(true);
      expect(all.has('gemini')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate hit rate correctly', () => {
      const mockResult: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };

      cache.set('claude', mockResult);
      cache.get('claude'); // hit
      cache.get('claude'); // hit
      cache.get('gemini'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('resetStats', () => {
    it('should reset hit/miss counters', () => {
      const mockResult: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };

      cache.set('claude', mockResult);
      cache.get('claude');
      cache.get('gemini');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should not clear cached data', () => {
      const mockResult: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };

      cache.set('claude', mockResult);
      cache.resetStats();

      expect(cache.get('claude')).toBeDefined();
    });
  });

  describe('adaptive TTL (#1426)', () => {
    it('should extend TTL after consecutive healthy results', () => {
      // 2 consecutive healthy results → 2x TTL (120s instead of 60s)
      const healthy: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };
      cache.set('claude', healthy);
      cache.set('claude', { ...healthy, checkedAt: new Date() });

      // At 90s (past base 60s TTL, within adaptive 120s TTL)
      vi.advanceTimersByTime(90_000);
      expect(cache.isStale('claude')).toBe(false);

      // At 121s (past adaptive TTL)
      vi.advanceTimersByTime(31_000);
      expect(cache.isStale('claude')).toBe(true);
    });

    it('should shorten TTL after consecutive unhealthy results', () => {
      // 2 consecutive unhealthy results → 0.25x TTL (15s instead of 60s)
      const unhealthy: CliHealthResult = {
        healthy: false,
        version: '',
        versionStatus: 'unsupported',
        checkedAt: new Date(),
      };
      cache.set('claude', unhealthy);
      cache.set('claude', { ...unhealthy, checkedAt: new Date() });

      // At 16s (past adaptive 15s TTL)
      vi.advanceTimersByTime(16_000);
      expect(cache.isStale('claude')).toBe(true);
    });

    it('should reset streak when health status changes', () => {
      const healthy: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };
      const unhealthy: CliHealthResult = {
        healthy: false,
        version: '',
        versionStatus: 'unsupported',
        checkedAt: new Date(),
      };
      // Build healthy streak
      cache.set('claude', healthy);
      cache.set('claude', healthy);
      // Break streak with unhealthy
      cache.set('claude', { ...unhealthy, checkedAt: new Date() });

      // Should be back to base TTL (streak count = 1, below threshold)
      expect(cache.getEffectiveTtl('claude')).toBe(60_000);
    });

    it('should use base TTL when adaptiveTtl is disabled', () => {
      const staticCache = new CliDetectionCache({ ttlMs: 60_000, adaptiveTtl: false });
      const healthy: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };
      staticCache.set('claude', healthy);
      staticCache.set('claude', healthy);

      expect(staticCache.getEffectiveTtl('claude')).toBe(60_000);
    });

    it('should use base TTL before streak threshold is reached', () => {
      const healthy: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };
      cache.set('claude', healthy); // streak = 1 (below threshold of 2)

      expect(cache.getEffectiveTtl('claude')).toBe(60_000);
    });

    it('should clear streaks on invalidate', () => {
      const healthy: CliHealthResult = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        checkedAt: new Date(),
      };
      cache.set('claude', healthy);
      cache.set('claude', healthy);
      cache.invalidate('claude');

      // After invalidation, no streak data
      expect(cache.getEffectiveTtl('claude')).toBe(60_000);
    });
  });

  describe('fromHealthStatus', () => {
    it('should convert HealthStatus to CliHealthResult', () => {
      const healthStatus: HealthStatus = {
        healthy: true,
        version: '2.0.5',
        versionStatus: 'supported',
        lastChecked: new Date('2026-01-10T12:00:00Z'),
        message: 'All good',
      };

      const result = CliDetectionCache.fromHealthStatus(healthStatus);

      expect(result.healthy).toBe(true);
      expect(result.version).toBe('2.0.5');
      expect(result.versionStatus).toBe('supported');
      expect(result.checkedAt).toEqual(new Date('2026-01-10T12:00:00Z'));
      expect(result.message).toBe('All good');
    });
  });
});

describe('createCliDetectionCache', () => {
  it('should create cache with default config', () => {
    const cache = createCliDetectionCache();
    expect(cache).toBeDefined();
  });

  it('should create cache with custom config', () => {
    const cache = createCliDetectionCache({ ttlMs: 120_000 });
    expect(cache).toBeDefined();
  });
});
