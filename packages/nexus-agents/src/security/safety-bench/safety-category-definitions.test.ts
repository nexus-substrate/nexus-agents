/**
 * Tests for Safety Category Definitions
 * @module security/safety-bench/safety-category-definitions.test
 */

import { describe, it, expect } from 'vitest';
import { RiskLevel, SafetyCategoryId, CriterionType, ExpectedOutcome } from './safety-enums.js';
import { SafetyCategorySchema } from './safety-schemas.js';
import type { SafetyCategory } from './safety-schemas.js';
import {
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
} from './safety-category-definitions.js';

// ============================================================================
// Test Helpers
// ============================================================================

const ALL_CATEGORIES: readonly SafetyCategory[] = [
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
];

// ============================================================================
// Individual Category Identity
// ============================================================================

describe('HARM_PHYSICAL_CATEGORY', () => {
  it('has correct id', () => {
    expect(HARM_PHYSICAL_CATEGORY.id).toBe(SafetyCategoryId.HARM_PHYSICAL);
  });

  it('has correct name', () => {
    expect(HARM_PHYSICAL_CATEGORY.name).toBe('Physical Harm Prevention');
  });

  it('has critical default risk level', () => {
    expect(HARM_PHYSICAL_CATEGORY.defaultRiskLevel).toBe(RiskLevel.CRITICAL);
  });

  it('has 3 criteria', () => {
    expect(HARM_PHYSICAL_CATEGORY.criteria).toHaveLength(3);
  });

  it('has 3 example test cases', () => {
    expect(HARM_PHYSICAL_CATEGORY.exampleTestCases).toHaveLength(3);
  });
});

describe('HARM_EMOTIONAL_CATEGORY', () => {
  it('has correct id', () => {
    expect(HARM_EMOTIONAL_CATEGORY.id).toBe(SafetyCategoryId.HARM_EMOTIONAL);
  });

  it('has high default risk level', () => {
    expect(HARM_EMOTIONAL_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });
});

describe('HARM_FINANCIAL_CATEGORY', () => {
  it('has correct id', () => {
    expect(HARM_FINANCIAL_CATEGORY.id).toBe(SafetyCategoryId.HARM_FINANCIAL);
  });

  it('has high default risk level', () => {
    expect(HARM_FINANCIAL_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });
});

describe('DECEPTION_CATEGORY', () => {
  it('has correct id', () => {
    expect(DECEPTION_CATEGORY.id).toBe(SafetyCategoryId.DECEPTION);
  });

  it('has high default risk level', () => {
    expect(DECEPTION_CATEGORY.defaultRiskLevel).toBe(RiskLevel.HIGH);
  });
});

describe('BIAS_CATEGORY', () => {
  it('has correct id', () => {
    expect(BIAS_CATEGORY.id).toBe(SafetyCategoryId.BIAS);
  });

  it('has medium default risk level', () => {
    expect(BIAS_CATEGORY.defaultRiskLevel).toBe(RiskLevel.MEDIUM);
  });
});

// ============================================================================
// Structural Validation (all categories)
// ============================================================================

describe('all categories structural validation', () => {
  it('have unique ids', () => {
    const ids = ALL_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('have unique names', () => {
    const names = ALL_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('have non-empty descriptions', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(cat.description.length).toBeGreaterThan(0);
    }
  });

  it('criteria weights sum to 1.0 for each category', () => {
    for (const cat of ALL_CATEGORIES) {
      const weightSum = cat.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 10);
    }
  });

  it('criteria weights are in [0, 1]', () => {
    for (const cat of ALL_CATEGORIES) {
      for (const criterion of cat.criteria) {
        expect(criterion.weight).toBeGreaterThanOrEqual(0);
        expect(criterion.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('criteria have unique ids within category', () => {
    for (const cat of ALL_CATEGORIES) {
      const ids = cat.criteria.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('criteria have valid types', () => {
    const validTypes = new Set(Object.values(CriterionType));
    for (const cat of ALL_CATEGORIES) {
      for (const criterion of cat.criteria) {
        expect(validTypes.has(criterion.type)).toBe(true);
      }
    }
  });

  it('example test cases have valid expected outcomes', () => {
    const validOutcomes = new Set(Object.values(ExpectedOutcome));
    for (const cat of ALL_CATEGORIES) {
      for (const tc of cat.exampleTestCases) {
        expect(validOutcomes.has(tc.expectedOutcome)).toBe(true);
      }
    }
  });

  it('example test cases have valid risk levels', () => {
    const validLevels = new Set(Object.values(RiskLevel));
    for (const cat of ALL_CATEGORIES) {
      for (const tc of cat.exampleTestCases) {
        expect(validLevels.has(tc.riskLevel)).toBe(true);
      }
    }
  });

  it('example test cases have unique ids within category', () => {
    for (const cat of ALL_CATEGORIES) {
      const ids = cat.exampleTestCases.map((tc) => tc.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('example test cases have non-empty tags', () => {
    for (const cat of ALL_CATEGORIES) {
      for (const tc of cat.exampleTestCases) {
        expect(tc.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it('have non-empty failure modes', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(cat.failureModes.length).toBeGreaterThan(0);
    }
  });

  it('have non-empty mitigation strategies', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(cat.mitigationStrategies.length).toBeGreaterThan(0);
    }
  });

  it('pass Zod schema validation', () => {
    for (const cat of ALL_CATEGORIES) {
      const result = SafetyCategorySchema.safeParse(cat);
      expect(result.success).toBe(true);
    }
  });
});
