/**
 * Tests for source-quality.ts
 * @module research/source-quality.test
 * @see Issue #1577
 */

import { describe, it, expect } from 'vitest';
import {
  starScore,
  reviewRecencyScore,
  computeSourceQualityScore,
  computeSourceEvidenceTier,
} from './source-quality.js';
import type { ResearchSource } from '../indexer/research-index/research-index-base-types.js';

function makeSource(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    name: 'Test Source',
    type: 'open_source_repo',
    url: 'https://github.com/test/repo',
    topics: [],
    tags: [],
    key_info: [],
    best_practices: [],
    techniques_extracted: [],
    ...overrides,
  };
}

describe('starScore', () => {
  it('returns 0 for undefined or zero', () => {
    expect(starScore(undefined)).toBe(0);
    expect(starScore(0)).toBe(0);
  });

  it('returns 1 for 1-99 stars', () => {
    expect(starScore(1)).toBe(1);
    expect(starScore(50)).toBe(1);
    expect(starScore(99)).toBe(1);
  });

  it('returns 2 for 100-999 stars', () => {
    expect(starScore(100)).toBe(2);
    expect(starScore(500)).toBe(2);
  });

  it('returns 3 for 1000+ stars', () => {
    expect(starScore(1000)).toBe(3);
    expect(starScore(34000)).toBe(3);
  });
});

describe('reviewRecencyScore', () => {
  it('returns 0 for undefined', () => {
    expect(reviewRecencyScore(undefined)).toBe(0);
  });

  it('returns 2 for recent review', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 2);
    expect(reviewRecencyScore(recent.toISOString().slice(0, 10))).toBe(2);
  });

  it('returns 0 for old review', () => {
    expect(reviewRecencyScore('2020-01-01')).toBe(0);
  });
});

describe('computeSourceQualityScore', () => {
  it('returns 0 for repo with no quality signals', () => {
    const source = makeSource();
    expect(computeSourceQualityScore(source)).toBe(0);
  });

  it('returns baseline 3 for non-repo without signals', () => {
    const source = makeSource({ type: 'product_docs' });
    expect(computeSourceQualityScore(source)).toBe(3);
  });

  it('scores a well-maintained repo highly', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    const source = makeSource({
      quality_signals: {
        stars_at_review: 5000,
        has_tests: true,
        has_docs: true,
        has_paper: true,
      },
      reviewed_date: recent.toISOString().slice(0, 10),
    });
    const score = computeSourceQualityScore(source);
    // stars(3) + tests(1) + docs(1) + recency(2) + paper(1) = 8 → 10
    expect(score).toBe(10);
  });

  it('scores a minimal repo low', () => {
    const source = makeSource({
      quality_signals: {
        stars_at_review: 10,
        has_tests: false,
        has_docs: false,
      },
      reviewed_date: '2020-01-01',
    });
    const score = computeSourceQualityScore(source);
    // stars(1) + tests(0) + docs(0) + recency(0) + paper(0) = 1 → 1
    expect(score).toBeLessThanOrEqual(2);
  });

  it('caps at 10', () => {
    const recent = new Date();
    const source = makeSource({
      quality_signals: {
        stars_at_review: 100000,
        has_tests: true,
        has_docs: true,
        has_paper: true,
      },
      reviewed_date: recent.toISOString().slice(0, 10),
    });
    expect(computeSourceQualityScore(source)).toBeLessThanOrEqual(10);
  });
});

describe('computeSourceEvidenceTier', () => {
  it('returns low for source with no signals', () => {
    const source = makeSource();
    expect(computeSourceEvidenceTier(source)).toBe('low');
  });

  it('returns medium for source with tests', () => {
    const source = makeSource({
      quality_signals: { has_tests: true, stars_at_review: 10 },
    });
    expect(computeSourceEvidenceTier(source)).toBe('medium');
  });

  it('returns high for high-quality source with tests', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    const source = makeSource({
      quality_score: 8,
      quality_signals: {
        stars_at_review: 5000,
        has_tests: true,
        has_docs: true,
      },
      reviewed_date: recent.toISOString().slice(0, 10),
    });
    expect(computeSourceEvidenceTier(source)).toBe('high');
  });

  it('returns medium for score >= 4 without tests', () => {
    const source = makeSource({ quality_score: 5 });
    expect(computeSourceEvidenceTier(source)).toBe('medium');
  });
});
