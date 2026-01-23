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

/** Schema for PuppeteerTerminationReason. */
export const TerminationReasonSchema = z.enum([
  'task_complete',
  'max_steps',
  'timeout',
  'error',
  'cancelled',
  'convergence',
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
