/**
 * Tests for the shared BoundedLRUCache (#3292, epic #3288 item 4).
 */

import { describe, it, expect } from 'vitest';
import { BoundedLRUCache } from './bounded-lru-cache.js';

describe('BoundedLRUCache', () => {
  it('stores and retrieves values', () => {
    const c = new BoundedLRUCache<string, number>(3);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(1);
  });

  it('returns undefined for a missing key', () => {
    expect(new BoundedLRUCache<string, number>(3).get('nope')).toBeUndefined();
  });

  it('evicts the oldest entry when at capacity (FIFO insertion order)', () => {
    const c = new BoundedLRUCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // evicts 'a'
    expect(c.has('a')).toBe(false);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('get() bumps LRU recency so the bumped key survives eviction', () => {
    const c = new BoundedLRUCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // 'a' is now most-recently-used; 'b' is oldest
    c.set('c', 3); // evicts 'b', not 'a'
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
  });

  it('re-setting an existing key refreshes recency and updates the value', () => {
    const c = new BoundedLRUCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 10); // updates value + bumps recency; 'b' is now oldest
    c.set('c', 3); // evicts 'b'
    expect(c.get('a')).toBe(10);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
  });

  it('delete removes a key and reports whether it existed', () => {
    const c = new BoundedLRUCache<string, number>(3);
    c.set('a', 1);
    expect(c.delete('a')).toBe(true);
    expect(c.delete('a')).toBe(false);
    expect(c.has('a')).toBe(false);
  });

  it('clear empties the cache', () => {
    const c = new BoundedLRUCache<string, number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });

  it('rejects a capacity below 1', () => {
    expect(() => new BoundedLRUCache<string, number>(0)).toThrow();
  });

  it('evicts an oldest key that is itself undefined (#4319)', () => {
    // `undefined` is a legal Map key, so "oldest key" and "no key" must not be
    // conflated — otherwise eviction silently no-ops and the cache grows past
    // capacity.
    const c = new BoundedLRUCache<string | undefined, number>(1);
    c.set(undefined, 1);
    c.set('x', 2);
    expect(c.size).toBe(1);
    expect(c.has(undefined)).toBe(false);
    expect(c.get('x')).toBe(2);
  });

  it('keeps the capacity bound when undefined keys are interleaved (#4319)', () => {
    const c = new BoundedLRUCache<string | undefined, number>(2);
    c.set(undefined, 0);
    c.set('a', 1);
    c.set('b', 2); // undefined is oldest -> evicted
    expect(c.size).toBe(2);
    expect(c.has(undefined)).toBe(false);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(true);
  });

  it('stores and retrieves undefined as a key (#4319)', () => {
    const c = new BoundedLRUCache<string | undefined, number>(2);
    c.set(undefined, 42);
    expect(c.get(undefined)).toBe(42);
    expect(c.has(undefined)).toBe(true);
    expect(c.delete(undefined)).toBe(true);
    expect(c.has(undefined)).toBe(false);
  });
});
