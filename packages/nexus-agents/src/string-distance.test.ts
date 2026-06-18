import { describe, expect, it } from 'vitest';

import { levenshtein } from './string-distance.js';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('review', 'review')).toBe(0);
  });

  it('returns the length when one string is empty', () => {
    expect(levenshtein('', 'vote')).toBe(4);
    expect(levenshtein('vote', '')).toBe(4);
  });

  it('counts a single substitution as distance 1', () => {
    expect(levenshtein('vote', 'vate')).toBe(1);
  });

  it('counts a single deletion as distance 1', () => {
    expect(levenshtein('reviw', 'review')).toBe(1);
  });

  it('counts a single insertion as distance 1', () => {
    expect(levenshtein('vot', 'vote')).toBe(1);
  });

  it('is symmetric', () => {
    expect(levenshtein('doctr', 'doctor')).toBe(levenshtein('doctor', 'doctr'));
  });

  it('computes multi-edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
