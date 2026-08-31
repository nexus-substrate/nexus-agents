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
  DEFAULT_THRESHOLD,
  normalizeBaseline,
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

describe('the fallback threshold must be reachable (#5261-class)', () => {
  /**
   * `loadBaseline()` returned `threshold: 1.1` when the baseline file was
   * absent, and used the same value when a present baseline lacked the key
   * (`parsed.threshold ?? 1.1`).
   *
   * Flagging is `similarity >= baseline.threshold` over **cosine similarity,
   * which is bounded at 1.0**. So `1.1` was unreachable by construction:
   * `flagged` was always empty, `ok` was always true, and the gate printed
   * "Tool distinctness OK - 0 pair(s) at/above threshold 1.1" and exited 0.
   *
   * A gate that cannot fail is not a gate, and this one is worse than a missing
   * check: it renders a green mark in the required `lint` job that a reviewer
   * reads as "tool descriptions were compared". Nothing had been.
   *
   * The committed baseline carries `0.5`, so the gate does work today. Deleting
   * that file - or committing a baseline without the key - silently disabled it.
   */

  /**
   * A near-duplicate pair inside a corpus with enough variety for IDF to be
   * non-zero.
   *
   * The corpus matters: TF-IDF assigns zero weight to a term appearing in every
   * document, so a two-document corpus of *identical* text scores 0.0, not 1.0.
   * A "maximum similarity" fixture built that way would assert the opposite of
   * what it appears to. The third description supplies the contrast that makes
   * the shared terms carry weight.
   */
  const nearDuplicates = {
    list_a: 'List available expert types and capabilities',
    list_b: 'List available expert types and capabilities here',
    other: 'Compute a hash chain over an audit log directory',
  };

  it('never falls back to a threshold cosine similarity cannot reach', () => {
    // The structural half. Cosine similarity over non-negative TF-IDF vectors
    // is bounded at 1.0, so any fallback above that flags nothing whatsoever,
    // for any corpus - no fixture can rescue it.
    expect(DEFAULT_THRESHOLD).toBeLessThanOrEqual(1);

    // And it must be reachable by what the scorer actually emits, not merely
    // by the theoretical bound: a fallback of 0.999 clears the line above
    // while still being unreachable in practice.
    const top = rankPairs(nearDuplicates)[0];
    expect(top).toBeDefined();
    expect(DEFAULT_THRESHOLD).toBeLessThanOrEqual(top!.similarity);
  });

  it('flags a near-duplicate pair when the fallback is in force', () => {
    // The behavioural half. Asserting the constant's value alone would not
    // prove the comparison consults it.
    const baseline: Baseline = { threshold: DEFAULT_THRESHOLD, tolerance: 0.03, pairs: [] };
    const result = runDistinctnessCheck(nearDuplicates, baseline);

    expect(result.ok).toBe(false);
    expect(result.newOffenders).toMatchObject([{ a: 'list_a', b: 'list_b' }]);
  });

  it('still passes a genuinely distinct corpus under the fallback', () => {
    // The control that stops the pair above from being satisfied by a fallback
    // of 0, which would flag every pair in every corpus - a different way of
    // being useless. Both tests must hold at once.
    const baseline: Baseline = { threshold: DEFAULT_THRESHOLD, tolerance: 0.03, pairs: [] };
    const result = runDistinctnessCheck(
      {
        audit: 'Verify the audit hash chain integrity',
        weather: 'Render a weather forecast for a city',
        vote: 'Run a consensus panel over model voters',
      },
      baseline
    );

    expect(result.flagged).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('uses the fallback when a committed baseline omits the threshold key', () => {
    // The second fallback site. `loadBaseline` carried the literal twice - the
    // absent-file branch and `parsed.threshold ?? 1.1` - so fixing only the
    // first would leave a key-less baseline silently disabling the gate.
    expect(normalizeBaseline({ tolerance: 0.03, pairs: [] }).threshold).toBe(DEFAULT_THRESHOLD);
    expect(normalizeBaseline(undefined).threshold).toBe(DEFAULT_THRESHOLD);
  });

  it('keeps an explicit threshold of 0 rather than replacing it', () => {
    // `??` is deliberate here and `||` would not do: 0 is a meaningful
    // threshold (flag everything) and must survive.
    expect(normalizeBaseline({ threshold: 0, pairs: [] }).threshold).toBe(0);
  });
});
