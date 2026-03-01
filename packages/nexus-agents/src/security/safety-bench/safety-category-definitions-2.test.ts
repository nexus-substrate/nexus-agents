/**
 * Tests for Safety Category Definitions (Part 2)
 *
 * Covers the 5 categories re-exported from safety-category-definitions-2.ts:
 * Privacy, Manipulation, Instruction Safety, Robustness, Risk Awareness.
 *
 * @module security/safety-bench/safety-category-definitions-2.test
 * (Source: Issue #1293)
 */

import { describe, it, expect } from 'vitest';
import { RiskLevel, SafetyCategoryId, CriterionType, ExpectedOutcome } from './safety-enums.js';
import { SafetyCategorySchema } from './safety-schemas.js';
import type { SafetyCategory } from './safety-schemas.js';
import {
  PRIVACY_CATEGORY,
  MANIPULATION_CATEGORY,
  INSTRUCTION_SAFETY_CATEGORY,
  ROBUSTNESS_CATEGORY,
  RISK_AWARENESS_CATEGORY,
} from './safety-category-definitions-2.js';

// ============================================================================
// Test Data
// ============================================================================

const ALL_CATEGORIES: readonly { name: string; category: SafetyCategory }[] = [
  { name: 'PRIVACY_CATEGORY', category: PRIVACY_CATEGORY },
  { name: 'MANIPULATION_CATEGORY', category: MANIPULATION_CATEGORY },
  { name: 'INSTRUCTION_SAFETY_CATEGORY', category: INSTRUCTION_SAFETY_CATEGORY },
  { name: 'ROBUSTNESS_CATEGORY', category: ROBUSTNESS_CATEGORY },
  { name: 'RISK_AWARENESS_CATEGORY', category: RISK_AWARENESS_CATEGORY },
];

// ============================================================================
// Individual Category Identity
// ============================================================================

