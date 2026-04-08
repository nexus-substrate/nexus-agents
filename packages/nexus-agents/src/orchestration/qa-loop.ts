/**
 * QA Review Loop — Reusable implement→review→iterate pattern (#1707)
 *
 * Extracted from dev-pipeline's implementSingleTask for reuse across:
 * - dev-pipeline (research→plan→vote→implement→QA flow)
 * - executeWorkerDispatch (qualityGate callback)
 * - Any agent workflow that needs QA iteration
 *
 * @module orchestration/qa-loop
 */

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'qa-loop' });

/** Default maximum QA iterations before accepting. */
export const DEFAULT_MAX_QA_ITERATIONS = 3;

/** Verdict from a QA review. */
export type QaVerdict = 'pass' | 'needs_work' | 'reject';

/** Result of a QA review. */
export interface QaReviewOutput {
  readonly verdict: QaVerdict;
  readonly feedback: string;
  readonly issues: readonly string[];
}

/** Result of a single QA-gated execution. */
export interface QaLoopResult<T> {
  /** Final output from the implement function. */
  readonly output: T;
  /** Whether QA approved the output. */
  readonly approved: boolean;
  /** Number of iterations performed. */
  readonly iterations: number;
  /** Final QA verdict (pass, needs_work, or reject). */
  readonly verdict: QaVerdict;
  /** Feedback from the last review (if any). */
  readonly feedback: string;
}

/**
 * Run an implement→QA review loop with iteration on rejection.
 *
 * Generic over the output type T — works with any implement/review pair.
 *
 * @param implement - Function that produces output (receives prior feedback if retrying)
 * @param review - Function that reviews the output and returns a verdict
 * @param maxIterations - Maximum iterations before accepting last output
 * @returns QA loop result with output, approval status, and iteration count
 *
 * @example
 * ```typescript
 * const result = await runQaLoop(
 *   async (feedback) => generateCode(task, feedback),
 *   async (code) => reviewCode(code),
 * );
 * if (result.approved) console.log('QA passed:', result.output);
 * ```
 */
export async function runQaLoop<T>(
  implement: (priorFeedback?: string) => Promise<T>,
  review: (output: T) => Promise<QaReviewOutput>,
  maxIterations: number = DEFAULT_MAX_QA_ITERATIONS
): Promise<QaLoopResult<T>> {
  let feedback: string | undefined;
  let lastOutput: T | undefined;
  let lastVerdict: QaVerdict = 'needs_work';

  for (let i = 1; i <= maxIterations; i++) {
    logger.info('QA loop iteration', { iteration: i, hasFeedback: feedback !== undefined });
    const output = await implement(feedback);
    lastOutput = output;

    const reviewResult = await review(output);
    lastVerdict = reviewResult.verdict;

    if (reviewResult.verdict === 'pass') {
      logger.info('QA loop passed', { iteration: i });
      return {
        output,
        approved: true,
        iterations: i,
        verdict: 'pass',
        feedback: reviewResult.feedback,
      };
    }

    logger.warn('QA loop rejected', {
      iteration: i,
      verdict: reviewResult.verdict,
      issues: reviewResult.issues.length,
    });
    feedback = reviewResult.feedback;
  }

  logger.warn('QA loop exhausted iterations', { maxIterations, lastVerdict });
  return {
    output: lastOutput as T,
    approved: false,
    iterations: maxIterations,
    verdict: lastVerdict,
    feedback: feedback ?? '',
  };
}
