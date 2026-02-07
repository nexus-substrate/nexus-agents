/**
 * nexus-agents/security/safety-bench - Safety Schemas Tests
 *
 * Tests for Zod validation schemas exported from safety-schemas.ts,
 * covering enum schemas, object schemas, and edge cases.
 *
 * @module security/safety-bench/safety-schemas.test
 * (Source: Issue #332, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  RiskLevelSchema,
  SafetyCategoryIdSchema,
  CriterionTypeSchema,
  ExpectedOutcomeSchema,
  EvaluationCriterionSchema,
  SafetyTestCaseSchema,
  SafetyCategorySchema,
} from './safety-schemas.js';

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe('RiskLevelSchema', () => {
  it('should accept valid values', () => {
    const validLevels = ['low', 'medium', 'high', 'critical'] as const;

    for (const level of validLevels) {
      expect(RiskLevelSchema.safeParse(level).success).toBe(true);
    }
  });

  it('should reject invalid values', () => {
    expect(RiskLevelSchema.safeParse('severe').success).toBe(false);
    expect(RiskLevelSchema.safeParse('extreme').success).toBe(false);
    expect(RiskLevelSchema.safeParse('').success).toBe(false);
    expect(RiskLevelSchema.safeParse(1).success).toBe(false);
    expect(RiskLevelSchema.safeParse(null).success).toBe(false);
  });
});

describe('SafetyCategoryIdSchema', () => {
  it('should accept all 10 valid category IDs', () => {
    const validIds = [
      'harm_physical',
      'harm_emotional',
      'harm_financial',
      'deception',
      'bias',
      'privacy',
      'manipulation',
      'instruction_safety',
      'robustness',
      'risk_awareness',
    ] as const;

    for (const id of validIds) {
      expect(SafetyCategoryIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('should reject invalid category', () => {
    expect(SafetyCategoryIdSchema.safeParse('harm').success).toBe(false);
    expect(SafetyCategoryIdSchema.safeParse('safety').success).toBe(false);
    expect(SafetyCategoryIdSchema.safeParse('unknown_category').success).toBe(false);
  });
});

describe('CriterionTypeSchema', () => {
  it('should accept valid types', () => {
    const validTypes = ['binary', 'scaled', 'threshold', 'categorical'] as const;

    for (const type of validTypes) {
      expect(CriterionTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('should reject invalid type', () => {
    expect(CriterionTypeSchema.safeParse('numeric').success).toBe(false);
    expect(CriterionTypeSchema.safeParse('boolean').success).toBe(false);
    expect(CriterionTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('ExpectedOutcomeSchema', () => {
  it('should accept all 6 outcomes', () => {
    const validOutcomes = [
      'refuse',
      'caution',
      'clarify',
      'escalate',
      'proceed',
      'detect',
    ] as const;

    for (const outcome of validOutcomes) {
      expect(ExpectedOutcomeSchema.safeParse(outcome).success).toBe(true);
    }
  });

  it('should reject invalid outcome', () => {
    expect(ExpectedOutcomeSchema.safeParse('allow').success).toBe(false);
    expect(ExpectedOutcomeSchema.safeParse('deny').success).toBe(false);
    expect(ExpectedOutcomeSchema.safeParse('block').success).toBe(false);
  });
});

// ============================================================================
// Object Schema Tests
// ============================================================================

describe('EvaluationCriterionSchema', () => {
  it('should accept valid criterion', () => {
    const criterion = {
      id: 'test_criterion',
      name: 'Test Criterion',
      description: 'A test evaluation criterion',
      type: 'binary',
      weight: 0.5,
    };

    const result = EvaluationCriterionSchema.safeParse(criterion);
    expect(result.success).toBe(true);
  });

  it('should reject missing id (empty string)', () => {
    const criterion = {
      id: '',
      name: 'Test',
      description: 'Test description',
      type: 'binary',
      weight: 0.5,
    };

    const result = EvaluationCriterionSchema.safeParse(criterion);
    expect(result.success).toBe(false);
  });

  it('should reject weight out of range', () => {
    const criterionOver = {
      id: 'test',
      name: 'Test',
      description: 'Test description',
      type: 'binary',
      weight: 1.5,
    };

    const resultOver = EvaluationCriterionSchema.safeParse(criterionOver);
    expect(resultOver.success).toBe(false);

    const criterionUnder = {
      id: 'test',
      name: 'Test',
      description: 'Test description',
      type: 'binary',
      weight: -0.1,
    };

    const resultUnder = EvaluationCriterionSchema.safeParse(criterionUnder);
    expect(resultUnder.success).toBe(false);
  });

  it('should accept optional fields (passThreshold, categories)', () => {
    const criterionWithThreshold = {
      id: 'threshold_criterion',
      name: 'Threshold Criterion',
      description: 'A threshold-based criterion',
      type: 'threshold',
      weight: 0.3,
      passThreshold: 0.7,
    };

    expect(EvaluationCriterionSchema.safeParse(criterionWithThreshold).success).toBe(true);

    const criterionWithCategories = {
      id: 'categorical_criterion',
      name: 'Categorical Criterion',
      description: 'A categorical criterion',
      type: 'categorical',
      weight: 0.4,
      categories: ['low', 'medium', 'high'],
    };

    expect(EvaluationCriterionSchema.safeParse(criterionWithCategories).success).toBe(true);

    const criterionWithBoth = {
      id: 'full_criterion',
      name: 'Full Criterion',
      description: 'Has all optional fields',
      type: 'threshold',
      weight: 0.5,
      passThreshold: 0.8,
      categories: ['a', 'b'],
    };

    expect(EvaluationCriterionSchema.safeParse(criterionWithBoth).success).toBe(true);
  });
});

describe('SafetyTestCaseSchema', () => {
  it('should accept valid test case', () => {
    const testCase = {
      id: 'tc_001',
      name: 'Test Case 1',
      description: 'A test case for safety evaluation',
      input: 'Test input prompt',
      expectedOutcome: 'refuse',
      riskLevel: 'high',
      tags: ['test', 'safety'],
    };

    const result = SafetyTestCaseSchema.safeParse(testCase);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const missingInput = {
      id: 'tc_missing',
      name: 'Missing Input',
      description: 'No input field',
      expectedOutcome: 'refuse',
      riskLevel: 'low',
      tags: [],
    };

    expect(SafetyTestCaseSchema.safeParse(missingInput).success).toBe(false);

    const missingTags = {
      id: 'tc_no_tags',
      name: 'No Tags',
      description: 'Missing tags field',
      input: 'Some input',
      expectedOutcome: 'proceed',
      riskLevel: 'low',
    };

    expect(SafetyTestCaseSchema.safeParse(missingTags).success).toBe(false);

    const emptyObject = {};

    expect(SafetyTestCaseSchema.safeParse(emptyObject).success).toBe(false);
  });

  it('should accept optional context', () => {
    const withContext = {
      id: 'tc_ctx',
      name: 'With Context',
      description: 'Test case with context',
      input: 'Test input',
      expectedOutcome: 'proceed',
      riskLevel: 'low',
      tags: ['context'],
      context: 'Additional context for the test',
    };

    expect(SafetyTestCaseSchema.safeParse(withContext).success).toBe(true);

    const withoutContext = {
      id: 'tc_no_ctx',
      name: 'Without Context',
      description: 'Test case without context',
      input: 'Test input',
      expectedOutcome: 'caution',
      riskLevel: 'medium',
      tags: [],
    };

    expect(SafetyTestCaseSchema.safeParse(withoutContext).success).toBe(true);
  });
});

describe('SafetyCategorySchema', () => {
  it('should accept valid category', () => {
    const category = {
      id: 'harm_physical',
      name: 'Physical Harm Prevention',
      description: 'Category for physical harm prevention',
      defaultRiskLevel: 'critical',
      criteria: [
        {
          id: 'crit_1',
          name: 'Criterion 1',
          description: 'First criterion',
          type: 'binary',
          weight: 1.0,
        },
      ],
      exampleTestCases: [
        {
          id: 'tc_1',
          name: 'Test 1',
          description: 'Test description',
          input: 'Test input',
          expectedOutcome: 'refuse',
          riskLevel: 'critical',
          tags: ['test'],
        },
      ],
      failureModes: ['Failure mode 1'],
      mitigationStrategies: ['Strategy 1'],
    };

    const result = SafetyCategorySchema.safeParse(category);
    expect(result.success).toBe(true);
  });

  it('should reject invalid category ID', () => {
    const category = {
      id: 'invalid_category',
      name: 'Invalid',
      description: 'Invalid category',
      defaultRiskLevel: 'low',
      criteria: [],
      exampleTestCases: [],
      failureModes: [],
      mitigationStrategies: [],
    };

    const result = SafetyCategorySchema.safeParse(category);
    expect(result.success).toBe(false);
  });

  it('should accept optional parentId', () => {
    const withParent = {
      id: 'harm_emotional',
      name: 'Emotional Harm',
      description: 'Subcategory',
      defaultRiskLevel: 'high',
      parentId: 'harm_physical',
      criteria: [],
      exampleTestCases: [],
      failureModes: [],
      mitigationStrategies: [],
    };

    expect(SafetyCategorySchema.safeParse(withParent).success).toBe(true);

    const withoutParent = {
      id: 'bias',
      name: 'Bias',
      description: 'Top-level category',
      defaultRiskLevel: 'medium',
      criteria: [],
      exampleTestCases: [],
      failureModes: [],
      mitigationStrategies: [],
    };

    expect(SafetyCategorySchema.safeParse(withoutParent).success).toBe(true);
  });
});
