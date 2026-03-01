/**
 * Tests for ContextFreshness — TTL-based staleness detection for context entries.
 *
 * Simple timestamp check: entries older than TTL are stale.
 *
 * @module orchestration/aorchestra/context-freshness.test
 * (Source: Issue #1305, Epic #1299, arXiv:2602.20478)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isContextFresh,
  markContextVerified,
  getContextAge,
  DEFAULT_TTL_MS,
  type ContextEntry,
} from './context-freshness.js';

// ============================================================================
// isContextFresh
// ============================================================================

describe('isContextFresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for recently verified context', () => {
    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: Date.now(),
    };
    expect(isContextFresh(entry)).toBe(true);
  });

  it('returns false for stale context', () => {
    vi.useFakeTimers();
    const oldTime = Date.now() - DEFAULT_TTL_MS - 1000;
    vi.useRealTimers();

    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: oldTime,
    };
    expect(isContextFresh(entry)).toBe(false);
  });

  it('respects custom TTL', () => {
    const shortTtl = 1000; // 1 second
    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: Date.now() - 2000, // 2 seconds ago
    };
    expect(isContextFresh(entry, shortTtl)).toBe(false);
  });

  it('treats entry exactly at TTL boundary as stale', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: now - DEFAULT_TTL_MS,
    };
    // Exactly at boundary = stale
    expect(isContextFresh(entry)).toBe(false);
    vi.useRealTimers();
  });

  it('returns true for entry just before TTL boundary', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: now - DEFAULT_TTL_MS + 1,
    };
    expect(isContextFresh(entry)).toBe(true);
    vi.useRealTimers();
  });
});

// ============================================================================
// markContextVerified
// ============================================================================

describe('markContextVerified', () => {
  it('returns new entry with updated timestamp', () => {
    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: 0,
    };
    const updated = markContextVerified(entry);
    expect(updated.key).toBe('src/auth.ts');
    expect(updated.lastVerifiedMs).toBeGreaterThan(0);
    expect(updated.lastVerifiedMs).toBeLessThanOrEqual(Date.now());
  });

  it('preserves the key', () => {
    const entry: ContextEntry = {
      key: 'custom-key',
      lastVerifiedMs: 0,
    };
    expect(markContextVerified(entry).key).toBe('custom-key');
  });
});

// ============================================================================
// getContextAge
// ============================================================================

describe('getContextAge', () => {
  it('returns age in milliseconds', () => {
    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: Date.now() - 5000,
    };
    const age = getContextAge(entry);
    expect(age).toBeGreaterThanOrEqual(4900); // Allow small timing variance
    expect(age).toBeLessThan(6000);
  });

  it('returns 0 for just-created entries', () => {
    const entry: ContextEntry = {
      key: 'src/auth.ts',
      lastVerifiedMs: Date.now(),
    };
    expect(getContextAge(entry)).toBeGreaterThanOrEqual(0);
    expect(getContextAge(entry)).toBeLessThan(100);
  });
});

// ============================================================================
// DEFAULT_TTL_MS
// ============================================================================

describe('DEFAULT_TTL_MS', () => {
  it('is 5 minutes', () => {
    expect(DEFAULT_TTL_MS).toBe(5 * 60 * 1000);
  });
});
