/**
 * Tests for the in-memory policy cache (#1977 condition 5).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyCache, getPolicyCache, resetPolicyCache } from './index.js';
import type { TaskAccessPolicy } from './types.js';

function makePolicy(hash: string): TaskAccessPolicy {
  return {
    allowedTools: '*',
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: hash,
    derivedAt: '2026-04-19T00:00:00.000Z',
    source: 'bypass',
    mode: 'off',
  };
}

beforeEach(() => {
  resetPolicyCache();
});

describe('PolicyCache', () => {
  it('stores and retrieves policies by hash', () => {
    const cache = new PolicyCache();
    const policy = makePolicy('abc123');
    cache.set('abc123', policy);
    expect(cache.get('abc123')).toEqual(policy);
  });

  it('returns undefined for missing hashes', () => {
    const cache = new PolicyCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('tracks size correctly', () => {
    const cache = new PolicyCache();
    expect(cache.size).toBe(0);
    cache.set('a', makePolicy('a'));
    cache.set('b', makePolicy('b'));
    expect(cache.size).toBe(2);
  });

  it('evicts oldest entry at capacity', () => {
    const cache = new PolicyCache(2);
    cache.set('a', makePolicy('a'));
    cache.set('b', makePolicy('b'));
    cache.set('c', makePolicy('c'));
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined(); // evicted
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('refreshes LRU position on get', () => {
    const cache = new PolicyCache(2);
    cache.set('a', makePolicy('a'));
    cache.set('b', makePolicy('b'));
    cache.get('a'); // refresh a to most-recently-used
    cache.set('c', makePolicy('c')); // should evict 'b' not 'a'
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('updates existing entries without growing size', () => {
    const cache = new PolicyCache();
    const p1 = makePolicy('x');
    const p2 = { ...makePolicy('x'), derivedAt: '2026-04-20T00:00:00.000Z' };
    cache.set('x', p1);
    cache.set('x', p2);
    expect(cache.size).toBe(1);
    expect(cache.get('x')?.derivedAt).toBe('2026-04-20T00:00:00.000Z');
  });

  it('clear() removes all entries', () => {
    const cache = new PolicyCache();
    cache.set('a', makePolicy('a'));
    cache.set('b', makePolicy('b'));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('getPolicyCache (singleton)', () => {
  it('returns the same instance across calls', () => {
    const a = getPolicyCache();
    const b = getPolicyCache();
    expect(a).toBe(b);
  });

  it('resetPolicyCache() yields a fresh instance', () => {
    const a = getPolicyCache();
    a.set('k', makePolicy('k'));
    resetPolicyCache();
    const b = getPolicyCache();
    expect(a).not.toBe(b);
    expect(b.get('k')).toBeUndefined();
  });
});
