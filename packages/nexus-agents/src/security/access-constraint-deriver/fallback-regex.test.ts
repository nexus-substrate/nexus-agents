/**
 * Tests for the regex/keyword fallback deriver (#1977 condition 1 partial).
 */

import { describe, it, expect } from 'vitest';
import { deriveFallbackPolicy, FALLBACK_KEYWORDS } from './index.js';

describe('deriveFallbackPolicy', () => {
  it('returns refuse (empty ops) for destructive verbs', () => {
    const p = deriveFallbackPolicy('please deploy this to prod', 'audit', 'abc');
    expect(p.allowedOperations).toEqual([]);
    expect(p.source).toBe('fallback-keyword');
    expect(p.allowedTools).toEqual([]);
  });

  it('returns read+write for modify-style tasks', () => {
    const p = deriveFallbackPolicy('fix the login bug in src/auth.ts', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read', 'write']);
  });

  it('returns read-only for view-style tasks', () => {
    const p = deriveFallbackPolicy('show me the latest router config', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read']);
  });

  it('defaults to read-only for ambiguous tasks', () => {
    const p = deriveFallbackPolicy('hmm', 'audit', 'abc');
    expect(p.allowedOperations).toEqual(['read']);
  });

  it('propagates the mode field', () => {
    const p = deriveFallbackPolicy('fix bug', 'enforce', 'abc');
    expect(p.mode).toBe('enforce');
  });

  it('propagates the objectiveHash', () => {
    const p = deriveFallbackPolicy('anything', 'off', 'myhash');
    expect(p.objectiveHash).toBe('myhash');
  });

  it('is case-insensitive', () => {
    const p = deriveFallbackPolicy('DEPLOY NOW', 'audit', 'abc');
    expect(p.allowedOperations).toEqual([]);
  });
});

describe('FALLBACK_KEYWORDS', () => {
  it('exports the three keyword groups', () => {
    expect(FALLBACK_KEYWORDS.readOnly.length).toBeGreaterThan(5);
    expect(FALLBACK_KEYWORDS.readWrite.length).toBeGreaterThan(3);
    expect(FALLBACK_KEYWORDS.refuse.length).toBeGreaterThan(3);
  });
});
