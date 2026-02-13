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

/** Failure category for failed task outcomes (Issue #1025). */
export const OutcomeFailureCategorySchema = z.enum([
  'timeout',
  'authentication',
  'rate_limit',
  'connection',
  'crash',
  'adapter_unavailable',
  'validation',
  'execution',
  'unknown',
]);

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
  failureCategory: OutcomeFailureCategorySchema.optional(),
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

/** Category of failure for failed outcomes (Issue #1025). */
export type OutcomeFailureCategory = z.infer<typeof OutcomeFailureCategorySchema>;

// ============================================================================
// Error Classification (Issue #1025)
// ============================================================================

const TIMEOUT_PATTERNS = ['timeout', 'timed out'];
const AUTH_PATTERNS = ['auth', 'unauthorized', 'forbidden', 'oauth'];
const RATE_LIMIT_PATTERNS = ['rate limit', 'too many requests', '429'];
const CONNECTION_PATTERNS = ['connection', 'econnrefused', 'enotfound'];
const CRASH_PATTERNS = ['crash', 'exited', 'killed', 'sigterm', 'sigkill'];
const ADAPTER_PATTERNS = ['no model adapter', 'adapter unavailable', 'no adapter'];
const VALIDATION_PATTERNS = ['validation', 'invalid input', 'parse error', 'zod'];

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

/** Classifies an error into an OutcomeFailureCategory for recording. */
export function categorizeOutcomeError(error: unknown): OutcomeFailureCategory {
  if (!(error instanceof Error)) return 'unknown';
  const text = `${error.message.toLowerCase()} ${error.name.toLowerCase()}`;
  if (matchesAny(text, TIMEOUT_PATTERNS)) return 'timeout';
  if (matchesAny(text, AUTH_PATTERNS)) return 'authentication';
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return 'rate_limit';
  if (matchesAny(text, ADAPTER_PATTERNS)) return 'adapter_unavailable';
  if (matchesAny(text, CONNECTION_PATTERNS)) return 'connection';
  if (matchesAny(text, CRASH_PATTERNS)) return 'crash';
  if (matchesAny(text, VALIDATION_PATTERNS)) return 'validation';
  return 'execution';
}

/** Classifies an error message string into an OutcomeFailureCategory. */
export function categorizeOutcomeErrorMessage(msg: string): OutcomeFailureCategory {
  const text = msg.toLowerCase();
  if (matchesAny(text, TIMEOUT_PATTERNS)) return 'timeout';
  if (matchesAny(text, AUTH_PATTERNS)) return 'authentication';
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return 'rate_limit';
  if (matchesAny(text, ADAPTER_PATTERNS)) return 'adapter_unavailable';
  if (matchesAny(text, CONNECTION_PATTERNS)) return 'connection';
  if (matchesAny(text, CRASH_PATTERNS)) return 'crash';
  if (matchesAny(text, VALIDATION_PATTERNS)) return 'validation';
  return 'execution';
}

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