describe('PRIVACY_CATEGORY', () => {
  it('has correct id', () => {
    expect(PRIVACY_CATEGORY.id).toBe(SafetyCategoryId.PRIVACY);
  });

  it('has correct name', () => {
    expect(PRIVACY_CATEGORY.name).toBe('Privacy Protection');
  });

  it('has high default risk level', () => {
    expect(PRIVACY_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });

  it('has 3 criteria', () => {
    expect(PRIVACY_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(PRIVACY_CATEGORY.exampleTestCases).toHaveLength(3);
  });

  it('includes PII protection criterion', () => {
    const hasPii = PRIVACY_CATEGORY.criteria.some((c) => c.id.includes('pii'));
    expect(hasPii).toBe(true);
  });

  it('includes exfiltration resistance criterion', () => {
    const hasExfil = PRIVACY_CATEGORY.criteria.some((c) => c.id.includes('exfiltration'));
    expect(hasExfil).toBe(true);
  });
});

describe('MANIPULATION_CATEGORY', () => {
  it('has correct id', () => {
    expect(MANIPULATION_CATEGORY.id).toBe(SafetyCategoryId.MANIPULATION);
  });

  it('has correct name', () => {
    expect(MANIPULATION_CATEGORY.name).toBe('Manipulation Resistance');
  });

  it('has high default risk level', () => {
    expect(MANIPULATION_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });

  it('has 3 criteria', () => {
    expect(MANIPULATION_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(MANIPULATION_CATEGORY.exampleTestCases).toHaveLength(3);
  });

  it('includes social engineering resistance criterion', () => {
    const hasSocial = MANIPULATION_CATEGORY.criteria.some((c) =>
      c.id.includes('social_engineering')
    );
    expect(hasSocial).toBe(true);
  });
});

describe('INSTRUCTION_SAFETY_CATEGORY', () => {
  it('has correct id', () => {
    expect(INSTRUCTION_SAFETY_CATEGORY.id).toBe(SafetyCategoryId.INSTRUCTION_SAFETY);
  });

  it('has correct name', () => {
    expect(INSTRUCTION_SAFETY_CATEGORY.name).toBe('Instruction Following Safety');
  });

  it('has high default risk level', () => {
    expect(INSTRUCTION_SAFETY_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });

  it('has 3 criteria', () => {
    expect(INSTRUCTION_SAFETY_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(INSTRUCTION_SAFETY_CATEGORY.exampleTestCases).toHaveLength(3);
  });

  it('includes hierarchy respect criterion', () => {
    const hasHierarchy = INSTRUCTION_SAFETY_CATEGORY.criteria.some((c) =>
      c.id.includes('hierarchy')
    );
    expect(hasHierarchy).toBe(true);
  });
});

describe('ROBUSTNESS_CATEGORY', () => {
  it('has correct id', () => {
    expect(ROBUSTNESS_CATEGORY.id).toBe(SafetyCategoryId.ROBUSTNESS);
  });

  it('has correct name', () => {
    expect(ROBUSTNESS_CATEGORY.name).toBe('Robustness');
  });

  it('has medium default risk level', () => {
    expect(ROBUSTNESS_CATEGORY.defaultRiskLevel).toBe(RiskLevel.MEDIUM);
  });

  it('has 3 criteria', () => {
    expect(ROBUSTNESS_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(ROBUSTNESS_CATEGORY.exampleTestCases).toHaveLength(3);
  });

  it('includes adversarial resistance criterion', () => {
    const hasAdversarial = ROBUSTNESS_CATEGORY.criteria.some((c) => c.id.includes('adversarial'));
    expect(hasAdversarial).toBe(true);
  });
});

describe('RISK_AWARENESS_CATEGORY', () => {
  it('has correct id', () => {
    expect(RISK_AWARENESS_CATEGORY.id).toBe(SafetyCategoryId.RISK_AWARENESS);
  });

  it('has correct name', () => {
    expect(RISK_AWARENESS_CATEGORY.name).toBe('Risk Awareness');
  });

  it('has medium default risk level', () => {
    expect(RISK_AWARENESS_CATEGORY.defaultRiskLevel).toBe(RiskLevel.MEDIUM);
  });

  it('has 3 criteria', () => {
    expect(RISK_AWARENESS_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(RISK_AWARENESS_CATEGORY.exampleTestCases).toHaveLength(3);
  });

  it('includes risk identification criterion', () => {
    const hasRiskId = RISK_AWARENESS_CATEGORY.criteria.some((c) =>
      c.id.includes('risk_identification')
    );
    expect(hasRiskId).toBe(true);
  });
});

// ============================================================================
// Structural Validation (all Part 2 categories)
// ============================================================================

describe('all Part 2 categories structural validation', () => {
  it('have unique ids', () => {
    const ids = ALL_CATEGORIES.map((c) => c.category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('have unique names', () => {
    const names = ALL_CATEGORIES.map((c) => c.category.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('have non-empty descriptions (min 20 chars)', () => {
    for (const { category } of ALL_CATEGORIES) {
      expect(category.description.length).toBeGreaterThan(20);
    }
  });

  it('criteria weights sum to 1.0 for each category', () => {
    for (const { category } of ALL_CATEGORIES) {
      const weightSum = category.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 10);
    }
  });

  it('criteria weights are in [0, 1]', () => {
    for (const { category } of ALL_CATEGORIES) {
      for (const criterion of category.criteria) {
        expect(criterion.weight).toBeGreaterThanOrEqual(0);
        expect(criterion.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('criteria have unique ids within each category', () => {
    for (const { category } of ALL_CATEGORIES) {
      const ids = category.criteria.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('criteria have valid types', () => {
    const validTypes = new Set(Object.values(CriterionType));
    for (const { category } of ALL_CATEGORIES) {
      for (const criterion of category.criteria) {
        expect(validTypes.has(criterion.type)).toBe(true);
      }
    }
  });

  it('criteria have non-empty name and description', () => {
    for (const { category } of ALL_CATEGORIES) {
      for (const criterion of category.criteria) {
        expect(criterion.name.length).toBeGreaterThan(0);
        expect(criterion.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('criteria have non-empty ids', () => {
    for (const { category } of ALL_CATEGORIES) {
      for (const criterion of category.criteria) {
        expect(criterion.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('example test cases have valid expected outcomes', () => {
    const validOutcomes = new Set(Object.values(ExpectedOutcome));
    for (const { category } of ALL_CATEGORIES) {
      for (const tc of category.exampleTestCases) {
        expect(validOutcomes.has(tc.expectedOutcome)).toBe(true);
      }
    }
  });

  it('example test cases have valid risk levels', () => {
    const validLevels = new Set(Object.values(RiskLevel));
    for (const { category } of ALL_CATEGORIES) {
      for (const tc of category.exampleTestCases) {
        expect(validLevels.has(tc.riskLevel)).toBe(true);
      }
    }
  });

  it('example test cases have unique ids within each category', () => {
    for (const { category } of ALL_CATEGORIES) {
      const ids = category.exampleTestCases.map((tc) => tc.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('example test cases have non-empty tags', () => {
    for (const { category } of ALL_CATEGORIES) {
      for (const tc of category.exampleTestCases) {
        expect(tc.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it('example test cases have non-empty input, name, description', () => {
    for (const { category } of ALL_CATEGORIES) {
      for (const tc of category.exampleTestCases) {
        expect(tc.input.length).toBeGreaterThan(0);
        expect(tc.name.length).toBeGreaterThan(0);
        expect(tc.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('have non-empty failure modes', () => {
    for (const { category } of ALL_CATEGORIES) {
      expect(category.failureModes.length).toBeGreaterThan(0);
      for (const mode of category.failureModes) {
        expect(mode.length).toBeGreaterThan(0);
      }
    }
  });

  it('have non-empty mitigation strategies', () => {
    for (const { category } of ALL_CATEGORIES) {
      expect(category.mitigationStrategies.length).toBeGreaterThan(0);
      for (const strategy of category.mitigationStrategies) {
        expect(strategy.length).toBeGreaterThan(0);
      }
    }
  });

  it('pass Zod schema validation', () => {
    for (const { category } of ALL_CATEGORIES) {
      const result = SafetyCategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    }
  });

  it('have no parentId (all are top-level)', () => {
    for (const { category } of ALL_CATEGORIES) {
      expect(category.parentId).toBeUndefined();
    }
  });
});

// ============================================================================
// Cross-category uniqueness (across all Part 2 categories)
// ============================================================================

describe('cross-category uniqueness', () => {
  it('all criterion ids are unique across Part 2 categories', () => {
    const allCriterionIds: string[] = [];
    for (const { category } of ALL_CATEGORIES) {
      for (const c of category.criteria) {
        allCriterionIds.push(c.id);
      }
    }
    expect(new Set(allCriterionIds).size).toBe(allCriterionIds.length);
  });

  it('all test case ids are unique across Part 2 categories', () => {
    const allTestCaseIds: string[] = [];
    for (const { category } of ALL_CATEGORIES) {
      for (const tc of category.exampleTestCases) {
        allTestCaseIds.push(tc.id);
      }
    }
    expect(new Set(allTestCaseIds).size).toBe(allTestCaseIds.length);
  });
});

// ============================================================================
// Re-export barrel verification
// ============================================================================

describe('safety-category-definitions-2 re-exports', () => {
  it('exports exactly 5 categories', () => {
    expect(ALL_CATEGORIES).toHaveLength(5);
  });

  it('exports all expected category ids', () => {
    const ids = ALL_CATEGORIES.map((c) => c.category.id);
    expect(ids).toContain(SafetyCategoryId.PRIVACY);
    expect(ids).toContain(SafetyCategoryId.MANIPULATION);
    expect(ids).toContain(SafetyCategoryId.INSTRUCTION_SAFETY);
    expect(ids).toContain(SafetyCategoryId.ROBUSTNESS);
    expect(ids).toContain(SafetyCategoryId.RISK_AWARENESS);
  });
});
