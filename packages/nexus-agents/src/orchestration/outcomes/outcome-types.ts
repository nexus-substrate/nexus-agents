/**
 * Type definitions for task outcome tracking.
 *
 * Records the result of each model delegation or consensus vote
 * to enable performance measurement across CLIs and task categories.
 *
 * @module orchestration/outcomes/outcome-types
 * (Source: Issue #861 — Task outcome tracking)
 */

import { z } from 'zod';
import { TaskCategorySchema } from '../../config/task-specialization-types.js';

// ============================================================================
// Schemas
// ============================================================================

/** Valid CLI names for outcome tracking. */
const CliNameSchema = z.enum(['claude', 'gemini', 'codex']);

/** Source of the task outcome. */
const OutcomeSourceSchema = z.enum(['delegate', 'consensus', 'manual']);

/** Schema for a single recorded task outcome. */
export const TaskOutcomeSchema = z.object({
  id: z.string().min(1),
  cli: CliNameSchema,
  category: TaskCategorySchema,
  model: z.string().min(1),
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  timestamp: z.string().min(1),
  qualitySignals: z.array(z.string()).optional(),
  source: OutcomeSourceSchema,
});

/** Schema for filtering outcomes. */
export const OutcomeQuerySchema = z.object({
  cli: CliNameSchema.optional(),
  category: TaskCategorySchema.optional(),
  source: OutcomeSourceSchema.optional(),
  since: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

// ============================================================================
// Types
// ============================================================================

/** A single recorded task execution outcome. */
export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

/** Filter for querying stored outcomes. */
export type OutcomeQuery = z.infer<typeof OutcomeQuerySchema>;

/** Source of the outcome record. */
export type OutcomeSource = z.infer<typeof OutcomeSourceSchema>;

/** Aggregated stats for a group of outcomes. */
export interface GroupStats {
  readonly count: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
}

/** Aggregated performance summary from recorded outcomes. */
export interface PerformanceSummary {
  readonly totalTasks: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly byCli: ReadonlyMap<string, GroupStats>;
  readonly byCategory: ReadonlyMap<string, GroupStats>;
}
