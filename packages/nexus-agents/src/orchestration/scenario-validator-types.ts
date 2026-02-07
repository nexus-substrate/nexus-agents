/**
 * Type definitions for the Scenario Validator module.
 *
 * Validates execution results against acceptance criteria
 * from parsed specifications.
 *
 * @module orchestration/scenario-validator-types
 * (Source: Issue #850 — Phase 3 of AI Software Factory Epic #843)
 */

import { z } from 'zod';

/**
 * Result of checking a single acceptance criterion.
 */
export const CriterionResultSchema = z.object({
  /** The original acceptance criterion text */
  criterion: z.string(),
  /** Whether this criterion was satisfied */
  met: z.boolean(),
  /** Which result(s) matched this criterion */
  matchedResults: z.array(z.string()),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

/**
 * Overall scenario validation result.
 */
export const ScenarioResultSchema = z.object({
  /** Satisfaction score from 0 (none met) to 1 (all met) */
  satisfaction: z.number().min(0).max(1),
  /** Total acceptance criteria count */
  totalCriteria: z.number().int().nonnegative(),
  /** Number of criteria met */
  metCount: z.number().int().nonnegative(),
  /** Per-criterion results */
  criteria: z.array(CriterionResultSchema),
  /** Whether all criteria are met */
  allMet: z.boolean(),
});
export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;

/**
 * Error detail when scenario validation fails.
 */
export interface ScenarioError {
  readonly message: string;
}
