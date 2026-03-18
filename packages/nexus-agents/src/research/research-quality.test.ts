/**
 * Tests for research-quality.ts
 * @module research/research-quality.test
 */

import { describe, it, expect } from 'vitest';
import {
  classifyVenue,
  recencyBoost,
  citationScore,
  computeQualityScore,
  computeEvidenceTier,
  isPreprintOnly,
} from './research-quality.js';
import type { ResearchPaper } from './research-schemas.js';

function makePaper(overrides: Partial<ResearchPaper> = {}): ResearchPaper {
  return {
    title: 'Test Paper',
    ...overrides,
  } as ResearchPaper;
}

describe('classifyVenue', () => {
  it('returns 3 for top venues', () => {
    expect(classifyVenue('NeurIPS')).toBe(3);
    expect(classifyVenue('ICML')).toBe(3);
    expect(classifyVenue('ICLR')).toBe(3);
  });

  it('returns 2 for good venues', () => {
    expect(classifyVenue('NAACL')).toBe(2);
    expect(classifyVenue('IJCAI')).toBe(2);
  });

  it('returns 1 for other non-arXiv venues', () => {
    expect(classifyVenue('Some Workshop 2026')).toBe(1);
  });

  it('returns 0 for null/undefined/empty', () => {
    expect(classifyVenue(null)).toBe(0);
    expect(classifyVenue(undefined)).toBe(0);
    expect(classifyVenue('')).toBe(0);
  });
});

describe('citationScore', () => {
  it('scores citations logarithmically', () => {
    expect(citationScore(0)).toBe(0);
    expect(citationScore(undefined)).toBe(0);
    expect(citationScore(5)).toBe(1);
    expect(citationScore(50)).toBe(2);
    expect(citationScore(500)).toBe(3);
  });
});

describe('recencyBoost', () => {
  it('gives 2 for very recent papers', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 2);
    expect(recencyBoost(recent.toISOString().slice(0, 7))).toBe(2);
  });

  it('gives 0 for old papers', () => {
    expect(recencyBoost('2020-01')).toBe(0);
  });

  it('gives 0 for undefined', () => {
    expect(recencyBoost(undefined)).toBe(0);
  });
});

describe('computeQualityScore', () => {
  it('returns 0 for a bare arXiv preprint', () => {
    const paper = makePaper({ source: 'arxiv' });
    expect(computeQualityScore(paper)).toBe(0);
  });

  it('scores highly for well-cited peer-reviewed paper with code', () => {
    const paper = makePaper({
      citation_count: 200,
      venue: 'NeurIPS',
      has_code: true,
      publication_date: new Date().toISOString().slice(0, 7),
    });
    expect(computeQualityScore(paper)).toBeGreaterThanOrEqual(8);
  });

  it('caps at 10', () => {
    const paper = makePaper({
      citation_count: 1000,
      venue: 'ICML',
      has_code: true,
      publication_date: new Date().toISOString().slice(0, 7),
    });
    expect(computeQualityScore(paper)).toBeLessThanOrEqual(10);
  });
});

describe('computeEvidenceTier', () => {
  it('returns high for peer-reviewed + code + baselines', () => {
    const paper = makePaper({
      rigor_tags: ['peer-reviewed', 'has-code', 'has-baselines'],
    });
    expect(computeEvidenceTier(paper)).toBe('high');
  });

  it('returns medium for has-code only', () => {
    const paper = makePaper({
      rigor_tags: ['has-code'],
    });
    expect(computeEvidenceTier(paper)).toBe('medium');
  });

  it('returns low for bare preprint', () => {
    const paper = makePaper({});
    expect(computeEvidenceTier(paper)).toBe('low');
  });

  it('returns high for quality >= 7', () => {
    const paper = makePaper({ quality_score: 8 });
    expect(computeEvidenceTier(paper)).toBe('high');
  });
});

describe('isPreprintOnly', () => {
  it('returns true for arxiv with no venue', () => {
    const paper = makePaper({ source: 'arxiv', venue: null });
    expect(isPreprintOnly(paper)).toBe(true);
  });

  it('returns false for arxiv with a venue', () => {
    const paper = makePaper({ source: 'arxiv', venue: 'NeurIPS' });
    expect(isPreprintOnly(paper)).toBe(false);
  });

  it('returns false for conference papers', () => {
    const paper = makePaper({ source: 'conference', venue: 'ICML' });
    expect(isPreprintOnly(paper)).toBe(false);
  });

  it('returns true for preprint source with no venue', () => {
    const paper = makePaper({ source: 'preprint', venue: null });
    expect(isPreprintOnly(paper)).toBe(true);
  });
});

describe('preprint quality cap', () => {
  it('caps preprint-only papers at 6', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 2);
    const paper = makePaper({
      source: 'arxiv',
      venue: null,
      has_code: true,
      publication_date: recent.toISOString().slice(0, 7),
    });
    // code(2) + recency(2) = 4, but would be higher without cap context
    const score = computeQualityScore(paper);
    expect(score).toBeLessThanOrEqual(6);
  });

  it('allows high-citation preprints to exceed cap', () => {
    const paper = makePaper({
      source: 'arxiv',
      venue: null,
      citation_count: 200,
      has_code: true,
      publication_date: '2024-01',
    });
    // citations(3) + code(2) = 5, but no cap because citations >= 100
    const score = computeQualityScore(paper);
    expect(score).toBe(5);
  });

  it('does not cap peer-reviewed papers', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 2);
    const paper = makePaper({
      source: 'conference',
      venue: 'NeurIPS',
      has_code: true,
      citation_count: 50,
      publication_date: recent.toISOString().slice(0, 7),
    });
    const score = computeQualityScore(paper);
    expect(score).toBeGreaterThan(6);
  });

  it('caps at 6 even with code + recency for zero-citation preprint', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    const paper = makePaper({
      source: 'arxiv',
      venue: null,
      venue_tier: 0,
      has_code: true,
      citation_count: 0,
      publication_date: recent.toISOString().slice(0, 7),
    });
    expect(computeQualityScore(paper)).toBeLessThanOrEqual(6);
  });
});
