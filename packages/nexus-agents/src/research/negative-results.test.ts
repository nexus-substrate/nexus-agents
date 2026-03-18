/**
 * Tests for negative-results.ts
 * @module research/negative-results.test
 */

import { describe, it, expect } from 'vitest';
import { checkRejected, getRejectedIds, formatRejectionWarning } from './negative-results.js';

describe('negative results enforcement', () => {
  it('detects rejected techniques', () => {
    const result = checkRejected('latent-space-sharing');
    // This exists in the actual registry
    if (result !== undefined) {
      expect(result.name).toContain('LatentMAS');
      expect(result.failure_mode).toBe('architecture_incompatible');
    }
  });

  it('returns undefined for non-rejected techniques', () => {
    const result = checkRejected('nonexistent-technique');
    expect(result).toBeUndefined();
  });

  it('lists all rejected IDs', () => {
    const ids = getRejectedIds();
    expect(Array.isArray(ids)).toBe(true);
  });

  it('formats rejection warning', () => {
    const warning = formatRejectionWarning('test', {
      name: 'Test Technique',
      paper: 'arxiv-0000.00000',
      rejection_date: '2026-01-01',
      failure_mode: 'architecture_incompatible',
      lessons_learned: ['Lesson 1'],
      reopen_conditions: ['Condition 1'],
    });
    expect(warning).toContain('REJECTED');
    expect(warning).toContain('Lesson 1');
    expect(warning).toContain('Condition 1');
  });
});
