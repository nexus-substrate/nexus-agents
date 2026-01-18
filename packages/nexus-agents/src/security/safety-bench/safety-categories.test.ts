/**
 * nexus-agents/security/safety-bench - Safety Categories Tests
 *
 * Comprehensive tests for Agent-SafetyBench category taxonomy,
 * including enums, schemas, category definitions, and utility functions.
 *
 * @module security/safety-bench/safety-categories.test
 * (Source: Issue #332, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  // Enums
  RiskLevel,
  SafetyCategoryId,
  CriterionType,
  ExpectedOutcome,
  // Schemas
  RiskLevelSchema,
  SafetyCategoryIdSchema,
  CriterionTypeSchema,
  ExpectedOutcomeSchema,
  SafetyCategorySchema,
  SafetyTestCaseSchema,
  EvaluationCriterionSchema,
  // Category definitions
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
  PRIVACY_CATEGORY,
  MANIPULATION_CATEGORY,
  INSTRUCTION_SAFETY_CATEGORY,
  ROBUSTNESS_CATEGORY,
  RISK_AWARENESS_CATEGORY,
  // Registry and lookup
  SAFETY_CATEGORIES,
  SAFETY_CATEGORY_MAP,
  getSafetyCategory,
  getCategoriesByMinRiskLevel,
  getAllTestCases,
  getTestCasesByTags,
  // Validation utilities
  validateSafetyCategory,
  validateTestCase,
  validateEvaluationCriterion,
  // Summary
  getSafetyTaxonomySummary,
  // Types
  type RiskLevelType,
  type SafetyCategoryIdType,
  type CriterionTypeType,
  type ExpectedOutcomeType,
  type SafetyCategory,
  type SafetyTestCase,
  type EvaluationCriterion,
} from './safety-categories.js';

// ============================================================================
// Enum Tests
// ============================================================================

describe('Safety Enums', () => {
  describe('RiskLevel', () => {
    it('should have all expected risk levels', () => {
      expect(RiskLevel.LOW).toBe('low');
      expect(RiskLevel.MEDIUM).toBe('medium');
      expect(RiskLevel.HIGH).toBe('high');
      expect(RiskLevel.CRITICAL).toBe('critical');
    });

    it('should have exactly 4 risk levels', () => {
      expect(Object.keys(RiskLevel)).toHaveLength(4);
    });
  });

  describe('SafetyCategoryId', () => {
    it('should have all expected category IDs', () => {
      expect(SafetyCategoryId.HARM_PHYSICAL).toBe('harm_physical');
      expect(SafetyCategoryId.HARM_EMOTIONAL).toBe('harm_emotional');
      expect(SafetyCategoryId.HARM_FINANCIAL).toBe('harm_financial');
      expect(SafetyCategoryId.DECEPTION).toBe('deception');
      expect(SafetyCategoryId.BIAS).toBe('bias');
      expect(SafetyCategoryId.PRIVACY).toBe('privacy');
      expect(SafetyCategoryId.MANIPULATION).toBe('manipulation');
      expect(SafetyCategoryId.INSTRUCTION_SAFETY).toBe('instruction_safety');
      expect(SafetyCategoryId.ROBUSTNESS).toBe('robustness');
      expect(SafetyCategoryId.RISK_AWARENESS).toBe('risk_awareness');
    });

    it('should have exactly 10 category IDs', () => {
      expect(Object.keys(SafetyCategoryId)).toHaveLength(10);
    });
  });

  describe('CriterionType', () => {
    it('should have all expected criterion types', () => {
      expect(CriterionType.BINARY).toBe('binary');
      expect(CriterionType.SCALED).toBe('scaled');
      expect(CriterionType.THRESHOLD).toBe('threshold');
      expect(CriterionType.CATEGORICAL).toBe('categorical');
    });

    it('should have exactly 4 criterion types', () => {
      expect(Object.keys(CriterionType)).toHaveLength(4);
    });
  });

  describe('ExpectedOutcome', () => {
    it('should have all expected outcomes', () => {
      expect(ExpectedOutcome.REFUSE).toBe('refuse');
      expect(ExpectedOutcome.CAUTION).toBe('caution');
      expect(ExpectedOutcome.CLARIFY).toBe('clarify');
      expect(ExpectedOutcome.ESCALATE).toBe('escalate');
      expect(ExpectedOutcome.PROCEED).toBe('proceed');
      expect(ExpectedOutcome.DETECT).toBe('detect');
    });

    it('should have exactly 6 expected outcomes', () => {
      expect(Object.keys(ExpectedOutcome)).toHaveLength(6);
    });
  });
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('Safety Schemas', () => {
  describe('RiskLevelSchema', () => {
    it('should accept valid risk levels', () => {
      const validLevels: RiskLevelType[] = ['low', 'medium', 'high', 'critical'];

      for (const level of validLevels) {
        expect(RiskLevelSchema.safeParse(level).success).toBe(true);
      }
    });

    it('should reject invalid risk levels', () => {
      expect(RiskLevelSchema.safeParse('severe').success).toBe(false);
      expect(RiskLevelSchema.safeParse('extreme').success).toBe(false);
      expect(RiskLevelSchema.safeParse('').success).toBe(false);
      expect(RiskLevelSchema.safeParse(1).success).toBe(false);
    });
  });

  describe('SafetyCategoryIdSchema', () => {
    it('should accept valid category IDs', () => {
      const validIds: SafetyCategoryIdType[] = [
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
      ];

      for (const id of validIds) {
        expect(SafetyCategoryIdSchema.safeParse(id).success).toBe(true);
      }
    });

    it('should reject invalid category IDs', () => {
      expect(SafetyCategoryIdSchema.safeParse('harm').success).toBe(false);
      expect(SafetyCategoryIdSchema.safeParse('safety').success).toBe(false);
    });
  });

  describe('CriterionTypeSchema', () => {
    it('should accept valid criterion types', () => {
      const validTypes: CriterionTypeType[] = ['binary', 'scaled', 'threshold', 'categorical'];

      for (const type of validTypes) {
        expect(CriterionTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('should reject invalid criterion types', () => {
      expect(CriterionTypeSchema.safeParse('numeric').success).toBe(false);
      expect(CriterionTypeSchema.safeParse('boolean').success).toBe(false);
    });
  });

  describe('ExpectedOutcomeSchema', () => {
    it('should accept valid expected outcomes', () => {
      const validOutcomes: ExpectedOutcomeType[] = [
        'refuse',
        'caution',
        'clarify',
        'escalate',
        'proceed',
        'detect',
      ];

      for (const outcome of validOutcomes) {
        expect(ExpectedOutcomeSchema.safeParse(outcome).success).toBe(true);
      }
    });

    it('should reject invalid expected outcomes', () => {
      expect(ExpectedOutcomeSchema.safeParse('allow').success).toBe(false);
      expect(ExpectedOutcomeSchema.safeParse('deny').success).toBe(false);
    });
  });

  describe('EvaluationCriterionSchema', () => {
    it('should accept valid evaluation criterion', () => {
      const criterion: EvaluationCriterion = {
        id: 'test_criterion',
        name: 'Test Criterion',
        description: 'A test evaluation criterion',
        type: 'binary',
        weight: 0.5,
      };

      const result = EvaluationCriterionSchema.safeParse(criterion);
      expect(result.success).toBe(true);
    });

    it('should accept criterion with optional fields', () => {
      const criterion: EvaluationCriterion = {
        id: 'threshold_criterion',
        name: 'Threshold Criterion',
        description: 'A threshold-based criterion',
        type: 'threshold',
        weight: 0.3,
        passThreshold: 0.7,
      };

      const result = EvaluationCriterionSchema.safeParse(criterion);
      expect(result.success).toBe(true);
    });

    it('should accept criterion with categories', () => {
      const criterion = {
        id: 'categorical_criterion',
        name: 'Categorical Criterion',
        description: 'A categorical criterion',
        type: 'categorical',
        weight: 0.4,
        categories: ['low', 'medium', 'high'],
      };

      const result = EvaluationCriterionSchema.safeParse(criterion);
      expect(result.success).toBe(true);
    });

    it('should reject criterion with empty id', () => {
      const criterion = {
        id: '',
        name: 'Test',
        description: 'Test',
        type: 'binary',
        weight: 0.5,
      };

      const result = EvaluationCriterionSchema.safeParse(criterion);
      expect(result.success).toBe(false);
    });

    it('should reject weight outside 0-1 range', () => {
      const criterion = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        type: 'binary',
        weight: 1.5,
      };

      const result = EvaluationCriterionSchema.safeParse(criterion);
      expect(result.success).toBe(false);
    });
  });

  describe('SafetyTestCaseSchema', () => {
    it('should accept valid test case', () => {
      const testCase: SafetyTestCase = {
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

    it('should accept test case with context', () => {
      const testCase: SafetyTestCase = {
        id: 'tc_002',
        name: 'Test Case 2',
        description: 'A test case with context',
        input: 'Test input',
        expectedOutcome: 'proceed',
        riskLevel: 'low',
        tags: ['test'],
        context: 'Additional context for the test',
      };

      const result = SafetyTestCaseSchema.safeParse(testCase);
      expect(result.success).toBe(true);
    });

    it('should accept test case with empty tags', () => {
      const testCase = {
        id: 'tc_003',
        name: 'Test Case 3',
        description: 'A test case without tags',
        input: 'Test input',
        expectedOutcome: 'caution',
        riskLevel: 'medium',
        tags: [],
      };

      const result = SafetyTestCaseSchema.safeParse(testCase);
      expect(result.success).toBe(true);
    });

    it('should reject test case with invalid outcome', () => {
      const testCase = {
        id: 'tc_004',
        name: 'Test',
        description: 'Test',
        input: 'Test',
        expectedOutcome: 'invalid',
        riskLevel: 'low',
        tags: [],
      };

      const result = SafetyTestCaseSchema.safeParse(testCase);
      expect(result.success).toBe(false);
    });
  });

  describe('SafetyCategorySchema', () => {
    it('should accept valid safety category', () => {
      const category: SafetyCategory = {
        id: 'harm_physical',
        name: 'Physical Harm',
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

    it('should accept category with parent ID', () => {
      const category = {
        id: 'harm_physical',
        name: 'Physical Harm',
        description: 'Sub-category',
        defaultRiskLevel: 'high',
        parentId: 'harm_emotional',
        criteria: [],
        exampleTestCases: [],
        failureModes: [],
        mitigationStrategies: [],
      };

      const result = SafetyCategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Category Definition Tests
// ============================================================================

describe('Category Definitions', () => {
  const allCategories = [
    { name: 'HARM_PHYSICAL_CATEGORY', category: HARM_PHYSICAL_CATEGORY },
    { name: 'HARM_EMOTIONAL_CATEGORY', category: HARM_EMOTIONAL_CATEGORY },
    { name: 'HARM_FINANCIAL_CATEGORY', category: HARM_FINANCIAL_CATEGORY },
    { name: 'DECEPTION_CATEGORY', category: DECEPTION_CATEGORY },
    { name: 'BIAS_CATEGORY', category: BIAS_CATEGORY },
    { name: 'PRIVACY_CATEGORY', category: PRIVACY_CATEGORY },
    { name: 'MANIPULATION_CATEGORY', category: MANIPULATION_CATEGORY },
    { name: 'INSTRUCTION_SAFETY_CATEGORY', category: INSTRUCTION_SAFETY_CATEGORY },
    { name: 'ROBUSTNESS_CATEGORY', category: ROBUSTNESS_CATEGORY },
    { name: 'RISK_AWARENESS_CATEGORY', category: RISK_AWARENESS_CATEGORY },
  ];

  describe.each(allCategories)('$name', ({ category }) => {
    it('should be valid according to schema', () => {
      const result = validateSafetyCategory(category);
      expect(result.success).toBe(true);
    });

    it('should have a non-empty id', () => {
      expect(category.id).toBeTruthy();
      expect(category.id.length).toBeGreaterThan(0);
    });

    it('should have a non-empty name', () => {
      expect(category.name).toBeTruthy();
      expect(category.name.length).toBeGreaterThan(0);
    });

    it('should have a description', () => {
      expect(category.description).toBeTruthy();
      expect(category.description.length).toBeGreaterThan(10);
    });

    it('should have a valid default risk level', () => {
      expect(['low', 'medium', 'high', 'critical']).toContain(category.defaultRiskLevel);
    });

    it('should have at least one criterion', () => {
      expect(category.criteria.length).toBeGreaterThan(0);
    });

    it('should have criteria weights that sum to approximately 1', () => {
      const totalWeight = category.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 1);
    });

    it('should have at least one example test case', () => {
      expect(category.exampleTestCases.length).toBeGreaterThan(0);
    });

    it('should have at least one failure mode', () => {
      expect(category.failureModes.length).toBeGreaterThan(0);
    });

    it('should have at least one mitigation strategy', () => {
      expect(category.mitigationStrategies.length).toBeGreaterThan(0);
    });

    it('should have all test cases valid', () => {
      for (const testCase of category.exampleTestCases) {
        const result = validateTestCase(testCase);
        expect(result.success).toBe(true);
      }
    });

    it('should have all criteria valid', () => {
      for (const criterion of category.criteria) {
        const result = validateEvaluationCriterion(criterion);
        expect(result.success).toBe(true);
      }
    });

    it('should have unique criterion IDs within category', () => {
      const ids = category.criteria.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique test case IDs within category', () => {
      const ids = category.exampleTestCases.map((tc) => tc.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('HARM_PHYSICAL_CATEGORY specifics', () => {
    it('should have critical default risk level', () => {
      expect(HARM_PHYSICAL_CATEGORY.defaultRiskLevel).toBe('critical');
    });

    it('should have id harm_physical', () => {
      expect(HARM_PHYSICAL_CATEGORY.id).toBe('harm_physical');
    });
  });

  describe('DECEPTION_CATEGORY specifics', () => {
    it('should include prompt injection criterion', () => {
      const hasPromptInjection = DECEPTION_CATEGORY.criteria.some((c) =>
        c.id.includes('prompt_injection')
      );
      expect(hasPromptInjection).toBe(true);
    });

    it('should have high default risk level', () => {
      expect(DECEPTION_CATEGORY.defaultRiskLevel).toBe('high');
    });
  });
});

// ============================================================================
// Registry and Lookup Tests
// ============================================================================

describe('Category Registry', () => {
  describe('SAFETY_CATEGORIES', () => {
    it('should contain exactly 10 categories', () => {
      expect(SAFETY_CATEGORIES).toHaveLength(10);
    });

    it('should contain all expected category IDs', () => {
      const categoryIds = SAFETY_CATEGORIES.map((c) => c.id);

      expect(categoryIds).toContain('harm_physical');
      expect(categoryIds).toContain('harm_emotional');
      expect(categoryIds).toContain('harm_financial');
      expect(categoryIds).toContain('deception');
      expect(categoryIds).toContain('bias');
      expect(categoryIds).toContain('privacy');
      expect(categoryIds).toContain('manipulation');
      expect(categoryIds).toContain('instruction_safety');
      expect(categoryIds).toContain('robustness');
      expect(categoryIds).toContain('risk_awareness');
    });

    it('should have no duplicate category IDs', () => {
      const ids = SAFETY_CATEGORIES.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('SAFETY_CATEGORY_MAP', () => {
    it('should be a Map with 10 entries', () => {
      expect(SAFETY_CATEGORY_MAP.size).toBe(10);
    });

    it('should allow lookup by category ID', () => {
      const category = SAFETY_CATEGORY_MAP.get('harm_physical');
      expect(category).toBeDefined();
      expect(category?.name).toBe('Physical Harm Prevention');
    });

    it('should return undefined for non-existent ID', () => {
      const category = SAFETY_CATEGORY_MAP.get('nonexistent' as SafetyCategoryIdType);
      expect(category).toBeUndefined();
    });
  });

  describe('getSafetyCategory', () => {
    it('should return category for valid ID', () => {
      const category = getSafetyCategory('harm_physical');
      expect(category).toBeDefined();
      expect(category?.id).toBe('harm_physical');
    });

    it('should return undefined for invalid ID', () => {
      const category = getSafetyCategory('invalid' as SafetyCategoryIdType);
      expect(category).toBeUndefined();
    });

    it('should return different categories for different IDs', () => {
      const physical = getSafetyCategory('harm_physical');
      const emotional = getSafetyCategory('harm_emotional');

      expect(physical?.id).not.toBe(emotional?.id);
      expect(physical?.name).not.toBe(emotional?.name);
    });
  });

  describe('getCategoriesByMinRiskLevel', () => {
    it('should return all categories for low risk level', () => {
      const categories = getCategoriesByMinRiskLevel('low');
      expect(categories.length).toBe(SAFETY_CATEGORIES.length);
    });

    it('should return fewer categories for higher risk levels', () => {
      const lowCategories = getCategoriesByMinRiskLevel('low');
      const mediumCategories = getCategoriesByMinRiskLevel('medium');
      const highCategories = getCategoriesByMinRiskLevel('high');
      const criticalCategories = getCategoriesByMinRiskLevel('critical');

      expect(lowCategories.length).toBeGreaterThanOrEqual(mediumCategories.length);
      expect(mediumCategories.length).toBeGreaterThanOrEqual(highCategories.length);
      expect(highCategories.length).toBeGreaterThanOrEqual(criticalCategories.length);
    });

    it('should return only critical categories for critical risk level', () => {
      const categories = getCategoriesByMinRiskLevel('critical');

      for (const category of categories) {
        expect(category.defaultRiskLevel).toBe('critical');
      }
    });

    it('should include HARM_PHYSICAL in critical categories', () => {
      const categories = getCategoriesByMinRiskLevel('critical');
      const hasHarmPhysical = categories.some((c) => c.id === 'harm_physical');
      expect(hasHarmPhysical).toBe(true);
    });
  });
});

// ============================================================================
// Test Case Lookup Tests
// ============================================================================

describe('Test Case Lookup', () => {
  describe('getAllTestCases', () => {
    it('should return all test cases from all categories', () => {
      const testCases = getAllTestCases();

      expect(testCases.length).toBeGreaterThan(0);

      // Count expected test cases
      const expectedCount = SAFETY_CATEGORIES.reduce(
        (sum, cat) => sum + cat.exampleTestCases.length,
        0
      );
      expect(testCases.length).toBe(expectedCount);
    });

    it('should include categoryId in each test case', () => {
      const testCases = getAllTestCases();

      for (const testCase of testCases) {
        expect(testCase.categoryId).toBeDefined();
        expect(SafetyCategoryIdSchema.safeParse(testCase.categoryId).success).toBe(true);
      }
    });

    it('should have unique test case IDs across all categories', () => {
      const testCases = getAllTestCases();
      const ids = testCases.map((tc) => tc.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getTestCasesByTags', () => {
    it('should return test cases matching a single tag', () => {
      const testCases = getTestCasesByTags(['weapons']);

      expect(testCases.length).toBeGreaterThan(0);
      for (const testCase of testCases) {
        expect(testCase.tags).toContain('weapons');
      }
    });

    it('should return test cases matching any of multiple tags', () => {
      const testCases = getTestCasesByTags(['weapons', 'phishing']);

      expect(testCases.length).toBeGreaterThan(0);
      for (const testCase of testCases) {
        const hasMatchingTag = testCase.tags.some((t) => ['weapons', 'phishing'].includes(t));
        expect(hasMatchingTag).toBe(true);
      }
    });

    it('should return empty array for non-existent tags', () => {
      const testCases = getTestCasesByTags(['nonexistent_tag_12345']);
      expect(testCases).toHaveLength(0);
    });

    it('should return empty array for empty tags array', () => {
      const testCases = getTestCasesByTags([]);
      expect(testCases).toHaveLength(0);
    });

    it('should include categoryId in filtered test cases', () => {
      const testCases = getTestCasesByTags(['critical']);

      for (const testCase of testCases) {
        expect(testCase.categoryId).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Validation Utility Tests
// ============================================================================

describe('Validation Utilities', () => {
  describe('validateSafetyCategory', () => {
    it('should return success for valid category', () => {
      const result = validateSafetyCategory(HARM_PHYSICAL_CATEGORY);
      expect(result.success).toBe(true);
    });

    it('should return failure for invalid category', () => {
      const invalidCategory = {
        id: 'invalid',
        name: 'Invalid',
        description: 'Invalid category',
        defaultRiskLevel: 'extreme',
      };

      const result = validateSafetyCategory(invalidCategory);
      expect(result.success).toBe(false);
    });

    it('should return failure for missing required fields', () => {
      const result = validateSafetyCategory({
        id: 'harm_physical',
        name: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateTestCase', () => {
    it('should return success for valid test case', () => {
      const testCase = HARM_PHYSICAL_CATEGORY.exampleTestCases[0];
      const result = validateTestCase(testCase);
      expect(result.success).toBe(true);
    });

    it('should return failure for invalid test case', () => {
      const invalidTestCase = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        input: 'Test',
        expectedOutcome: 'invalid_outcome',
        riskLevel: 'extreme',
        tags: [],
      };

      const result = validateTestCase(invalidTestCase);
      expect(result.success).toBe(false);
    });
  });

  describe('validateEvaluationCriterion', () => {
    it('should return success for valid criterion', () => {
      const criterion = HARM_PHYSICAL_CATEGORY.criteria[0];
      const result = validateEvaluationCriterion(criterion);
      expect(result.success).toBe(true);
    });

    it('should return failure for invalid criterion', () => {
      const invalidCriterion = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        type: 'invalid_type',
        weight: 2.0,
      };

      const result = validateEvaluationCriterion(invalidCriterion);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Summary Statistics Tests
// ============================================================================

describe('Summary Statistics', () => {
  describe('getSafetyTaxonomySummary', () => {
    it('should return correct total categories', () => {
      const summary = getSafetyTaxonomySummary();
      expect(summary.totalCategories).toBe(10);
    });

    it('should return correct total criteria', () => {
      const summary = getSafetyTaxonomySummary();

      const expectedCriteria = SAFETY_CATEGORIES.reduce((sum, cat) => sum + cat.criteria.length, 0);
      expect(summary.totalCriteria).toBe(expectedCriteria);
    });

    it('should return correct total test cases', () => {
      const summary = getSafetyTaxonomySummary();

      const expectedTestCases = SAFETY_CATEGORIES.reduce(
        (sum, cat) => sum + cat.exampleTestCases.length,
        0
      );
      expect(summary.totalTestCases).toBe(expectedTestCases);
    });

    it('should have categories by risk level summing to total', () => {
      const summary = getSafetyTaxonomySummary();

      const sumByRiskLevel =
        summary.categoriesByRiskLevel.low +
        summary.categoriesByRiskLevel.medium +
        summary.categoriesByRiskLevel.high +
        summary.categoriesByRiskLevel.critical;

      expect(sumByRiskLevel).toBe(summary.totalCategories);
    });

    it('should have test cases by outcome summing to total', () => {
      const summary = getSafetyTaxonomySummary();

      const sumByOutcome =
        summary.testCasesByOutcome.refuse +
        summary.testCasesByOutcome.caution +
        summary.testCasesByOutcome.clarify +
        summary.testCasesByOutcome.escalate +
        summary.testCasesByOutcome.proceed +
        summary.testCasesByOutcome.detect;

      expect(sumByOutcome).toBe(summary.totalTestCases);
    });

    it('should have non-negative values for all fields', () => {
      const summary = getSafetyTaxonomySummary();

      expect(summary.totalCategories).toBeGreaterThanOrEqual(0);
      expect(summary.totalCriteria).toBeGreaterThanOrEqual(0);
      expect(summary.totalTestCases).toBeGreaterThanOrEqual(0);

      for (const level of ['low', 'medium', 'high', 'critical'] as const) {
        expect(summary.categoriesByRiskLevel[level]).toBeGreaterThanOrEqual(0);
      }

      for (const outcome of [
        'refuse',
        'caution',
        'clarify',
        'escalate',
        'proceed',
        'detect',
      ] as const) {
        expect(summary.testCasesByOutcome[outcome]).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have at least one category at critical risk level', () => {
      const summary = getSafetyTaxonomySummary();
      expect(summary.categoriesByRiskLevel.critical).toBeGreaterThan(0);
    });

    it('should have at least one refuse outcome test case', () => {
      const summary = getSafetyTaxonomySummary();
      expect(summary.testCasesByOutcome.refuse).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle category with minimum valid content', () => {
    const minimalCategory = {
      id: 'harm_physical',
      name: 'Test',
      description: 'Test description',
      defaultRiskLevel: 'low',
      criteria: [],
      exampleTestCases: [],
      failureModes: [],
      mitigationStrategies: [],
    };

    const result = validateSafetyCategory(minimalCategory);
    expect(result.success).toBe(true);
  });

  it('should handle test case with very long input', () => {
    const longInputTestCase = {
      id: 'long_test',
      name: 'Long Input Test',
      description: 'Test with long input',
      input: 'x'.repeat(10000),
      expectedOutcome: 'refuse',
      riskLevel: 'low',
      tags: ['test'],
    };

    const result = validateTestCase(longInputTestCase);
    expect(result.success).toBe(true);
  });

  it('should handle test case with many tags', () => {
    const manyTagsTestCase = {
      id: 'tags_test',
      name: 'Many Tags Test',
      description: 'Test with many tags',
      input: 'Test input',
      expectedOutcome: 'proceed',
      riskLevel: 'low',
      tags: Array.from({ length: 100 }, (_, i) => `tag_${String(i)}`),
    };

    const result = validateTestCase(manyTagsTestCase);
    expect(result.success).toBe(true);
  });

  it('should handle criterion with all optional fields', () => {
    const fullCriterion = {
      id: 'full_criterion',
      name: 'Full Criterion',
      description: 'A criterion with all fields',
      type: 'threshold',
      weight: 0.5,
      passThreshold: 0.8,
      categories: ['low', 'medium', 'high'],
    };

    const result = validateEvaluationCriterion(fullCriterion);
    expect(result.success).toBe(true);
  });

  it('should maintain consistency between registry and map', () => {
    for (const category of SAFETY_CATEGORIES) {
      const mapCategory = SAFETY_CATEGORY_MAP.get(category.id);
      expect(mapCategory).toBe(category);
    }
  });

  it('should ensure all test cases have valid risk levels', () => {
    const testCases = getAllTestCases();

    for (const testCase of testCases) {
      expect(['low', 'medium', 'high', 'critical']).toContain(testCase.riskLevel);
    }
  });

  it('should ensure all test cases have valid expected outcomes', () => {
    const testCases = getAllTestCases();

    for (const testCase of testCases) {
      expect(['refuse', 'caution', 'clarify', 'escalate', 'proceed', 'detect']).toContain(
        testCase.expectedOutcome
      );
    }
  });
});
