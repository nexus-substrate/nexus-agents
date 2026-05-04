/**
 * Tests for the compare_data_feeds MCP tool.
 *
 * (Source: Issue #2297, child of #2293)
 *
 * Pure-function tests for the diff primitives (readDottedPath, parseFeedContent,
 * asEntryArray, indexByKey, membershipDiff, compareFields). End-to-end tests
 * with a tmp-dir feed fixture are deferred — the primitives compose.
 */

import { describe, it, expect } from 'vitest';
import {
  CompareDataFeedsInputSchema,
  readDottedPath,
  parseFeedContent,
  asEntryArray,
  indexByKey,
  membershipDiff,
  compareFields,
} from './compare-data-feeds.js';

// ============================================================================
// Input schema
// ============================================================================

describe('CompareDataFeedsInputSchema', () => {
  it('accepts minimal valid input', () => {
    const result = CompareDataFeedsInputSchema.safeParse({
      feedAPath: 'a.yml',
      feedBPath: 'b.yml',
      keyPath: 'id',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty paths', () => {
    expect(
      CompareDataFeedsInputSchema.safeParse({ feedAPath: '', feedBPath: 'b.yml', keyPath: 'id' })
        .success
    ).toBe(false);
  });

  it('caps compareFields at 20', () => {
    const fields = Array.from({ length: 21 }, (_, i) => `field${String(i)}`);
    const result = CompareDataFeedsInputSchema.safeParse({
      feedAPath: 'a.yml',
      feedBPath: 'b.yml',
      keyPath: 'id',
      compareFields: fields,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// readDottedPath
// ============================================================================

describe('readDottedPath', () => {
  it('reads a top-level field', () => {
    expect(readDottedPath({ id: 'foo' }, 'id')).toBe('foo');
  });

  it('reads a nested field', () => {
    expect(readDottedPath({ meta: { license: 'MIT' } }, 'meta.license')).toBe('MIT');
  });

  it('returns undefined for missing field', () => {
    expect(readDottedPath({ id: 'foo' }, 'name')).toBeUndefined();
  });

  it('returns undefined for null/undefined intermediate', () => {
    expect(readDottedPath({ a: null }, 'a.b')).toBeUndefined();
    expect(readDottedPath(undefined, 'a')).toBeUndefined();
  });
});

// ============================================================================
// parseFeedContent
// ============================================================================

describe('parseFeedContent', () => {
  it('parses JSON when extension is .json', () => {
    expect(parseFeedContent('[{"id":"a"}]', 'feed.json')).toEqual([{ id: 'a' }]);
  });

  it('parses YAML for .yml', () => {
    expect(parseFeedContent('- id: a\n- id: b\n', 'feed.yml')).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('defaults to YAML for unknown extensions', () => {
    expect(parseFeedContent('- id: a\n', 'feed.txt')).toEqual([{ id: 'a' }]);
  });
});

// ============================================================================
// asEntryArray
// ============================================================================

describe('asEntryArray', () => {
  it('returns top-level array as-is', () => {
    expect(asEntryArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('unwraps an object with exactly one array field', () => {
    expect(asEntryArray({ entries: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('throws on objects with multiple array fields', () => {
    expect(() => asEntryArray({ a: [1], b: [2] })).toThrow(/multiple array fields|ambiguous/i);
  });

  it('throws on plain values', () => {
    expect(() => asEntryArray('just a string')).toThrow();
  });
});

// ============================================================================
// indexByKey
// ============================================================================

describe('indexByKey', () => {
  it('builds a key→entry map', () => {
    const result = indexByKey(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
      ],
      'id'
    );
    expect(result.index.get('a')).toEqual({ id: 'a', v: 1 });
    expect(result.index.get('b')).toEqual({ id: 'b', v: 2 });
    expect(result.missingKeyAt).toEqual([]);
  });

  it('records missing-key indices', () => {
    const result = indexByKey([{ id: 'a' }, { name: 'b' }, { id: 'c' }], 'id');
    expect(result.missingKeyAt).toEqual([1]);
    expect(result.index.size).toBe(2);
  });

  it('coerces non-string keys to string', () => {
    const result = indexByKey([{ id: 1 }, { id: 2 }], 'id');
    expect(result.index.has('1')).toBe(true);
    expect(result.index.has('2')).toBe(true);
  });
});

// ============================================================================
// membershipDiff
// ============================================================================

describe('membershipDiff', () => {
  it('partitions keys into onlyInA / onlyInB / inBoth', () => {
    const a = new Map([
      ['x', 1],
      ['y', 2],
    ]);
    const b = new Map([
      ['y', 20],
      ['z', 30],
    ]);
    const diff = membershipDiff(a, b);
    expect(diff.onlyInA).toEqual(['x']);
    expect(diff.onlyInB).toEqual(['z']);
    expect(diff.inBoth).toEqual(['y']);
  });

  it('returns sorted output', () => {
    const a = new Map([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
    const b = new Map();
    const diff = membershipDiff(a, b);
    expect(diff.onlyInA).toEqual(['a', 'b', 'c']);
  });

  it('handles two empty maps', () => {
    const diff = membershipDiff(new Map(), new Map());
    expect(diff.onlyInA).toEqual([]);
    expect(diff.onlyInB).toEqual([]);
    expect(diff.inBoth).toEqual([]);
  });
});

// ============================================================================
// compareFields
// ============================================================================

describe('compareFields', () => {
  it('reports field differences for matched entries', () => {
    const a = new Map([['x', { id: 'x', license: 'MIT' }]]);
    const b = new Map([['x', { id: 'x', license: 'Apache-2.0' }]]);
    const diffs = compareFields(['x'], a, b, ['license']);
    expect(diffs).toEqual([{ key: 'x', field: 'license', valueA: 'MIT', valueB: 'Apache-2.0' }]);
  });

  it('returns empty for fully-matched entries', () => {
    const a = new Map([['x', { license: 'MIT', sha256: 'abc' }]]);
    const b = new Map([['x', { license: 'MIT', sha256: 'abc' }]]);
    const diffs = compareFields(['x'], a, b, ['license', 'sha256']);
    expect(diffs).toEqual([]);
  });

  it('handles deep equality for nested fields', () => {
    const a = new Map([['x', { meta: { tags: ['a', 'b'] } }]]);
    const b = new Map([['x', { meta: { tags: ['a', 'b'] } }]]);
    const diffs = compareFields(['x'], a, b, ['meta']);
    expect(diffs).toEqual([]);
  });

  it('treats undefined and null as different', () => {
    const a = new Map([['x', { id: 'x' }]]);
    const b = new Map([['x', { id: 'x', license: null }]]);
    const diffs = compareFields(['x'], a, b, ['license']);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.valueA).toBeUndefined();
    expect(diffs[0]?.valueB).toBeNull();
  });

  it('walks dotted field paths', () => {
    const a = new Map([['x', { meta: { license: 'MIT' } }]]);
    const b = new Map([['x', { meta: { license: 'Apache-2.0' } }]]);
    const diffs = compareFields(['x'], a, b, ['meta.license']);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.field).toBe('meta.license');
  });

  it('skips comparison when no fields requested', () => {
    const a = new Map([['x', { id: 'x' }]]);
    const b = new Map([['x', { id: 'y' }]]);
    expect(compareFields(['x'], a, b, [])).toEqual([]);
  });
});
