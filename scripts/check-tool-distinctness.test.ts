/**
 * Tests for the tool-description distinctness lint (#2650).
 *
 * @module scripts/check-tool-distinctness.test
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  computeTfIdf,
  cosineSimilarity,
  rankPairs,
  runDistinctnessCheck,
  type Baseline,
} from './check-tool-distinctness.js';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumerics', () => {
    expect(tokenize('Query the Research-Registry')).toEqual(['query', 'research', 'registry']);
  });

  it('drops stopwords, short tokens, and pure-numeric tokens', () => {
    // "the", "a", "to" are stopwords; "x" is too short; "2233" is numeric.
    expect(tokenize('the a x to issue 2233 paper')).toEqual(['issue', 'paper']);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it('returns 0 for vectors sharing no terms', () => {
    expect(cosineSimilarity(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(0);
  });

  it('returns 0 when either vector is empty', () => {
    expect(cosineSimilarity(new Map(), new Map([['a', 1]]))).toBe(0);
  });
});

describe('computeTfIdf', () => {
  it('zeroes out a term that appears in every document', () => {
    // IDF = ln(N / df); a term in all docs has df = N, so idf = ln(1) = 0.
    const vectors = computeTfIdf({
      one: ['shared', 'unique1'],
      two: ['shared', 'unique2'],
    });
    expect(vectors.get('one')?.get('shared')).toBe(0);
    expect(vectors.get('one')?.get('unique1')).toBeGreaterThan(0);
  });
});

describe('rankPairs', () => {
  it('produces C(n,2) pairs sorted by descending similarity', () => {
    const ranked = rankPairs({ a: 'alpha beta', b: 'alpha beta', c: 'gamma delta' });
    expect(ranked).toHaveLength(3); // C(3,2)
    // a and b are identical → similarity 1; both differ from c → 0.
    expect(ranked[0]).toEqual({ a: 'a', b: 'b', similarity: 1 });
    expect(ranked[ranked.length - 1]?.similarity).toBe(0);
    // Sorted descending.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.similarity).toBeGreaterThanOrEqual(ranked[i]!.similarity);
    }
  });
});

describe('runDistinctnessCheck', () => {
  // Two near-identical descriptions → high similarity; a third distinct one.
  const descriptions = {
    list_a: 'List available expert types and capabilities',
    list_b: 'List available expert types and capabilities here',
    other: 'Compute a hash chain over an audit log directory',
  };

  it('passes when every flagged pair is in the baseline', () => {
    const ranked = rankPairs(descriptions);
    const top = ranked[0]!;
    const baseline: Baseline = {
      threshold: 0.5,
      tolerance: 0.03,
      pairs: [{ a: top.a, b: top.b, similarity: top.similarity }],
    };
    const result = runDistinctnessCheck(descriptions, baseline);
    expect(result.ok).toBe(true);
    expect(result.newOffenders).toHaveLength(0);
    expect(result.regressions).toHaveLength(0);
  });

  it('fails on a NEW flagged pair that is not in the baseline', () => {
    const baseline: Baseline = { threshold: 0.5, tolerance: 0.03, pairs: [] };
    const result = runDistinctnessCheck(descriptions, baseline);
    expect(result.ok).toBe(false);
    expect(result.newOffenders.length).toBeGreaterThan(0);
    expect(result.newOffenders[0]).toMatchObject({ a: 'list_a', b: 'list_b' });
  });

  it('fails when a baseline pair grows more similar than the tolerance allows', () => {
    const ranked = rankPairs(descriptions);
    const top = ranked[0]!;
    const baseline: Baseline = {
      threshold: 0.5,
      tolerance: 0.03,
      // Record the pair at an artificially low similarity so the real
      // score exceeds baseline + tolerance.
      pairs: [{ a: top.a, b: top.b, similarity: top.similarity - 0.2 }],
    };
    const result = runDistinctnessCheck(descriptions, baseline);
    expect(result.ok).toBe(false);
    expect(result.regressions.length).toBeGreaterThan(0);
  });

  it('tolerates a baseline pair whose similarity moved within the tolerance', () => {
    const ranked = rankPairs(descriptions);
    const top = ranked[0]!;
    const baseline: Baseline = {
      threshold: 0.5,
      tolerance: 0.03,
      pairs: [{ a: top.a, b: top.b, similarity: top.similarity - 0.01 }],
    };
    const result = runDistinctnessCheck(descriptions, baseline);
    expect(result.ok).toBe(true);
  });
});
