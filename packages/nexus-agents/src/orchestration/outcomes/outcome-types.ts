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
import { CliNameSchema } from '../../config/model-capabilities-types.js';
import { TaskCategorySchema } from '../../config/task-specialization-types.js';

// ============================================================================
// Schemas
// ============================================================================

// CliNameSchema imported from config/model-capabilities-types.ts (canonical source)

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
  'parse',
  'execution',
  'generic',
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
  errorMessage: z.string().max(500).optional(),
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

const TIMEOUT_PATTERNS = ['timeout', 'timed out', 'deadline exceeded', 'socket hang up', 'aborted'];
const AUTH_PATTERNS = [
  'auth',
  'unauthorized',
  'forbidden',
  'oauth',
  'permission denied',
  '401',
  '403',
];
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'too many requests',
  '429',
  'throttl',
  'quota exceeded',
  'max retries',
  'retry limit',
];
const CONNECTION_PATTERNS = [
  'connection',
  'connect',
  'econnrefused',
  'enotfound',
  'econnreset',
  'dns',
  'network',
  'getaddrinfo',
  'certificate',
  'ssl',
  'tls',
  'proxy',
];
const CRASH_PATTERNS = [
  'crash',
  'exited',
  'killed',
  'sigterm',
  'sigkill',
  'spawn error',
  'out of memory',
  'oom',
  'enomem',
  'fatal',
  'segfault',
  'heap',
];
const ADAPTER_PATTERNS = [
  'no model adapter',
  'adapter unavailable',
  'no adapter',
  'model not found',
  'no model',
  'unknown model',
  'model does not exist',
];
const VALIDATION_PATTERNS = ['validation', 'invalid input', 'parse error', 'zod', 'schema'];
const PARSE_PATTERNS = [
  'json parse',
  'unexpected token',
  'unexpected end of json',
  'syntax error',
  'failed to parse',
  'cannot parse',
  'ndjson',
  'malformed',
];
const EXECUTION_PATTERNS = [
  'api error',
  'apierror',
  'sdk error',
  'failed to',
  'cannot',
  'typeerror',
  'referenceerror',
  'assertion',
  'expect',
  'undefined is not',
  'null is not',
  'is not a function',
  'unhandled',
  'rejected',
  'enoent',
  'permission denied',
  'eperm',
  'eacces',
  'command failed',
  'non-zero exit',
  'exit code',
  'empty response',
  'no output',
  'no content',
  '500',
  '502',
  '503',
  '504',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'truncated',
  'incomplete',
];
// Generic catch-all patterns — separated from execution for observability (#1457)
const GENERIC_PATTERNS = [
  'error:',
  'error occurred',
  'failed',
  'failure',
  'exception',
  'not found',
  'not supported',
  'not implemented',
  'not available',
  'invalid',
  'unable to',
  'could not',
  'unexpected',
  'missing',
  'unsupported',
];

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

/** Classify execution vs generic catch-all patterns (#1457). */
function classifyExecutionOrGeneric(text: string): OutcomeFailureCategory {
  if (matchesAny(text, EXECUTION_PATTERNS)) return 'execution';
  if (matchesAny(text, GENERIC_PATTERNS)) return 'generic';
  return 'unknown';
}

/**
 * Classifies a lowercase text string against all known failure patterns.
 * Order: most-specific categories first, broad execution/generic last (#1461).
 */
function classifyText(text: string): OutcomeFailureCategory {
  if (matchesAny(text, ADAPTER_PATTERNS)) return 'adapter_unavailable';
  if (matchesAny(text, AUTH_PATTERNS)) return 'authentication';
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return 'rate_limit';
  if (matchesAny(text, TIMEOUT_PATTERNS)) return 'timeout';
  if (matchesAny(text, CONNECTION_PATTERNS)) return 'connection';
  if (matchesAny(text, CRASH_PATTERNS)) return 'crash';
  if (matchesAny(text, VALIDATION_PATTERNS)) return 'validation';
  if (matchesAny(text, PARSE_PATTERNS)) return 'parse';
  return classifyExecutionOrGeneric(text);
}

/** Maximum length for extracted error messages to prevent unbounded strings. */
const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Extracts a classifiable message string from a non-Error value.
 * Returns undefined if the value is truly unclassifiable (#1466).
 */
export function extractNonErrorMessage(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined;
  if (typeof error === 'string') {
    return error.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record['message'] === 'string') {
      return record['message'].slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
    try {
      const json = JSON.stringify(error);
      return json.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Classifies an error into an OutcomeFailureCategory for recording. */
export function categorizeOutcomeError(error: unknown): OutcomeFailureCategory {
  if (error instanceof Error) {
    const text = `${error.message.toLowerCase()} ${error.name.toLowerCase()}`;
    return classifyText(text);
  }
  const extracted = extractNonErrorMessage(error);
  if (extracted === undefined) return 'unknown';
  return classifyText(extracted.toLowerCase());
}

/** Classifies an error message string into an OutcomeFailureCategory. */
export function categorizeOutcomeErrorMessage(msg: string): OutcomeFailureCategory {
  return classifyText(msg.toLowerCase());
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
