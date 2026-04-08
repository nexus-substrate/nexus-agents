/**
 * Quality gates for worker output validation (#1502, Overstory pattern).
 *
 * Configurable validation functions that check worker output before
 * it's accepted into the synthesis pipeline. Failed results are
 * marked as 'rejected' and excluded from synthesis.
 *
 * @module orchestration/aorchestra/quality-gate
 */

import { createLogger } from '../../core/index.js';
import type { WorkerResult } from './worker-dispatcher.js';

const logger = createLogger({ component: 'quality-gate' });

/** Minimum output length to accept (characters). */
export const MIN_OUTPUT_LENGTH = 10;

/** Maximum output length to accept (characters). */
export const MAX_OUTPUT_LENGTH = 100_000;

/**
 * Quality gate function signature.
 * Returns undefined if the result passes, or a rejection reason string if it fails.
 */
export type QualityGateFn = (result: WorkerResult) => string | undefined;

/**
 * Built-in gate: rejects outputs that are too short or too long.
 */
export function outputLengthGate(result: WorkerResult): string | undefined {
  if (result.status !== 'success') return undefined; // only validate successes
  if (result.output.length < MIN_OUTPUT_LENGTH) {
    return `Output too short (${String(result.output.length)} chars, min ${String(MIN_OUTPUT_LENGTH)})`;
  }
  if (result.output.length > MAX_OUTPUT_LENGTH) {
    return `Output too long (${String(result.output.length)} chars, max ${String(MAX_OUTPUT_LENGTH)})`;
  }
  return undefined;
}

/**
 * Built-in gate: rejects outputs that are just whitespace or empty.
 */
export function nonEmptyGate(result: WorkerResult): string | undefined {
  if (result.status !== 'success') return undefined;
  if (result.output.trim() === '') {
    return 'Output is empty or whitespace-only';
  }
  return undefined;
}

/**
 * Combines multiple quality gates into a single gate.
 * Returns the first rejection reason encountered, or undefined if all pass.
 */
export function composeGates(...gates: readonly QualityGateFn[]): QualityGateFn {
  return (result: WorkerResult): string | undefined => {
    for (const gate of gates) {
      const rejection = gate(result);
      if (rejection !== undefined) return rejection;
    }
    return undefined;
  };
}

/** Default quality gate: non-empty + length bounds. */
export const DEFAULT_QUALITY_GATE: QualityGateFn = composeGates(nonEmptyGate, outputLengthGate);

// ============================================================================
// Async QA Gate — uses runQaLoop for semantic review (#1710)
// ============================================================================

/**
 * Async quality gate that runs a QA review loop on worker output.
 * Returns undefined (pass) or rejection reason (fail).
 *
 * Unlike the sync QualityGateFn, this performs semantic review:
 * the reviewer analyzes the output content, not just its format.
 */
export type AsyncQualityGateFn = (result: WorkerResult) => Promise<string | undefined>;

/**
 * Create an async QA gate from a review function.
 *
 * Uses runQaLoop under the hood — the worker's output is reviewed,
 * and if rejected, the rejection reason is returned. Note: the gate
 * itself does NOT re-implement (that's the dispatcher's job via
 * shouldRefine). It only determines pass/fail with a reason.
 *
 * @param reviewFn - Function that reviews worker output and returns a verdict
 * @returns Async quality gate function
 *
 * @example
 * ```typescript
 * import { createQaGate } from './quality-gate.js';
 *
 * const qaGate = createQaGate(async (output) => ({
 *   verdict: output.includes('test') ? 'pass' : 'needs_work',
 *   feedback: 'Missing test coverage',
 *   issues: ['No tests'],
 * }));
 *
 * dispatchWorkers(entries, { asyncQualityGate: qaGate });
 * ```
 */
export function createQaGate(
  reviewFn: (
    output: string
  ) => Promise<{
    verdict: 'pass' | 'needs_work' | 'reject';
    feedback: string;
    issues: readonly string[];
  }>
): AsyncQualityGateFn {
  return async (result: WorkerResult): Promise<string | undefined> => {
    if (result.status !== 'success') return undefined;
    const review = await reviewFn(result.output);
    if (review.verdict === 'pass') return undefined;
    return `QA ${review.verdict}: ${review.feedback}`;
  };
}

/**
 * Applies a quality gate to a worker result.
 * If the result fails the gate, returns a new result with status 'error'
 * and the rejection reason. Otherwise returns the original result.
 */
export function applyQualityGate(result: WorkerResult, gate: QualityGateFn): WorkerResult {
  const rejection = gate(result);
  if (rejection === undefined) return result;

  logger.info('Worker output rejected by quality gate', {
    role: result.role,
    reason: rejection,
    outputLength: result.output.length,
  });

  return {
    ...result,
    status: 'error',
    error: `Quality gate: ${rejection}`,
    errorType: 'logic_error',
  };
}
