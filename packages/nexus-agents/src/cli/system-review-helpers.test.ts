/**
 * Tests for System Review Helpers
 * @module cli/system-review-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { SystemReviewResult } from './system-review-types.js';
import { calculateHealthScore } from './system-review-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeReviewResult(overrides: Partial<SystemReviewResult> = {}): SystemReviewResult {
  return {
    timestamp: new Date(),
    techniques: { implemented: 10, planned: 5, notStarted: 3, rejected: 1 },
    docs: [],
    issues: { openCount: 5, staleCount: 0, byLabel: {} },
    security: { totalVulns: 0, high: 0, moderate: 0, low: 0 },
    quality: { typecheckPass: true, lintPass: true, coveragePercent: 85 },
    actionItems: [],
    fixesApplied: [],
    ...overrides,
  };
}

// ============================================================================
// calculateHealthScore
// ============================================================================

describe('calculateHealthScore', () => {
  it('returns 100 for perfect review', () => {
    expect(calculateHealthScore(makeReviewResult())).toBe(100);
  });

  it('deducts for stale docs', () => {
    const result = makeReviewResult({
      docs: [{ file: 'README.md', daysSinceUpdate: 100, status: 'stale' }],
    });
    expect(calculateHealthScore(result)).toBe(95); // 100 - 5
  });

  it('deducts for review docs', () => {
    const result = makeReviewResult({
      docs: [{ file: 'README.md', daysSinceUpdate: 40, status: 'review' }],
    });
    expect(calculateHealthScore(result)).toBe(98); // 100 - 2
  });

  it('deducts for high security vulns', () => {
    const result = makeReviewResult({
      security: { totalVulns: 2, high: 2, moderate: 0, low: 0 },
    });
    expect(calculateHealthScore(result)).toBe(60); // 100 - 2*20
  });

  it('deducts for moderate security vulns', () => {
    const result = makeReviewResult({
      security: { totalVulns: 1, high: 0, moderate: 1, low: 0 },
    });
    expect(calculateHealthScore(result)).toBe(95); // 100 - 5
  });

  it('deducts for typecheck failure', () => {
    const result = makeReviewResult({
      quality: { typecheckPass: false, lintPass: true, coveragePercent: 85 },
    });
    expect(calculateHealthScore(result)).toBe(85); // 100 - 15
  });

  it('deducts for lint failure', () => {
    const result = makeReviewResult({
      quality: { typecheckPass: true, lintPass: false, coveragePercent: 85 },
    });
    expect(calculateHealthScore(result)).toBe(85); // 100 - 15
  });

  it('deducts for low coverage', () => {
    const result = makeReviewResult({
      quality: { typecheckPass: true, lintPass: true, coveragePercent: 50 },
    });
    expect(calculateHealthScore(result)).toBe(90); // 100 - 10
  });

  it('does not deduct for null coverage', () => {
    const result = makeReviewResult({
      quality: { typecheckPass: true, lintPass: true, coveragePercent: null },
    });
    expect(calculateHealthScore(result)).toBe(100);
  });

  it('deducts for stale issues', () => {
    const result = makeReviewResult({
      issues: { openCount: 10, staleCount: 3, byLabel: {} },
    });
    expect(calculateHealthScore(result)).toBe(94); // 100 - 3*2
  });

  it('clamps to 0 minimum', () => {
    const result = makeReviewResult({
      security: { totalVulns: 10, high: 10, moderate: 0, low: 0 },
      quality: { typecheckPass: false, lintPass: false, coveragePercent: 10 },
    });
    expect(calculateHealthScore(result)).toBe(0);
  });

  it('accumulates multiple penalties', () => {
    const result = makeReviewResult({
      docs: [{ file: 'a.md', daysSinceUpdate: 100, status: 'stale' }],
      security: { totalVulns: 1, high: 1, moderate: 0, low: 0 },
      quality: { typecheckPass: false, lintPass: true, coveragePercent: 85 },
      issues: { openCount: 5, staleCount: 2, byLabel: {} },
    });
    // 100 - 5 (stale doc) - 20 (high vuln) - 15 (typecheck) - 4 (2 stale issues) = 56
    expect(calculateHealthScore(result)).toBe(56);
  });
});
