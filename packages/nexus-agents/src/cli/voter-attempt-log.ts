/**
 * Failed-attempt logging for the voter retry loop, and the rate-limit test it
 * classifies by. Extracted from `voter-execution.ts` (#6821) to keep that
 * module under the line cap; behaviour unchanged.
 *
 * @module cli/voter-attempt-log
 */

import type { ILogger } from '../core/index.js';
import type { VoterRole } from './vote-types.js';
import { isAuthFailureText } from '../cli-adapters/cli-error-envelope.js';
import { sanitizeOutput } from '../security/output-sanitizer.js';
/**
 * Detects whether an error message indicates a rate-limit condition.
 * Delegates to canonical rate-limit-detector (DRY consolidation Issue #1596).
 */
import { isRateLimitLikeError, isDurableCapacityText } from '../adapters/rate-limit-detector.js';

/** @see isRateLimitLikeError — re-exported for backward compatibility */
export function isRateLimitError(message: string): boolean {
  return isRateLimitLikeError(new Error(message));
}

/**
 * Record that a voter gave up its remaining attempts (#5359).
 *
 * A DURABLE capacity cap — a spend or usage ceiling on the credential — does
 * not clear in seconds, so the remaining attempts are guaranteed-futile. The
 * waste is not local either: `computeOverallConsensusDeadlineMs` budgets
 * `timeoutMs * (maxRetries + 1)` as a SHARED wall-clock deadline across the
 * panel, so burning it here starved a healthy voter on a different adapter in
 * four consecutive live runs. Failing fast hands the remaining budget to the
 * #3587 fallback, which is what actually recovers the voice.
 */
export function logAbandonedRetries(
  logger: ILogger,
  role: VoterRole,
  attempt: number,
  maxRetries: number,
  cause: 'durable capacity cap' | 'auth failure' | 'non-retryable error'
): void {
  logger.warn(`${cause} — abandoning retries for this voter`, {
    role,
    attempt: attempt + 1,
    remainingAttemptsSkipped: maxRetries - attempt,
  });
}

/** One failed attempt, as {@link logFailedAttempt} reports it. */
interface FailedAttempt {
  readonly role: VoterRole;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly attemptMs: number;
  readonly error: string;
  readonly retryable: boolean | undefined;
  /** Stderr the transport captured when the output was not a vote (#6269). */
  readonly cliStderr: string | undefined;
  /** The answer that failed to parse as a vote, when the transport completed (#6957). */
  readonly rawOutput?: string | undefined;
}

/** Longest raw-answer excerpt carried on the `Vote attempt failed` line (#6957). */
const LOGGED_RAW_OUTPUT_MAX_CHARS = 2000;

/** Longest stderr excerpt carried on the `Vote attempt failed` line (#6269). */
const LOGGED_STDERR_MAX_CHARS = 200;

/**
 * The first non-blank stderr line, secret-redacted and clipped: enough to name
 * the cause (an auth line, a sandbox failure) without a stack trace (#6269).
 */
function loggedStderrLine(cliStderr: string): string {
  const first = cliStderr.split('\n').find((line) => line.trim() !== '') ?? '';
  return sanitizeOutput(first.trim()).slice(0, LOGGED_STDERR_MAX_CHARS);
}

/**
 * Log one failed attempt's timing and classification. Returns the reason the
 * remaining attempts are futile — a DURABLE capacity cap (#5359) or an auth
 * failure (#6269: a retry on the same credential cannot clear it, and the
 * budget it would burn is what the #3587 fallback needs) — or `null` when the
 * caller should keep retrying. Explicit non-retryable adapter errors also
 * abandon the remaining attempts (#6846).
 */
export function logFailedAttempt(
  logger: ILogger,
  failed: FailedAttempt
): 'durable capacity cap' | 'auth failure' | 'non-retryable error' | null {
  const { role, attempt, maxRetries, attemptMs, error, cliStderr } = failed;
  const rateLimited = isRateLimitError(error);
  const durableCap = isDurableCapacityText(error);
  const authFailure = isAuthFailureText(error);
  logger.info('Vote attempt timing', {
    role,
    attempt: attempt + 1,
    attemptMs,
    succeeded: false,
    rateLimited,
  });
  logger.warn('Vote attempt failed', {
    role,
    attempt: attempt + 1,
    maxRetries: maxRetries + 1,
    error,
    ...(rateLimited ? { rateLimited: true } : {}),
    ...(durableCap ? { durableCap: true } : {}),
    ...(authFailure ? { authFailure: true } : {}),
    ...(cliStderr !== undefined && cliStderr !== ''
      ? { cliStderr: loggedStderrLine(cliStderr) }
      : {}),
    // #6957: without the answer itself a rejected vote cannot be diagnosed.
    ...(failed.rawOutput !== undefined
      ? { rawOutputExcerpt: sanitizeOutput(failed.rawOutput).slice(0, LOGGED_RAW_OUTPUT_MAX_CHARS) }
      : {}),
  });
  if (durableCap) return 'durable capacity cap';
  if (authFailure) return 'auth failure';
  if (failed.retryable === false) return 'non-retryable error';
  return null;
}
