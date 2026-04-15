/**
 * Regression tests for CodeQL alert: js/polynomial-redos in
 * parseTasksFromResponse (extractJsonArray helper).
 *
 * The original regex /\[[\s\S]*\]/ exhibited polynomial backtracking on
 * pathological input like '[[[[[…' (many leading `[` with no closing `]`).
 * The fix uses index-based slicing (indexOf + lastIndexOf), which is O(n)
 * regardless of structure.
 */
import { describe, it, expect } from 'vitest';
import { extractJsonArray } from './agent-executor.js';

describe('extractJsonArray (CodeQL js/polynomial-redos regression)', () => {
  it('extracts a clean JSON array', () => {
    expect(extractJsonArray('prefix [1,2,3] suffix')).toBe('[1,2,3]');
  });

  it('returns undefined when no `[` present', () => {
    expect(extractJsonArray('no array here')).toBeUndefined();
  });

  it('returns undefined when `[` exists but no `]`', () => {
    expect(extractJsonArray('[1,2,3 with no closing')).toBeUndefined();
  });

  it('returns undefined when `]` precedes `[`', () => {
    expect(extractJsonArray('] before [')).toBeUndefined();
  });

  it('extracts greedily to the LAST `]` for nested arrays', () => {
    expect(extractJsonArray('[[1,2],[3,4]]')).toBe('[[1,2],[3,4]]');
  });

  it('handles 100k leading `[` in linear time (no ReDoS)', () => {
    const pathological = '['.repeat(100_000);
    const start = Date.now();
    const result = extractJsonArray(pathological);
    const elapsedMs = Date.now() - start;
    // No closing `]`, so undefined; the point is bounded time
    expect(result).toBeUndefined();
    expect(elapsedMs).toBeLessThan(100);
  });

  it('handles 100k mixed brackets in linear time', () => {
    const pathological = '['.repeat(50_000) + ']'.repeat(50_000);
    const start = Date.now();
    extractJsonArray(pathological);
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(100);
  });
});
