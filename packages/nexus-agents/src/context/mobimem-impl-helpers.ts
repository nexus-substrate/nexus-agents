/**
 * nexus-agents/context - MobiMEM Implementation Helpers
 *
 * Pure helper functions for MobiMEM implementation.
 * Extracted to keep main implementation under 400 lines.
 *
 * @module context/mobimem-impl-helpers
 * (Source: Issue #149, arXiv:2512.15784)
 */

import { createHash } from 'node:crypto';
import type { ActionStep } from './mobimem-types.js';

/**
 * Calculate confidence score based on observation count.
 * Uses logarithmic scaling: confidence = min(1, log10(count + 1) / 2)
 *
 * @param observationCount - Number of observations
 * @returns Confidence score between 0 and 1
 */
export function calculateConfidence(observationCount: number): number {
  return Math.min(1, Math.log10(observationCount + 1) / 2);
}

/**
 * Generate a unique pattern key from task type, action sequence, and context.
 * Uses SHA-256 hash of the action sequence for consistent keying.
 *
 * @param taskType - The type of task
 * @param actionSequence - Sequence of action steps
 * @param contextSignature - Context signature string
 * @returns Unique pattern key string
 */
export function generatePatternKey(
  taskType: string,
  actionSequence: readonly ActionStep[],
  contextSignature: string
): string {
  const sequenceHash = createHash('sha256')
    .update(
      JSON.stringify(actionSequence.map((a) => ({ type: a.actionType, params: a.parameters })))
    )
    .digest('hex')
    .slice(0, 16);
  return `${taskType}:${contextSignature}:${sequenceHash}`;
}

/**
 * Hash an input value for cache key generation.
 * Uses SHA-256 hash of JSON-stringified input.
 *
 * @param input - Input value to hash
 * @returns SHA-256 hex hash of the input
 */
export function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/**
 * Calculate pattern score for ranking.
 * Score = successRate * contextMatch * log10(attemptCount + 1)
 *
 * @param successRate - Pattern success rate (0-1)
 * @param contextMatches - Whether context signature matches exactly
 * @param attemptCount - Number of attempts
 * @returns Calculated score for ranking
 */
export function calculatePatternScore(
  successRate: number,
  contextMatches: boolean,
  attemptCount: number
): number {
  const contextMatch = contextMatches ? 1 : 0.5;
  return successRate * contextMatch * Math.log10(attemptCount + 1);
}

/**
 * Compute success rate from success count and attempt count.
 *
 * @param successCount - Number of successes
 * @param attemptCount - Total attempts
 * @returns Success rate (0-1)
 */
export function computeSuccessRate(successCount: number, attemptCount: number): number {
  return attemptCount > 0 ? successCount / attemptCount : 0;
}

/**
 * Compute updated metrics for experience entries.
 *
 * @param prevSuccess - Previous success count
 * @param prevAttempts - Previous attempt count
 * @param success - Whether current attempt succeeded
 * @returns Updated metrics
 */
export function computeUpdatedMetrics(
  prevSuccess: number,
  prevAttempts: number,
  success: boolean
): { successCount: number; attemptCount: number; successRate: number } {
  const successCount = prevSuccess + (success ? 1 : 0);
  const attemptCount = prevAttempts + 1;
  return {
    successCount,
    attemptCount,
    successRate: computeSuccessRate(successCount, attemptCount),
  };
}

/**
 * Count unique values from an iterable by extracting a key.
 *
 * @param values - Iterable of values
 * @param keyFn - Function to extract the unique key
 * @returns Count of unique keys
 */
export function countUnique<T>(values: Iterable<T>, keyFn: (v: T) => string): number {
  const seen = new Set<string>();
  for (const v of values) {
    seen.add(keyFn(v));
  }
  return seen.size;
}

/**
 * Compute average of a numeric property from an iterable.
 *
 * @param values - Iterable of values
 * @param valueFn - Function to extract numeric value
 * @returns Average value, or 0 if empty
 */
export function computeAverage<T>(values: Iterable<T>, valueFn: (v: T) => number): number {
  let total = 0;
  let count = 0;
  for (const v of values) {
    total += valueFn(v);
    count++;
  }
  return count > 0 ? total / count : 0;
}
