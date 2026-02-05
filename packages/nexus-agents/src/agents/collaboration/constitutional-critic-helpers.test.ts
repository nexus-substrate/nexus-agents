/**
 * Tests for Constitutional Critic Helpers
 * @module agents/collaboration/constitutional-critic-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Violation } from './constitutional-types.js';
import {
  SEVERITY_ORDER,
  getDetectionPatterns,
  getLineNumber,
  calculateScore,
  checksPasses,
  generateSummary,
  summarizeChanges,
  matchKeywords,
  filterViolationsBySeverity,
} from './constitutional-critic-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    principleId: 'no-secrets',
    severity: 'high',
    description: 'Secret detected',
    confidence: 0.9,
    suggestedFix: 'Remove secret',
    ...overrides,
  } as Violation;
}

// ============================================================================
// SEVERITY_ORDER
// ============================================================================

describe('SEVERITY_ORDER', () => {
  it('orders critical > high > medium > low', () => {
    expect(SEVERITY_ORDER['critical']).toBeGreaterThan(SEVERITY_ORDER['high']);
    expect(SEVERITY_ORDER['high']).toBeGreaterThan(SEVERITY_ORDER['medium']);
    expect(SEVERITY_ORDER['medium']).toBeGreaterThan(SEVERITY_ORDER['low']);
  });
});

// ============================================================================
// getDetectionPatterns
// ============================================================================

describe('getDetectionPatterns', () => {
  it('returns patterns for known principle', () => {
    const patterns = getDetectionPatterns('no-secrets');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]).toBeInstanceOf(RegExp);
  });

  it('returns patterns for input-validation', () => {
    const patterns = getDetectionPatterns('input-validation');
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('returns empty for unknown principle', () => {
    expect(getDetectionPatterns('unknown-principle')).toEqual([]);
  });
});

// ============================================================================
// getLineNumber
// ============================================================================

describe('getLineNumber', () => {
  it('returns 1 for first line', () => {
    expect(getLineNumber('hello', 3)).toBe(1);
  });

  it('returns correct line for multi-line', () => {
    const text = 'line1\nline2\nline3';
    expect(getLineNumber(text, 10)).toBe(2);
  });

  it('returns line count for end of text', () => {
    expect(getLineNumber('a\nb\nc', 5)).toBe(3);
  });
});

// ============================================================================
// calculateScore
// ============================================================================

describe('calculateScore', () => {
  it('returns 10 for no principles', () => {
    expect(calculateScore([], 0)).toBe(10);
  });

  it('returns 10 for no violations', () => {
    expect(calculateScore([], 5)).toBe(10);
  });

  it('reduces score for violations', () => {
    const violations = [makeViolation({ severity: 'critical', confidence: 1.0 })];
    const score = calculateScore(violations, 5);
    expect(score).toBeLessThan(10);
  });

  it('clamps to valid range', () => {
    const violations = Array(10).fill(
      makeViolation({ severity: 'critical', confidence: 1.0 })
    ) as Violation[];
    const score = calculateScore(violations, 2);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// checksPasses
// ============================================================================

describe('checksPasses', () => {
  it('passes when no violations', () => {
    expect(checksPasses([], ['critical', 'high'])).toBe(true);
  });

  it('passes when violation severity not in failing list', () => {
    const violations = [makeViolation({ severity: 'low' })];
    expect(checksPasses(violations, ['critical', 'high'])).toBe(true);
  });

  it('fails when violation severity in failing list', () => {
    const violations = [makeViolation({ severity: 'critical' })];
    expect(checksPasses(violations, ['critical'])).toBe(false);
  });
});

// ============================================================================
// generateSummary
// ============================================================================

describe('generateSummary', () => {
  it('returns clean message for no violations', () => {
    expect(generateSummary([], 10, true)).toContain('No violations');
  });

  it('includes violation counts by severity', () => {
    const violations = [
      makeViolation({ severity: 'critical' }),
      makeViolation({ severity: 'high' }),
      makeViolation({ severity: 'high' }),
    ];
    const summary = generateSummary(violations, 5.0, false);
    expect(summary).toContain('3 violation');
    expect(summary).toContain('Critical: 1');
    expect(summary).toContain('High: 2');
    expect(summary).toContain('Fails');
  });

  it('indicates passing', () => {
    const summary = generateSummary([makeViolation({ severity: 'low' })], 8.0, true);
    expect(summary).toContain('Passes');
  });
});

// ============================================================================
// summarizeChanges
// ============================================================================

describe('summarizeChanges', () => {
  it('reports added lines', () => {
    expect(summarizeChanges('a', 'a\nb\nc')).toContain('Added 2');
  });

  it('reports removed lines', () => {
    expect(summarizeChanges('a\nb\nc', 'a')).toContain('Removed 2');
  });

  it('reports modified lines when same count', () => {
    expect(summarizeChanges('a\nb', 'x\ny')).toContain('Modified');
  });
});

// ============================================================================
// matchKeywords
// ============================================================================

describe('matchKeywords', () => {
  it('returns 1 for all keywords matched', () => {
    expect(matchKeywords('hello world again', 'hello world again and more')).toBe(1);
  });

  it('returns 0 for no matches', () => {
    expect(matchKeywords('specific terms here', 'nothing related')).toBe(0);
  });

  it('returns fraction for partial match', () => {
    const result = matchKeywords('hello world again', 'hello and nothing else');
    expect(result).toBeCloseTo(1 / 3);
  });

  it('filters short words', () => {
    // All words <= 3 chars are filtered, so 0 keywords
    expect(matchKeywords('a to do', 'a to do')).toBe(0);
  });
});

// ============================================================================
// filterViolationsBySeverity
// ============================================================================

describe('filterViolationsBySeverity', () => {
  it('filters by minimum severity', () => {
    const violations = [
      makeViolation({ severity: 'critical' }),
      makeViolation({ severity: 'high' }),
      makeViolation({ severity: 'low' }),
    ];
    const filtered = filterViolationsBySeverity(violations, 'high');
    expect(filtered).toHaveLength(2);
  });

  it('returns all for lowest severity', () => {
    const violations = [makeViolation({ severity: 'low' })];
    expect(filterViolationsBySeverity(violations, 'low')).toHaveLength(1);
  });

  it('returns empty for no matching severity', () => {
    const violations = [makeViolation({ severity: 'low' })];
    expect(filterViolationsBySeverity(violations, 'critical')).toEqual([]);
  });
});
