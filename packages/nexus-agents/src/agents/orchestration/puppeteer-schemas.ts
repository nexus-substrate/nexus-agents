/**
 * Puppeteer Zod Schemas
 *
 * Zod validation schemas for Puppeteer orchestration types.
 *
 * @module agents/orchestration/puppeteer-schemas
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { z } from 'zod';

/** Schema for PolicyMode. */
export const PolicyModeSchema = z.enum(['rule_based', 'learned', 'hybrid']);

/**
 * Schema for PuppeteerTerminationReason.
 *
 * This list and the `PuppeteerTerminationReason` union are two spellings of one
 * vocabulary, and the compiler checks neither against the other: the union
 * gained `budget_exceeded` while this enum did not, which would silently reject
 * a valid persisted result. `puppeteer-termination.test.ts` asserts the two
 * sets are equal — that check, not the type system, is what keeps them together.
 */
export const TerminationReasonSchema = z.enum([
  'task_complete',
  'max_steps',
  'timeout',
  'error',
  'cancelled',
  'convergence',
  'budget_exceeded',
  'unknown',
]);

/** Schema for ReasoningPattern. */
export const ReasoningPatternSchema = z.enum([
  'decomposition',
  'reflection',
  'refinement',
  'critique',
  'modification',
  'summarization',
  'execution',
  'termination',
]);

/** Schema for PuppeteerConfig. */
export const PuppeteerConfigSchema = z.object({
  maxSteps: z.number().int().positive().max(100).optional(),
  timeoutMs: z.number().int().positive().max(3600000).optional(),
  policyMode: PolicyModeSchema.optional(),
  discountFactor: z.number().min(0).max(1).optional(),
  explorationRate: z.number().min(0).max(1).optional(),
  trackEmergentPatterns: z.boolean().optional(),
  costPer1KTokens: z.number().positive().optional(),
  maxCostBudget: z.number().positive().optional(),
});
