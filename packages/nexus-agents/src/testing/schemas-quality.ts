/**
 * nexus-agents/testing - Quality Schemas
 *
 * Zod schemas for quality-related test results.
 */

import { z } from 'zod';

/**
 * Schema for criterion score.
 */
export const CriterionScoreSchema = z.object({
  criterionId: z.string().describe('Criterion identifier'),
  criterionName: z.string().describe('Criterion name'),
  points: z.number().nonnegative().describe('Points awarded'),
  maxPoints: z.number().positive().describe('Maximum points possible'),
  normalizedScore: z.number().min(0).max(1).describe('Normalized score (0.0 - 1.0)'),
  weight: z.number().positive().describe('Weight applied'),
  notes: z.string().optional().describe('Scoring notes'),
});

export type CriterionScore = z.infer<typeof CriterionScoreSchema>;

/**
 * Schema for validation result.
 */
export const ValidationResultSchema = z.object({
  type: z.string().describe('Validation type'),
  passed: z.boolean().describe('Whether validation passed'),
  message: z.string().describe('Validation message'),
  expected: z.unknown().optional().describe('Expected value'),
  actual: z.unknown().optional().describe('Actual value'),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Schema for quality result.
 */
export const QualityResultSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall quality score (0 - 100)'),
  passed: z.boolean().describe('Whether task passed quality threshold'),
  threshold: z.number().min(0).max(100).describe('Passing threshold used'),
  criterionScores: z.array(CriterionScoreSchema).describe('Individual criterion scores'),
  validationResults: z.array(ValidationResultSchema).describe('Validation results'),
});

export type QualityResult = z.infer<typeof QualityResultSchema>;

/**
 * Schema for score distribution.
 */
export const ScoreDistributionSchema = z.object({
  bucket0to20: z.number().nonnegative().describe('Scores 0-20'),
  bucket21to40: z.number().nonnegative().describe('Scores 21-40'),
  bucket41to60: z.number().nonnegative().describe('Scores 41-60'),
  bucket61to80: z.number().nonnegative().describe('Scores 61-80'),
  bucket81to100: z.number().nonnegative().describe('Scores 81-100'),
});

export type ScoreDistribution = z.infer<typeof ScoreDistributionSchema>;
