/**
 * Bounding an artifact for review must disclose the bound (#5301).
 *
 * CLAUDE.md: "A review must consume the artifact, not a description of it. …
 * Bounded reads are legitimate — but the record must then state which portion
 * was reviewed. A partial review honestly labeled is fine; a partial review
 * recorded as complete is the failure."
 *
 * @module utils/bounded-artifact.test
 */

import { describe, it, expect } from 'vitest';

import { boundArtifactForReview } from './bounded-artifact.js';

describe('boundArtifactForReview', () => {
  it('passes a within-budget artifact through untouched', () => {
    // The #4140 contract: an in-budget input must be byte-identical and carry
    // no note, so nothing changes for the ordinary case.
    const result = boundArtifactForReview('short', 100, 'proposal');

    expect(result.text).toBe('short');
    expect(result.note).toBe('');
    expect(result.bound).toBeUndefined();
  });

  it('truncates to the budget and says so', () => {
    const result = boundArtifactForReview('x'.repeat(500), 100, 'proposal');

    expect(result.text).toHaveLength(100);
    expect(result.note).toMatch(/partial/i);
    expect(result.note).toContain('100');
    expect(result.note).toContain('500');
  });

  it('names the artifact in the note', () => {
    // A reviewer told "you are seeing part of it" needs to know part of what.
    const result = boundArtifactForReview('x'.repeat(500), 100, 'diff');
    expect(result.note).toContain('diff');
  });

  it('reports machine-readable bounds when truncated', () => {
    const result = boundArtifactForReview('x'.repeat(500), 100, 'proposal');

    expect(result.bound).toMatchObject({
      reviewedChars: 100,
      totalChars: 500,
      partial: true,
    });
  });

  it('does not claim partial at exactly the budget', () => {
    // Off-by-one guard. Labelling a whole read partial is its own misreport,
    // and would make the note meaningless by appearing on every review.
    const result = boundArtifactForReview('x'.repeat(100), 100, 'proposal');

    expect(result.bound).toBeUndefined();
    expect(result.note).toBe('');
    expect(result.text).toHaveLength(100);
  });

  it('handles an empty artifact without claiming truncation', () => {
    const result = boundArtifactForReview('', 100, 'proposal');
    expect(result.bound).toBeUndefined();
    expect(result.text).toBe('');
  });
});
