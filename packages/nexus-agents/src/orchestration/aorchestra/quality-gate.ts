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
