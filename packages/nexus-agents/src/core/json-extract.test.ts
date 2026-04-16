/**
 * Tests for ReDoS-safe JSON substring extractors (#1912).
 *
 * These helpers replace regex-based extraction patterns (e.g.
 * /\{[\s\S]*\}/, /\[[\s\S]*\]/) that exhibit polynomial backtracking
 * on pathological input. Index-based slicing is O(n) regardless of
 * input shape.
 */
import { describe, it, expect } from 'vitest';
import { extractJsonArray, extractJsonObject } from './json-extract.js';

describe('extractJsonArray', () => {
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
    expect(result).toBeUndefined();
    expect(Date.now() - start).toBeLessThan(100);
  });
});

describe('extractJsonObject', () => {
  it('extracts a clean JSON object', () => {
    expect(extractJsonObject('prefix {"a":1} suffix')).toBe('{"a":1}');
  });

  it('returns undefined when no `{` present', () => {
    expect(extractJsonObject('no object here')).toBeUndefined();
  });

  it('returns undefined when `{` exists but no `}`', () => {
    expect(extractJsonObject('{"a":1 with no closing')).toBeUndefined();
  });

  it('returns undefined when `}` precedes `{`', () => {
    expect(extractJsonObject('} before {')).toBeUndefined();
  });

  it('extracts greedily to the LAST `}` for nested objects', () => {
    expect(extractJsonObject('{"a":{"b":1}}')).toBe('{"a":{"b":1}}');
  });

  it('handles 100k leading `{` in linear time (no ReDoS)', () => {
    const pathological = '{'.repeat(100_000);
    const start = Date.now();
    const result = extractJsonObject(pathological);
    expect(result).toBeUndefined();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('handles 100k mixed braces in linear time', () => {
    const pathological = '{'.repeat(50_000) + '}'.repeat(50_000);
    const start = Date.now();
    extractJsonObject(pathological);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('handles pathological compound pattern that would have caused ReDoS in the old gemini parser', () => {
    // The old pattern /\{[\s\S]*"response"\s*:\s*"[\s\S]*"\s*[\s\S]*\}/
    // had 3 greedy groups. This input would have caused catastrophic
    // backtracking. Our index-based extractor is O(n).
    const pathological = '{'.repeat(5_000) + '"partial":"no match here' + '}'.repeat(5_000);
    const start = Date.now();
    const result = extractJsonObject(pathological);
    // There IS a matching `{` and `}`, so extraction succeeds
    expect(result).toBeDefined();
    expect(Date.now() - start).toBeLessThan(100);
  });
});
