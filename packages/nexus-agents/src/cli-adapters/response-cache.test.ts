/**
 * nexus-agents/cli-adapters - Response Cache Tests
 *
 * Tests for CLI response caching with LRU eviction, TTL, and memory bounds.
 *
 * @module cli-adapters/response-cache.test
 * (Source: Issue #358)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemoryResponseCache,
  createResponseCache,
  generateCacheKey,
  withCache,
  ResponseCacheError,
} from './response-cache.js';
import type { IResponseCache } from './response-cache-types.js';

describe('generateCacheKey', () => {
  it('generates deterministic keys for same input', () => {
    const options = {
      adapter: 'claude',
      prompt: 'Explain closures in JavaScript',
      options: { model: 'claude-sonnet-4', temperature: 0.7 },
    };

    const key1 = generateCacheKey(options);
    const key2 = generateCacheKey(options);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^claude:[a-f0-9]{16}$/);
  });

  it('generates different keys for different prompts', () => {
    const key1 = generateCacheKey({ adapter: 'claude', prompt: 'Hello' });
    const key2 = generateCacheKey({ adapter: 'claude', prompt: 'World' });

    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different adapters', () => {
    const key1 = generateCacheKey({ adapter: 'claude', prompt: 'Hello' });
    const key2 = generateCacheKey({ adapter: 'gemini', prompt: 'Hello' });

    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^claude:/);
    expect(key2).toMatch(/^gemini:/);
  });

  it('generates same key regardless of option key order', () => {
    const key1 = generateCacheKey({
      adapter: 'claude',
      prompt: 'Test',
      options: { a: 1, b: 2, c: 3 },
    });
    const key2 = generateCacheKey({
      adapter: 'claude',
      prompt: 'Test',
      options: { c: 3, a: 1, b: 2 },
    });

    expect(key1).toBe(key2);
  });

  it('handles nested options correctly', () => {
    const key1 = generateCacheKey({
      adapter: 'codex',
      prompt: 'Test',
      options: { nested: { x: 1, y: 2 } },
    });
    const key2 = generateCacheKey({
      adapter: 'codex',
      prompt: 'Test',
      options: { nested: { y: 2, x: 1 } },
    });

    expect(key1).toBe(key2);
  });

  it('handles omitted options', () => {
    const key1 = generateCacheKey({ adapter: 'claude', prompt: 'Test' });
    const key2 = generateCacheKey({ adapter: 'claude', prompt: 'Test' });

    expect(key1).toBe(key2);
  });

  it('handles empty options object', () => {
    const key1 = generateCacheKey({ adapter: 'claude', prompt: 'Test' });
    const key2 = generateCacheKey({ adapter: 'claude', prompt: 'Test', options: {} });

    expect(key1).toBe(key2);
  });
});

describe('InMemoryResponseCache', () => {
  let cache: InMemoryResponseCache;

  beforeEach(() => {
    cache = new InMemoryResponseCache({
      defaultTTL: 5000,
      maxEntries: 10,
      maxMemoryMB: 1,
      cleanupInterval: 60000, // Long interval for tests
      enableLogging: false,
    });
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('basic operations', () => {
    it('sets and gets values', () => {
      cache.set('key1', { data: 'value1' });
      const result = cache.get('key1') as { data: string } | undefined;

      expect(result).toEqual({ data: 'value1' });
    });

    it('returns undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('has() returns true for existing keys', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);
    });

    it('has() returns false for missing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('delete() removes entries', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');

      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('delete() returns false for missing keys', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('clear() removes all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
      expect(cache.stats().entries).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires entries after TTL', () => {
      cache.set('key1', 'value', 1000); // 1 second TTL

      expect(cache.get('key1')).toBe('value');

      vi.advanceTimersByTime(1001);

      expect(cache.get('key1')).toBeUndefined();
    });

    it('has() returns false for expired entries', () => {
      cache.set('key1', 'value', 1000);

      expect(cache.has('key1')).toBe(true);

      vi.advanceTimersByTime(1001);

      expect(cache.has('key1')).toBe(false);
    });

    it('uses default TTL when not specified', () => {
      cache.set('key1', 'value'); // Uses default 5000ms

      vi.advanceTimersByTime(4999);
      expect(cache.get('key1')).toBe('value');

      vi.advanceTimersByTime(2);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('increments TTL eviction counter', () => {
      cache.set('key1', 'value', 1000);

      vi.advanceTimersByTime(1001);
      cache.get('key1'); // Triggers TTL eviction

      const stats = cache.stats();
      expect(stats.evictionsTTL).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used when maxEntries exceeded', () => {
      // Fill cache to max (10 entries)
      for (let i = 0; i < 10; i++) {
        cache.set(`key${String(i)}`, `value${String(i)}`);
      }

      expect(cache.stats().entries).toBe(10);

      // Access some entries to make them more recent
      cache.get('key0');
      cache.get('key1');

      // Add new entry - should evict LRU (key2)
      cache.set('key10', 'value10');

      expect(cache.stats().entries).toBe(10);
      expect(cache.has('key0')).toBe(true); // Recently accessed
      expect(cache.has('key1')).toBe(true); // Recently accessed
      expect(cache.has('key10')).toBe(true); // Just added
      expect(cache.has('key2')).toBe(false); // Evicted (LRU)
    });

    it('increments LRU eviction counter', () => {
      // Fill cache beyond max
      for (let i = 0; i < 12; i++) {
        cache.set(`key${String(i)}`, `value${String(i)}`);
      }

      const stats = cache.stats();
      expect(stats.evictionsLRU).toBe(2);
    });
  });

  describe('memory bounds', () => {
    it('evicts entries when memory limit exceeded', () => {
      // Create cache with 1MB memory limit but add large values
      const smallCache = new InMemoryResponseCache({
        defaultTTL: 60000,
        maxEntries: 1000,
        maxMemoryMB: 1, // 1MB minimum
        cleanupInterval: 60000,
        enableLogging: false,
      });

      try {
        // Add entries that approach memory limit
        // Each entry is ~200KB (100K chars * 2 bytes)
        const largeValue = 'x'.repeat(100_000);
        smallCache.set('key1', largeValue);
        smallCache.set('key2', largeValue);
        smallCache.set('key3', largeValue);
        smallCache.set('key4', largeValue);
        smallCache.set('key5', largeValue);
        smallCache.set('key6', largeValue);

        // Some entries should be evicted when we exceed ~1MB
        const stats = smallCache.stats();
        // Memory should be bounded
        expect(stats.memoryUsedBytes).toBeLessThanOrEqual(1024 * 1024);
      } finally {
        smallCache.dispose();
      }
    });

    it('tracks memory usage', () => {
      cache.set('key1', { data: 'test value' });
      const stats = cache.stats();

      expect(stats.memoryUsedBytes).toBeGreaterThan(0);
    });

    it('reduces memory on delete', () => {
      cache.set('key1', { data: 'test value' });
      const beforeStats = cache.stats();

      cache.delete('key1');
      const afterStats = cache.stats();

      expect(afterStats.memoryUsedBytes).toBeLessThan(beforeStats.memoryUsedBytes);
    });
  });

  describe('hit tracking', () => {
    it('tracks hits and misses', () => {
      cache.set('key1', 'value');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('calculates hit rate correctly', () => {
      cache.set('key1', 'value');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      const stats = cache.stats();
      expect(stats.hitRate).toBe(0.75);
    });

    it('returns 0 hit rate with no accesses', () => {
      const stats = cache.stats();
      expect(stats.hitRate).toBe(0);
    });

    it('tracks entry hits', () => {
      cache.set('key1', 'value');

      // Access multiple times
      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      // Entry should track its own hits (not directly exposed, but affects LRU)
      const stats = cache.stats();
      expect(stats.hits).toBe(3);
    });
  });

  describe('stats and reset', () => {
    it('returns comprehensive stats', () => {
      cache.set('key1', 'value');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.stats();

      expect(stats.entries).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.memoryUsedBytes).toBeGreaterThan(0);
      expect(stats.evictionsLRU).toBe(0);
      expect(stats.evictionsTTL).toBe(0);
      expect(stats.evictionsMemory).toBe(0);
      expect(stats.createdAt).toBeInstanceOf(Date);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('resetStats clears counters but keeps entries', () => {
      cache.set('key1', 'value');
      cache.get('key1');
      cache.get('nonexistent');

      cache.resetStats();

      const stats = cache.stats();
      expect(stats.entries).toBe(1); // Entry preserved
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('dispose', () => {
    it('throws on operations after dispose', () => {
      cache.dispose();

      expect(() => cache.get('key1')).toThrow(ResponseCacheError);
      expect(() => {
        cache.set('key1', 'value');
      }).toThrow(ResponseCacheError);
      expect(() => cache.has('key1')).toThrow(ResponseCacheError);
      expect(() => cache.delete('key1')).toThrow(ResponseCacheError);
      expect(() => {
        cache.clear();
      }).toThrow(ResponseCacheError);
    });

    it('dispose is idempotent', () => {
      cache.dispose();
      cache.dispose(); // Should not throw
    });
  });

  describe('edge cases', () => {
    it('handles updating existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');

      expect(cache.get('key1')).toBe('value2');
      expect(cache.stats().entries).toBe(1);
    });

    it('handles various value types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('array', [1, 2, 3]);
      cache.set('object', { nested: { value: 'deep' } });
      cache.set('null', null);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('array')).toEqual([1, 2, 3]);
      expect(cache.get('object')).toEqual({ nested: { value: 'deep' } });
      expect(cache.get('null')).toBeNull();
    });

    it('handles empty string key', () => {
      cache.set('', 'value');
      expect(cache.get('')).toBe('value');
    });

    it('handles long keys', () => {
      const longKey = 'a'.repeat(1000);
      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });
  });
});

describe('withCache', () => {
  let cache: IResponseCache;

  beforeEach(() => {
    cache = createResponseCache({
      defaultTTL: 5000,
      enableLogging: false,
    });
  });

  afterEach(() => {
    cache.dispose();
  });

  it('returns cached value on hit', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    // First call - executes function
    const result1 = await withCache(cache, { key: 'test' }, fn);
    expect(result1).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);

    // Second call - returns cached
    const result2 = await withCache(cache, { key: 'test' }, fn);
    expect(result2).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1); // Not called again
  });

  it('executes function on miss', async () => {
    const fn = vi.fn().mockResolvedValue('fresh');

    const result = await withCache(cache, { key: 'new-key' }, fn);

    expect(result).toBe('fresh');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses custom TTL', async () => {
    vi.useFakeTimers();

    try {
      const fn = vi.fn().mockResolvedValue('result');

      await withCache(cache, { key: 'test', ttl: 1000 }, fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // Still cached
      vi.advanceTimersByTime(500);
      await withCache(cache, { key: 'test', ttl: 1000 }, fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // Expired
      vi.advanceTimersByTime(600);
      await withCache(cache, { key: 'test', ttl: 1000 }, fn);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cache errors by default', async () => {
    const error = new Error('Test error');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withCache(cache, { key: 'test' }, fn)).rejects.toThrow('Test error');
    expect(fn).toHaveBeenCalledTimes(1);

    // Second call should also execute (error not cached)
    await expect(withCache(cache, { key: 'test' }, fn)).rejects.toThrow('Test error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows errors when skipOnError is false', async () => {
    const error = new Error('Test error');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withCache(cache, { key: 'test', skipOnError: false }, fn)).rejects.toThrow(
      'Test error'
    );
  });
});

describe('createResponseCache', () => {
  it('creates cache with default config', () => {
    const cache = createResponseCache();

    try {
      const stats = cache.stats();
      expect(stats.entries).toBe(0);
      expect(stats.hitRate).toBe(0);
    } finally {
      cache.dispose();
    }
  });

  it('creates cache with custom config', () => {
    const cache = createResponseCache({
      defaultTTL: 10000,
      maxEntries: 500,
      maxMemoryMB: 25,
    });

    try {
      cache.set('key1', 'value');
      expect(cache.get('key1')).toBe('value');
    } finally {
      cache.dispose();
    }
  });

  it('validates config with Zod', () => {
    // Should throw on invalid config
    expect(() =>
      createResponseCache({
        defaultTTL: 100, // Below minimum 1000
      })
    ).toThrow();
  });
});
