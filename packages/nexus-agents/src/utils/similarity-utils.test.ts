/**
 * Tests for similarity-utils utilities
 *
 * @module utils/similarity-utils.test
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTokenOverlap,
  calculateSetOverlapCount,
  calculateJaccardSimilarity,
  calculateTextJaccardSimilarity,
  areTextsSimilar,
  calculateMaxPairwiseSimilarity,
} from './similarity-utils.js';

describe('similarity-utils', () => {
  describe('calculateTokenOverlap', () => {
    it('returns 0 for empty query tokens', () => {
      expect(calculateTokenOverlap([], ['foo', 'bar'])).toBe(0);
    });

    it('returns 0 for empty target tokens', () => {
      expect(calculateTokenOverlap(['foo', 'bar'], [])).toBe(0);
    });

    it('returns 0 for no overlap', () => {
      expect(calculateTokenOverlap(['foo', 'bar'], ['baz', 'qux'])).toBe(0);
    });

    it('returns 1 for full coverage', () => {
      expect(calculateTokenOverlap(['foo', 'bar'], ['foo', 'bar', 'baz'])).toBe(1);
    });

    it('returns partial overlap score', () => {
      expect(calculateTokenOverlap(['foo', 'bar'], ['bar', 'baz'])).toBe(0.5);
    });

    it('returns correct score for single token match', () => {
      expect(calculateTokenOverlap(['foo', 'bar', 'baz'], ['bar'])).toBeCloseTo(0.333, 2);
    });

    it('handles duplicate query tokens', () => {
      expect(calculateTokenOverlap(['foo', 'foo'], ['foo', 'bar'])).toBe(1);
    });

    it('handles larger sets', () => {
      const query = ['a', 'b', 'c', 'd', 'e'];
      const target = ['b', 'c', 'd', 'f', 'g'];
      expect(calculateTokenOverlap(query, target)).toBe(0.6);
    });
  });

  describe('calculateSetOverlapCount', () => {
    it('returns 0 for empty sets', () => {
      expect(calculateSetOverlapCount(new Set(), new Set())).toBe(0);
    });

    it('returns 0 for no overlap', () => {
      expect(calculateSetOverlapCount(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
    });

    it('returns count of overlapping elements', () => {
      expect(calculateSetOverlapCount(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(2);
    });

    it('returns full count for identical sets', () => {
      expect(calculateSetOverlapCount(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(2);
    });

    it('handles one empty set', () => {
      expect(calculateSetOverlapCount(new Set(['a', 'b']), new Set())).toBe(0);
      expect(calculateSetOverlapCount(new Set(), new Set(['a', 'b']))).toBe(0);
    });

    it('works with numbers', () => {
      expect(calculateSetOverlapCount(new Set([1, 2, 3]), new Set([2, 3, 4]))).toBe(2);
    });
  });

  describe('calculateJaccardSimilarity', () => {
    it('returns 1 for two empty sets', () => {
      expect(calculateJaccardSimilarity(new Set(), new Set())).toBe(1);
    });

    it('returns 0 when one set is empty', () => {
      expect(calculateJaccardSimilarity(new Set(['a']), new Set())).toBe(0);
      expect(calculateJaccardSimilarity(new Set(), new Set(['a']))).toBe(0);
    });

    it('returns 1 for identical sets', () => {
      expect(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    });

    it('returns 0 for completely different sets', () => {
      expect(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
    });

    it('returns correct score for partial overlap', () => {
      // Intersection: {b}, Union: {a, b, c}
      expect(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(
        0.333,
        2
      );
    });

    it('handles larger sets', () => {
      // Intersection: {b, c, d}, Union: {a, b, c, d, e, f}
      const set1 = new Set(['a', 'b', 'c', 'd']);
      const set2 = new Set(['b', 'c', 'd', 'e', 'f']);
      expect(calculateJaccardSimilarity(set1, set2)).toBe(0.5);
    });

    it('is symmetric', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['b', 'c', 'd']);
      expect(calculateJaccardSimilarity(set1, set2)).toBe(calculateJaccardSimilarity(set2, set1));
    });
  });

  describe('calculateTextJaccardSimilarity', () => {
    it('returns 1 for identical texts', () => {
      expect(calculateTextJaccardSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('returns 0 for completely different texts', () => {
      expect(calculateTextJaccardSimilarity('hello world', 'goodbye universe')).toBe(0);
    });

    it('is case insensitive', () => {
      expect(calculateTextJaccardSimilarity('Hello World', 'HELLO WORLD')).toBe(1);
    });

    it('handles partial overlap', () => {
      // Words: {hello, world} vs {world, peace}
      // Intersection: {world}, Union: {hello, world, peace}
      expect(calculateTextJaccardSimilarity('hello world', 'world peace')).toBeCloseTo(0.333, 2);
    });

    it('handles multiple spaces', () => {
      expect(calculateTextJaccardSimilarity('hello   world', 'hello world')).toBe(1);
    });

    it('handles empty strings', () => {
      expect(calculateTextJaccardSimilarity('', '')).toBe(1);
      expect(calculateTextJaccardSimilarity('hello', '')).toBe(0);
    });

    it('handles whitespace-only strings', () => {
      expect(calculateTextJaccardSimilarity('   ', '   ')).toBe(1);
      expect(calculateTextJaccardSimilarity('hello', '   ')).toBe(0);
    });

    it('ignores word order', () => {
      expect(calculateTextJaccardSimilarity('the quick brown fox', 'fox brown quick the')).toBe(1);
    });
  });

  describe('areTextsSimilar', () => {
    it('returns true for identical texts', () => {
      expect(areTextsSimilar('hello world', 'hello world')).toBe(true);
    });

    it('returns false for completely different texts', () => {
      expect(areTextsSimilar('hello world', 'goodbye universe')).toBe(false);
    });

    it('uses default threshold of 0.8', () => {
      // {a,b,c,d,e} vs {a,b,c,d,e}: Jaccard = 5/5 = 1.0 >= 0.8
      expect(areTextsSimilar('a b c d e', 'a b c d e')).toBe(true);
      // {a,b,c,d,e} vs {a,b,c,d,f}: Intersection=4, Union=6, Jaccard=4/6=0.666 < 0.8
      expect(areTextsSimilar('a b c d e', 'a b c d f')).toBe(false);
    });

    it('respects custom threshold', () => {
      // {a,b,c,d,e} vs {a,b,c,f,g}: Intersection=3, Union=7, Jaccard=3/7≈0.428
      expect(areTextsSimilar('a b c d e', 'a b c f g', 0.4)).toBe(true);
      expect(areTextsSimilar('a b c d e', 'a b c f g', 0.5)).toBe(false);
    });

    it('is case insensitive', () => {
      expect(areTextsSimilar('HELLO WORLD', 'hello world')).toBe(true);
    });
  });

  describe('calculateMaxPairwiseSimilarity', () => {
    it('returns 0 for empty array', () => {
      expect(calculateMaxPairwiseSimilarity([])).toBe(0);
    });

    it('returns 0 for single element', () => {
      expect(calculateMaxPairwiseSimilarity(['hello'])).toBe(0);
    });

    it('returns 1 for identical adjacent texts', () => {
      expect(calculateMaxPairwiseSimilarity(['hello world', 'hello world'])).toBe(1);
    });

    it('returns max similarity among adjacent pairs', () => {
      const texts = ['a b c', 'x y z', 'a b c'];
      // First pair: {a,b,c} vs {x,y,z} = 0
      // Second pair: {x,y,z} vs {a,b,c} = 0
      expect(calculateMaxPairwiseSimilarity(texts)).toBe(0);
    });

    it('finds max similarity in longer sequence', () => {
      const texts = ['a b', 'c d', 'c d e', 'f g'];
      // Pair: {c,d} vs {c,d,e}: Intersection=2, Union=3, Jaccard=2/3≈0.666
      expect(calculateMaxPairwiseSimilarity(texts)).toBeCloseTo(0.666, 2);
    });

    it('handles highly similar sequence (stuck detection)', () => {
      const texts = ['processing task one', 'processing task two', 'processing task three'];
      // {processing,task,one} vs {processing,task,two}: Intersection=2, Union=4, Jaccard=0.5
      expect(calculateMaxPairwiseSimilarity(texts)).toBeGreaterThanOrEqual(0.5);
    });

    it('returns 1 for repeated identical messages', () => {
      const texts = ['help me', 'help me', 'help me'];
      expect(calculateMaxPairwiseSimilarity(texts)).toBe(1);
    });
  });
});
