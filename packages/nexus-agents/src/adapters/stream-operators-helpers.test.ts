/**
 * Tests for Stream Operators Helpers
 * @module adapters/stream-operators-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  take,
  skip,
  concatStreams,
  fromArray,
  tapStream,
  reduceStream,
} from './stream-operators-helpers.js';

// ============================================================================
// Helper to collect async iterable
// ============================================================================

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of stream) {
    result.push(item);
  }
  return result;
}

// ============================================================================
// take
// ============================================================================

describe('take', () => {
  it('takes first N items', async () => {
    const result = await collect(take(fromArray([1, 2, 3, 4, 5]), 3));
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns all items when count exceeds length', async () => {
    const result = await collect(take(fromArray([1, 2]), 5));
    expect(result).toEqual([1, 2]);
  });

  it('returns empty for count 0', async () => {
    const result = await collect(take(fromArray([1, 2, 3]), 0));
    expect(result).toEqual([]);
  });

  it('returns empty for negative count', async () => {
    const result = await collect(take(fromArray([1, 2, 3]), -1));
    expect(result).toEqual([]);
  });
});

// ============================================================================
// skip
// ============================================================================

describe('skip', () => {
  it('skips first N items', async () => {
    const result = await collect(skip(fromArray([1, 2, 3, 4, 5]), 2));
    expect(result).toEqual([3, 4, 5]);
  });

  it('returns empty when skipping all', async () => {
    const result = await collect(skip(fromArray([1, 2]), 5));
    expect(result).toEqual([]);
  });

  it('returns all items when skip 0', async () => {
    const result = await collect(skip(fromArray([1, 2, 3]), 0));
    expect(result).toEqual([1, 2, 3]);
  });
});

// ============================================================================
// concatStreams
// ============================================================================

describe('concatStreams', () => {
  it('concatenates multiple streams', async () => {
    const result = await collect(concatStreams([fromArray([1, 2]), fromArray([3, 4])]));
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('handles empty streams', async () => {
    const result = await collect(concatStreams([fromArray([]), fromArray([1])]));
    expect(result).toEqual([1]);
  });

  it('handles no streams', async () => {
    const result = await collect(concatStreams([]));
    expect(result).toEqual([]);
  });
});

// ============================================================================
// fromArray
// ============================================================================

describe('fromArray', () => {
  it('streams all values', async () => {
    const result = await collect(fromArray([10, 20, 30]));
    expect(result).toEqual([10, 20, 30]);
  });

  it('handles empty array', async () => {
    const result = await collect(fromArray([]));
    expect(result).toEqual([]);
  });
});

// ============================================================================
// tapStream
// ============================================================================

describe('tapStream', () => {
  it('calls fn for each chunk without modifying', async () => {
    const tapped: number[] = [];
    const result = await collect(
      tapStream(fromArray([1, 2, 3]), (chunk) => {
        tapped.push(chunk);
      })
    );
    expect(result).toEqual([1, 2, 3]);
    expect(tapped).toEqual([1, 2, 3]);
  });

  it('provides correct index', async () => {
    const indices: number[] = [];
    await collect(
      tapStream(fromArray(['a', 'b', 'c']), (_chunk, index) => {
        indices.push(index);
      })
    );
    expect(indices).toEqual([0, 1, 2]);
  });
});

// ============================================================================
// reduceStream
// ============================================================================

describe('reduceStream', () => {
  it('reduces to sum', async () => {
    const result = await reduceStream(fromArray([1, 2, 3, 4]), (acc, val) => acc + val, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  it('handles empty stream', async () => {
    const result = await reduceStream(fromArray<number>([]), (acc, val) => acc + val, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('returns error on stream failure', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* failingStream(): AsyncIterable<number> {
      yield 1;
      throw new Error('stream failed');
    }
    const result = await reduceStream(failingStream(), (acc, val) => acc + val, 0);
    expect(result.ok).toBe(false);
  });
});
