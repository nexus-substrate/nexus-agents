/**
 * Scheduled `improvement_review` runner (#3229, epic #3143).
 *
 * Closes the observability→action gap: `improvement_review` already emits
 * `signal.fitness_declined` onto the pipeline bus on every run (see
 * `improvement-review-signals.ts`), but nothing invoked it on a schedule — a
 * human had to run the MCP tool by hand. This module polls it on an interval so
 * the signal fires automatically, feeding the self-tuning loop.
 *
 * Mirrors the `observability/swarm-health-signals.ts` lifecycle: an idempotent
 * `start` + paired `shutdown`, an `.unref()`'d timer, and errors swallowed so a
 * failed run never breaks the poll.
 *
 * **Disabled by default.** Set `NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS` to a
 * positive value to enable (a conservative 6h = `21600000` is recommended for
 * analysis-only signal emission). Issue filing stays a SEPARATE opt-in:
 * `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES=true` — never enabled by the timer
 * alone, since auto-filing GitHub issues on a schedule risks issue spam.
 *
 * @module mcp/tools/improvement-review-scheduler
 */

import { createLogger, getErrorMessage } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import { parseIntEnv, parseBoolEnv } from '../../config/defaults-env.js';
import { runImprovementReview, ImprovementReviewInputSchema } from './improvement-review.js';

const defaultLogger = createLogger({ component: 'ImprovementReviewScheduler' });

/** Poll interval (ms). Default 0 = disabled. */
const INTERVAL_ENV = 'NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS';
/** Separate opt-in for auto-filing GitHub issues on the scheduled run. */
const FILE_ISSUES_ENV = 'NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES';

export interface ImprovementReviewSchedulerOptions {
  /** Poll interval in ms. `<= 0` (default) disables the scheduler. */
  readonly intervalMs?: number;
  /** Whether scheduled runs file GitHub issues. Default false (signals only). */
  readonly fileIssues?: boolean;
  /** Injectable logger. */
  readonly logger?: ILogger;
}

let schedulerTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Start the scheduled `improvement_review` poll. Idempotent — repeated calls are
 * no-ops while active. Disabled (returns immediately) when the resolved interval
 * is non-positive. The first run fires after one full interval (not eagerly at
 * start), so frequent server restarts don't trigger a burst of reviews. Caller
 * must invoke `shutdownImprovementReviewScheduler()` on server shutdown.
 */
export function startImprovementReviewScheduler(options?: ImprovementReviewSchedulerOptions): void {
  if (schedulerTimer !== undefined) return;
  const logger = options?.logger ?? defaultLogger;
  const intervalMs = options?.intervalMs ?? parseIntEnv(INTERVAL_ENV, 0);
  if (intervalMs <= 0) return; // disabled by default
  const fileIssues = options?.fileIssues ?? parseBoolEnv(FILE_ISSUES_ENV, false);

  // Parse once at start (fileIssues is fixed for the scheduler's lifetime) — so
  // a validation throw surfaces at startup, never mid-tick where it could wedge
  // the `running` guard (#3229 QA).
  const input = ImprovementReviewInputSchema.parse({ fileIssues });

  let running = false; // guard against overlapping runs (the review is async)
  schedulerTimer = setInterval(() => {
    if (running) {
      logger.debug('Scheduled improvement_review skipped — previous run still in progress');
      return;
    }
    running = true;
    runImprovementReview(input, { logger })
      .then((result) => {
        logger.info('Scheduled improvement_review complete', {
          signals: result.signals.length,
          issuesFiled: result.issuesFiled.length,
        });
      })
      .catch((error: unknown) => {
        logger.warn('Scheduled improvement_review failed', { error: getErrorMessage(error) });
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  schedulerTimer.unref();
  logger.info('Scheduled improvement_review enabled', { intervalMs, fileIssues });
}

/** Release the scheduled improvement_review timer. Idempotent. */
export function shutdownImprovementReviewScheduler(): void {
  if (schedulerTimer !== undefined) {
    clearInterval(schedulerTimer);
    schedulerTimer = undefined;
  }
}
