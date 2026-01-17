/**
 * nexus-agents/security/safety-bench - Safety Zod Schemas
 *
 * Zod validation schemas for Agent-SafetyBench types.
 *
 * @module security/safety-bench/safety-schemas
 * (Source: Issue #332)
 */

import { z } from 'zod';
import type {
  RiskLevelType,
  SafetyCategoryIdType,
  CriterionTypeType,
  ExpectedOutcomeType,
} from './safety-enums.js';

// =============================================================================
// Enum Schemas
// =============================================================================

/**
 * Zod schema for RiskLevel validation.
 */
export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Zod schema for SafetyCategoryId validation.
 */
export const SafetyCategoryIdSchema = z.enum([
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
]);

/**
 * Zod schema for CriterionType validation.
 */
export const CriterionTypeSchema = z.enum(['binary', 'scaled', 'threshold', 'categorical']);

/**
 * Zod schema for ExpectedOutcome validation.
 */
export const ExpectedOutcomeSchema = z.enum([
  'refuse',
  'caution',
  'clarify',
  'escalate',
  'proceed',
  'detect',
]);

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Definition of an evaluation criterion for safety assessment.
 */
export interface EvaluationCriterion {
  /** Unique criterion identifier. */
  readonly id: string;
  /** Human-readable criterion name. */
  readonly name: string;
  /** Detailed description of what the criterion measures. */
  readonly description: string;
  /** Type of evaluation (binary, scaled, threshold, categorical). */
  readonly type: CriterionTypeType;
  /** Weight factor for scoring (0.0-1.0). */
  readonly weight: number;
  /** Threshold value for pass (for threshold type). */
  readonly passThreshold?: number | undefined;
  /** Categories for categorical type. */
  readonly categories?: readonly string[] | undefined;
}

/**
 * Example test case for safety evaluation.
 */
export interface SafetyTestCase {
  /** Unique test case identifier. */
  readonly id: string;
  /** Test case name. */
  readonly name: string;
  /** Detailed description of the test scenario. */
  readonly description: string;
  /** Input prompt or scenario for the agent. */
  readonly input: string;
  /** Expected safe behavior outcome. */
  readonly expectedOutcome: ExpectedOutcomeType;
  /** Risk level of the scenario. */
  readonly riskLevel: RiskLevelType;
  /** Tags for filtering and grouping. */
  readonly tags: readonly string[];
  /** Additional context or environment setup. */
  readonly context?: string | undefined;
}

/**
 * Complete definition of a safety category.
 */
export interface SafetyCategory {
  /** Unique category identifier. */
  readonly id: SafetyCategoryIdType;
  /** Human-readable category name. */
  readonly name: string;
  /** Detailed description of the category. */
  readonly description: string;
  /** Default risk level for violations in this category. */
  readonly defaultRiskLevel: RiskLevelType;
  /** Parent category ID (for subcategories). */
  readonly parentId?: SafetyCategoryIdType | undefined;
  /** Evaluation criteria for this category. */
  readonly criteria: readonly EvaluationCriterion[];
  /** Example test cases demonstrating the category. */
  readonly exampleTestCases: readonly SafetyTestCase[];
  /** Failure modes commonly seen in this category. */
  readonly failureModes: readonly string[];
  /** Mitigation strategies for this category. */
  readonly mitigationStrategies: readonly string[];
}

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Zod schema for EvaluationCriterion validation.
 */
export const EvaluationCriterionSchema = z.object({
  id: z.string().min(1).describe('Unique criterion identifier'),
  name: z.string().min(1).describe('Human-readable criterion name'),
  description: z.string().describe('Detailed description of what the criterion measures'),
  type: CriterionTypeSchema.describe('Type of evaluation'),
  weight: z.number().min(0).max(1).describe('Weight factor for scoring'),
  passThreshold: z.number().optional().describe('Threshold value for pass'),
  categories: z.array(z.string()).readonly().optional().describe('Categories for categorical type'),
});

/**
 * Zod schema for SafetyTestCase validation.
 */
export const SafetyTestCaseSchema = z.object({
  id: z.string().min(1).describe('Unique test case identifier'),
  name: z.string().min(1).describe('Test case name'),
  description: z.string().describe('Detailed description of the test scenario'),
  input: z.string().describe('Input prompt or scenario for the agent'),
  expectedOutcome: ExpectedOutcomeSchema.describe('Expected safe behavior outcome'),
  riskLevel: RiskLevelSchema.describe('Risk level of the scenario'),
  tags: z.array(z.string()).readonly().describe('Tags for filtering and grouping'),
  context: z.string().optional().describe('Additional context or environment setup'),
});

/**
 * Zod schema for SafetyCategory validation.
 */
export const SafetyCategorySchema = z.object({
  id: SafetyCategoryIdSchema.describe('Unique category identifier'),
  name: z.string().min(1).describe('Human-readable category name'),
  description: z.string().describe('Detailed description of the category'),
  defaultRiskLevel: RiskLevelSchema.describe('Default risk level for violations'),
  parentId: SafetyCategoryIdSchema.optional().describe('Parent category ID'),
  criteria: z.array(EvaluationCriterionSchema).readonly().describe('Evaluation criteria'),
  exampleTestCases: z.array(SafetyTestCaseSchema).readonly().describe('Example test cases'),
  failureModes: z.array(z.string()).readonly().describe('Common failure modes'),
  mitigationStrategies: z.array(z.string()).readonly().describe('Mitigation strategies'),
});

// =============================================================================
// Summary Statistics Type
// =============================================================================

/**
 * Summary statistics for the safety category taxonomy.
 */
export interface SafetyTaxonomySummary {
  /** Total number of categories. */
  readonly totalCategories: number;
  /** Total number of evaluation criteria. */
  readonly totalCriteria: number;
  /** Total number of example test cases. */
  readonly totalTestCases: number;
  /** Categories by risk level. */
  readonly categoriesByRiskLevel: Readonly<Record<RiskLevelType, number>>;
  /** Test cases by expected outcome. */
  readonly testCasesByOutcome: Readonly<Record<ExpectedOutcomeType, number>>;
}
