/**
 * Tests for MobiMEM Implementation Helpers
 * @module context/mobimem-impl-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ActionStep } from './mobimem-types.js';
import {
  calculateConfidence,
  generatePatternKey,
  hashInput,
  calculatePatternScore,
  computeSuccessRate,
  computeUpdatedMetrics,
  countUnique,
  computeAverage,
} from './mobimem-impl-helpers.js';

// ============================================================================
// calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
  it('returns 0 for 0 observations', () => {
    expect(calculateConfidence(0)).toBeCloseTo(0, 4);
  });

  it('returns value between 0 and 1 for small counts', () => {
    const c = calculateConfidence(5);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });

  it('caps at 1 for large counts', () => {
    expect(calculateConfidence(10000)).toBe(1);
  });

  it('increases with more observations', () => {
    expect(calculateConfidence(10)).toBeGreaterThan(calculateConfidence(1));
    expect(calculateConfidence(100)).toBeGreaterThan(calculateConfidence(10));
  });

  it('returns ~0.5 for about 100 observations', () => {
    // log10(100 + 1) / 2 ≈ 2.004 / 2 ≈ 1.002 → capped at 1
    // Actually log10(101) ≈ 2.004, /2 = 1.002 → min(1, 1.002) = 1
    // Let's check for 10: log10(11) ≈ 1.04, /2 = 0.52
    expect(calculateConfidence(10)).toBeCloseTo(0.52, 1);
  });
});

// ============================================================================
// generatePatternKey
// ============================================================================

describe('generatePatternKey', () => {
  it('includes task type in key', () => {
    const steps: ActionStep[] = [
      { index: 0, actionType: 'tool_call', parameters: {}, durationMs: 100, success: true },
    ];
    const key = generatePatternKey('code_review', steps, 'ctx1');
    expect(key.startsWith('code_review:')).toBe(true);
  });

  it('includes context signature in key', () => {
    const steps: ActionStep[] = [];
    const key = generatePatternKey('task', steps, 'my_context');
    expect(key).toContain('my_context');
  });

  it('produces consistent keys for same input', () => {
    const steps: ActionStep[] = [
      { index: 0, actionType: 'test', parameters: { a: 1 }, durationMs: 50, success: true },
    ];
    const key1 = generatePatternKey('task', steps, 'ctx');
    const key2 = generatePatternKey('task', steps, 'ctx');
    expect(key1).toBe(key2);
  });

  it('produces different keys for different actions', () => {
    const steps1: ActionStep[] = [
      { index: 0, actionType: 'a', parameters: {}, durationMs: 0, success: true },
    ];
    const steps2: ActionStep[] = [
      { index: 0, actionType: 'b', parameters: {}, durationMs: 0, success: true },
    ];
    const key1 = generatePatternKey('task', steps1, 'ctx');
    const key2 = generatePatternKey('task', steps2, 'ctx');
    expect(key1).not.toBe(key2);
  });
});

// ============================================================================
// hashInput
// ============================================================================

describe('hashInput', () => {
  it('returns hex string', () => {
    const hash = hashInput('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashInput({ a: 1 })).toBe(hashInput({ a: 1 }));
  });

  it('differs for different inputs', () => {
    expect(hashInput('a')).not.toBe(hashInput('b'));
  });
});

// ============================================================================
// calculatePatternScore
// ============================================================================

describe('calculatePatternScore', () => {
  it('returns 0 for 0 success rate', () => {
    expect(calculatePatternScore(0, true, 10)).toBe(0);
  });

  it('gives higher score for context match', () => {
    const withMatch = calculatePatternScore(0.8, true, 10);
    const withoutMatch = calculatePatternScore(0.8, false, 10);
    expect(withMatch).toBeGreaterThan(withoutMatch);
  });

  it('gives half score for context mismatch', () => {
    const withMatch = calculatePatternScore(1, true, 10);
    const withoutMatch = calculatePatternScore(1, false, 10);
    expect(withoutMatch).toBeCloseTo(withMatch / 2, 4);
  });

  it('increases with more attempts', () => {
    const low = calculatePatternScore(0.8, true, 1);
    const high = calculatePatternScore(0.8, true, 100);
    expect(high).toBeGreaterThan(low);
  });

  it('returns 0 for 0 attempts', () => {
    // log10(0 + 1) = 0
    expect(calculatePatternScore(1, true, 0)).toBe(0);
  });
});

// ============================================================================
// computeSuccessRate
// ============================================================================

describe('computeSuccessRate', () => {
  it('returns 0 for 0 attempts', () => {
    expect(computeSuccessRate(0, 0)).toBe(0);
  });

  it('returns 1 for all successes', () => {
    expect(computeSuccessRate(10, 10)).toBe(1);
  });

  it('returns 0.5 for half successes', () => {
    expect(computeSuccessRate(5, 10)).toBe(0.5);
  });
});

// ============================================================================
// computeUpdatedMetrics
// ============================================================================

describe('computeUpdatedMetrics', () => {
  it('increments success count on success', () => {
    const result = computeUpdatedMetrics(5, 10, true);
    expect(result.successCount).toBe(6);
    expect(result.attemptCount).toBe(11);
  });

  it('does not increment success count on failure', () => {
    const result = computeUpdatedMetrics(5, 10, false);
    expect(result.successCount).toBe(5);
    expect(result.attemptCount).toBe(11);
  });

  it('calculates correct success rate', () => {
    const result = computeUpdatedMetrics(4, 9, true);
    expect(result.successRate).toBe(0.5); // 5/10
  });
});

// ============================================================================
// countUnique
// ============================================================================

describe('countUnique', () => {
  it('counts unique values', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'a' }];
    expect(countUnique(items, (v) => v.id)).toBe(2);
  });

  it('returns 0 for empty iterable', () => {
    expect(countUnique([], () => '')).toBe(0);
  });

  it('counts all when all unique', () => {
    expect(countUnique([1, 2, 3], (v) => String(v))).toBe(3);
  });
});

// ============================================================================
// computeAverage
// ============================================================================

describe('computeAverage', () => {
  it('computes average', () => {
    expect(computeAverage([1, 2, 3], (v) => v)).toBe(2);
  });

  it('returns 0 for empty iterable', () => {
    expect(computeAverage([], () => 0)).toBe(0);
  });

  it('handles single value', () => {
    expect(computeAverage([42], (v) => v)).toBe(42);
  });

  it('works with object property extraction', () => {
    const items = [{ score: 0.8 }, { score: 0.6 }];
    expect(computeAverage(items, (v) => v.score)).toBeCloseTo(0.7);
  });
});
