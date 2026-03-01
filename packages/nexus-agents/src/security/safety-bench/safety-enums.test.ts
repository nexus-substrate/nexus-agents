/**
 * Tests for Safety Enums and Constants
 *
 * Validates enum member counts, specific known values, and value uniqueness
 * for all safety-bench enum-like constant objects.
 *
 * @module security/safety-bench/safety-enums.test
 * (Source: Issue #1293)
 */

import { describe, it, expect } from 'vitest';
import { RiskLevel, SafetyCategoryId, CriterionType, ExpectedOutcome } from './safety-enums.js';

// ============================================================================
// Helper
// ============================================================================

/** Assert all values in an enum-like object are unique strings. */
function assertUniqueStringValues(obj: Record<string, string>): void {
  const values = Object.values(obj);
  const unique = new Set(values);
  expect(unique.size).toBe(values.length);
  for (const v of values) {
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  }
}

// ============================================================================
// RiskLevel
// ============================================================================

describe('RiskLevel', () => {
  it('has exactly 4 members', () => {
    expect(Object.keys(RiskLevel)).toHaveLength(4);
  });

  it('contains LOW, MEDIUM, HIGH, CRITICAL', () => {
    expect(RiskLevel.LOW).toBe('low');
    expect(RiskLevel.MEDIUM).toBe('medium');
    expect(RiskLevel.HIGH).toBe('high');
    expect(RiskLevel.CRITICAL).toBe('critical');
  });

  it('has unique values', () => {
    assertUniqueStringValues(RiskLevel);
  });

  it('keys are uppercase versions of values', () => {
    for (const [key, value] of Object.entries(RiskLevel)) {
      expect(key).toBe(value.toUpperCase());
    }
  });
});

// ============================================================================
// SafetyCategoryId
// ============================================================================

describe('SafetyCategoryId', () => {
  it('has exactly 10 members', () => {
    expect(Object.keys(SafetyCategoryId)).toHaveLength(10);
  });

  const expectedIds = [
    ['HARM_PHYSICAL', 'harm_physical'],
    ['HARM_EMOTIONAL', 'harm_emotional'],
    ['HARM_FINANCIAL', 'harm_financial'],
    ['DECEPTION', 'deception'],
    ['BIAS', 'bias'],
    ['PRIVACY', 'privacy'],
    ['MANIPULATION', 'manipulation'],
    ['INSTRUCTION_SAFETY', 'instruction_safety'],
    ['ROBUSTNESS', 'robustness'],
    ['RISK_AWARENESS', 'risk_awareness'],
  ] as const;

  it.each(expectedIds)('contains %s = %s', (key, value) => {
    expect(SafetyCategoryId[key]).toBe(value);
  });

  it('has unique values', () => {
    assertUniqueStringValues(SafetyCategoryId);
  });

  it('all values use snake_case', () => {
    for (const value of Object.values(SafetyCategoryId)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

// ============================================================================
// CriterionType
// ============================================================================

describe('CriterionType', () => {
  it('has exactly 4 members', () => {
    expect(Object.keys(CriterionType)).toHaveLength(4);
  });

  it('contains BINARY, SCALED, THRESHOLD, CATEGORICAL', () => {
    expect(CriterionType.BINARY).toBe('binary');
    expect(CriterionType.SCALED).toBe('scaled');
    expect(CriterionType.THRESHOLD).toBe('threshold');
    expect(CriterionType.CATEGORICAL).toBe('categorical');
  });

  it('has unique values', () => {
    assertUniqueStringValues(CriterionType);
  });
});

// ============================================================================
// ExpectedOutcome
// ============================================================================

describe('ExpectedOutcome', () => {
  it('has exactly 6 members', () => {
    expect(Object.keys(ExpectedOutcome)).toHaveLength(6);
  });

  it('contains REFUSE, CAUTION, CLARIFY, ESCALATE, PROCEED, DETECT', () => {
    expect(ExpectedOutcome.REFUSE).toBe('refuse');
    expect(ExpectedOutcome.CAUTION).toBe('caution');
    expect(ExpectedOutcome.CLARIFY).toBe('clarify');
    expect(ExpectedOutcome.ESCALATE).toBe('escalate');
    expect(ExpectedOutcome.PROCEED).toBe('proceed');
    expect(ExpectedOutcome.DETECT).toBe('detect');
  });

  it('has unique values', () => {
    assertUniqueStringValues(ExpectedOutcome);
  });
});

// ============================================================================
// Cross-enum consistency
// ============================================================================

describe('cross-enum consistency', () => {
  it('no value overlap between RiskLevel and ExpectedOutcome', () => {
    const riskValues = new Set<string>(Object.values(RiskLevel));
    for (const outcome of Object.values(ExpectedOutcome)) {
      expect(riskValues.has(outcome)).toBe(false);
    }
  });

  it('no value overlap between CriterionType and ExpectedOutcome', () => {
    const criterionValues = new Set<string>(Object.values(CriterionType));
    for (const outcome of Object.values(ExpectedOutcome)) {
      expect(criterionValues.has(outcome)).toBe(false);
    }
  });

  it('all enum objects are plain objects (as const provides type-level immutability)', () => {
    // as const makes objects readonly at the type level, not runtime-frozen
    expect(typeof RiskLevel).toBe('object');
    expect(typeof SafetyCategoryId).toBe('object');
    expect(typeof CriterionType).toBe('object');
    expect(typeof ExpectedOutcome).toBe('object');
  });
});
