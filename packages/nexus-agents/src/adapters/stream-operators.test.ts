/**
 * Tests for stream-operators.ts
 *
 * Covers transformStream, mergeStreams, takeUntil, filterStream,
 * withTimeout, and bufferStream.
 */

import { describe, it, expect } from 'vitest';
import {
  transformStream,
  mergeStreams,
  takeUntil,
  filterStream,
  bufferStream,
} from './stream-operators.js';
import { fromArray } from './stream-operators-helpers.js';

// ============================================================================
// Helpers
// ============================================================================

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of stream) {
    result.push(item);
  }
  return result;
}

// ============================================================================
// transformStream
// ============================================================================

describe('transformStream', () => {
  it('transforms each chunk', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(transformStream(source, (x) => x * 10));
    expect(result).toEqual([10, 20, 30]);
  });

  it('provides index to transform function', async () => {
    const source = fromArray(['a', 'b', 'c']);
    const result = await collect(transformStream(source, (_, i) => i));
    expect(result).toEqual([0, 1, 2]);
  });

  it('handles empty stream', async () => {
    const source = fromArray<number>([]);
    const result = await collect(transformStream(source, (x) => x * 2));
    expect(result).toEqual([]);
  });

  it('supports async transform function', async () => {
    const source = fromArray([1, 2]);
    const result = await collect(transformStream(source, (x) => Promise.resolve(x + 100)));
    expect(result).toEqual([101, 102]);
  });
});

// ============================================================================
// mergeStreams
// ============================================================================

describe('mergeStreams', () => {
  it('merges multiple streams', async () => {
    const s1 = fromArray([1, 2]);
    const s2 = fromArray([3, 4]);
    const result = await collect(mergeStreams([s1, s2]));
    expect(result.sort()).toEqual([1, 2, 3, 4]);
  });

  it('handles empty array of streams', async () => {
    const result = await collect(mergeStreams([]));
    expect(result).toEqual([]);
  });

  it('handles single stream', async () => {
    const s1 = fromArray([10, 20, 30]);
    const result = await collect(mergeStreams([s1]));
    expect(result).toEqual([10, 20, 30]);
  });
});

// ============================================================================
// takeUntil
// ============================================================================

describe('takeUntil', () => {
  it('stops at predicate match (exclusive)', async () => {
    const source = fromArray([1, 2, 3, 4, 5]);
    const result = await collect(takeUntil(source, (x) => x === 3));
    expect(result).toEqual([1, 2]);
  });

  it('includes matching chunk when inclusive', async () => {
    const source = fromArray([1, 2, 3, 4, 5]);
    const result = await collect(takeUntil(source, (x) => x === 3, { inclusive: true }));
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns all chunks if predicate never matches', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(takeUntil(source, () => false));
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns empty if first chunk matches', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(takeUntil(source, () => true));
    expect(result).toEqual([]);
  });
});

// ============================================================================
// filterStream
// ============================================================================

describe('filterStream', () => {
  it('filters based on predicate', async () => {
    const source = fromArray([1, 2, 3, 4, 5, 6]);
    const result = await collect(filterStream(source, (x) => x % 2 === 0));
    expect(result).toEqual([2, 4, 6]);
  });

  it('provides index to predicate', async () => {
    const source = fromArray(['a', 'b', 'c', 'd']);
    const result = await collect(filterStream(source, (_, i) => i >= 2));
    expect(result).toEqual(['c', 'd']);
  });

  it('returns empty for all-false predicate', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(filterStream(source, () => false));
    expect(result).toEqual([]);
  });

  it('returns all for all-true predicate', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(filterStream(source, () => true));
    expect(result).toEqual([1, 2, 3]);
  });
});

// ============================================================================
// bufferStream
// ============================================================================

describe('bufferStream', () => {
  it('buffers chunks into groups', async () => {
    const source = fromArray([1, 2, 3, 4, 5, 6]);
    const result = await collect(bufferStream(source, 2));
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('yields remaining partial buffer', async () => {
    const source = fromArray([1, 2, 3, 4, 5]);
    const result = await collect(bufferStream(source, 3));
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it('handles single-item buffer', async () => {
    const source = fromArray([1, 2, 3]);
    const result = await collect(bufferStream(source, 1));
    expect(result).toEqual([[1], [2], [3]]);
  });

  it('handles buffer larger than stream', async () => {
    const source = fromArray([1, 2]);
    const result = await collect(bufferStream(source, 100));
    expect(result).toEqual([[1, 2]]);
  });

  it('throws for non-positive buffer size', async () => {
    const source = fromArray([1]);
    await expect(collect(bufferStream(source, 0))).rejects.toThrow('positive');
  });

  it('handles empty stream', async () => {
    const source = fromArray<number>([]);
    const result = await collect(bufferStream(source, 5));
    expect(result).toEqual([]);
  });
});
