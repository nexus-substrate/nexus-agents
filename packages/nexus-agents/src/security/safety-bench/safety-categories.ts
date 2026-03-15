/**
 * nexus-agents/security/safety-bench - Safety Category Taxonomy
 *
 * Comprehensive safety category definitions for Agent-SafetyBench evaluation.
 * Based on standard agent safety frameworks and arXiv:2412.14470.
 *
 * @module security/safety-bench/safety-categories
 * (Source: Issue #332)
 */

import { z, type ZodSafeParseResult } from 'zod';
import {
  RiskLevel,
  ExpectedOutcome,
  type RiskLevelType,
  type SafetyCategoryIdType,
  type ExpectedOutcomeType,
} from './safety-enums.js';
import {
  SafetyCategorySchema,
  SafetyTestCaseSchema,
  EvaluationCriterionSchema,
  type SafetyCategory,
  type SafetyTestCase,
  type SafetyTaxonomySummary,
} from './safety-schemas.js';
import {
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
} from './safety-category-definitions.js';
import {
  PRIVACY_CATEGORY,
  MANIPULATION_CATEGORY,
  INSTRUCTION_SAFETY_CATEGORY,
  ROBUSTNESS_CATEGORY,
  RISK_AWARENESS_CATEGORY,
} from './safety-category-definitions-2.js';

// Re-export all types and enums
export * from './safety-enums.js';
export * from './safety-schemas.js';

// Re-export category definitions
export {
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
} from './safety-category-definitions.js';
export {
  PRIVACY_CATEGORY,
  MANIPULATION_CATEGORY,
  INSTRUCTION_SAFETY_CATEGORY,
  ROBUSTNESS_CATEGORY,
  RISK_AWARENESS_CATEGORY,
} from './safety-category-definitions-2.js';

// =============================================================================
// Category Registry
// =============================================================================

/**
 * Complete registry of all safety categories.
 */
export const SAFETY_CATEGORIES: readonly SafetyCategory[] = [
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
] as const;

/**
 * Map of category IDs to category definitions.
 */
export const SAFETY_CATEGORY_MAP: ReadonlyMap<SafetyCategoryIdType, SafetyCategory> = new Map(
  SAFETY_CATEGORIES.map((category) => [category.id, category])
);

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Get a safety category by ID.
 * @param id - Category identifier
 * @returns The category definition or undefined if not found
 */
export function getSafetyCategory(id: SafetyCategoryIdType): SafetyCategory | undefined {
  return SAFETY_CATEGORY_MAP.get(id);
}

/**
 * Get all categories at or above a given risk level.
 * @param minLevel - Minimum risk level to include
 * @returns Array of categories matching the risk level criteria
 */
export function getCategoriesByMinRiskLevel(minLevel: RiskLevelType): readonly SafetyCategory[] {
  const riskOrder: Record<RiskLevelType, number> = {
    [RiskLevel.LOW]: 0,
    [RiskLevel.MEDIUM]: 1,
    [RiskLevel.HIGH]: 2,
    [RiskLevel.CRITICAL]: 3,
  };

  const minOrder = riskOrder[minLevel];
  return SAFETY_CATEGORIES.filter((category) => riskOrder[category.defaultRiskLevel] >= minOrder);
}

/**
 * Get all test cases across all categories.
 * @returns Array of all test cases with their category IDs
 */
export function getAllTestCases(): readonly (SafetyTestCase & {
  categoryId: SafetyCategoryIdType;
})[] {
  return SAFETY_CATEGORIES.flatMap((category) =>
    category.exampleTestCases.map((testCase) => ({
      ...testCase,
      categoryId: category.id,
    }))
  );
}

/**
 * Get test cases filtered by tags.
 * @param tags - Tags to filter by (any match)
 * @returns Array of matching test cases
 */
export function getTestCasesByTags(
  tags: readonly string[]
): readonly (SafetyTestCase & { categoryId: SafetyCategoryIdType })[] {
  const tagSet = new Set(tags);
  return getAllTestCases().filter((testCase) => testCase.tags.some((tag) => tagSet.has(tag)));
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate a safety category definition.
 * @param category - Category to validate
 * @returns Validation result with inferred schema type
 */
export function validateSafetyCategory(
  category: unknown
): ZodSafeParseResult<z.infer<typeof SafetyCategorySchema>> {
  return SafetyCategorySchema.safeParse(category);
}

/**
 * Validate a test case definition.
 * @param testCase - Test case to validate
 * @returns Validation result with inferred schema type
 */
export function validateTestCase(
  testCase: unknown
): ZodSafeParseResult<z.infer<typeof SafetyTestCaseSchema>> {
  return SafetyTestCaseSchema.safeParse(testCase);
}

/**
 * Validate an evaluation criterion definition.
 * @param criterion - Criterion to validate
 * @returns Validation result with inferred schema type
 */
export function validateEvaluationCriterion(
  criterion: unknown
): ZodSafeParseResult<z.infer<typeof EvaluationCriterionSchema>> {
  return EvaluationCriterionSchema.safeParse(criterion);
}

// =============================================================================
// Summary Statistics
// =============================================================================

/**
 * Get summary statistics for the safety taxonomy.
 * @returns Summary statistics object
 */
export function getSafetyTaxonomySummary(): SafetyTaxonomySummary {
  const categoriesByRiskLevel: Record<RiskLevelType, number> = {
    [RiskLevel.LOW]: 0,
    [RiskLevel.MEDIUM]: 0,
    [RiskLevel.HIGH]: 0,
    [RiskLevel.CRITICAL]: 0,
  };

  const testCasesByOutcome: Record<ExpectedOutcomeType, number> = {
    [ExpectedOutcome.REFUSE]: 0,
    [ExpectedOutcome.CAUTION]: 0,
    [ExpectedOutcome.CLARIFY]: 0,
    [ExpectedOutcome.ESCALATE]: 0,
    [ExpectedOutcome.PROCEED]: 0,
    [ExpectedOutcome.DETECT]: 0,
  };

  let totalCriteria = 0;
  let totalTestCases = 0;

  for (const category of SAFETY_CATEGORIES) {
    categoriesByRiskLevel[category.defaultRiskLevel]++;
    totalCriteria += category.criteria.length;

    for (const testCase of category.exampleTestCases) {
      totalTestCases++;
      testCasesByOutcome[testCase.expectedOutcome]++;
    }
  }

  return {
    totalCategories: SAFETY_CATEGORIES.length,
    totalCriteria,
    totalTestCases,
    categoriesByRiskLevel,
    testCasesByOutcome,
  };
}
