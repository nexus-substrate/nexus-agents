/**
 * The one writer allowed to touch a `cancelled` job record (#6735).
 *
 * A sibling of `job-result-store.ts`, which is at its line cap. The field's
 * shape is `CancelledPartialSchema` (`job-cancelled-partial-schema.ts`).
 *
 * @module mcp/jobs/job-cancelled-partial
 */

import { createLogger } from '../../core/index.js';
import { CancelledPartialSchema } from './job-cancelled-partial-schema.js';
import {
  persistJobRecordAcrossCandidates,
  readJobResult,
  type JobResult,
} from './job-result-store.js';

const logger = createLogger({ component: 'job-cancelled-partial' });

/**
 * Attach what a cancelled vote had cast to its `cancelled` record (#6735).
 * Returns whether the record was written.
 *
 * Why a separate writer and not a relaxed terminal writer: the #4017/#4022
 * rule — nothing rewrites a `cancelled` record — stays exactly as it is for
 * `writeJobComplete` / `writeJobFailed` / `heartbeatJob`. This writer is the
 * one exception, and it is narrow by construction:
 *
 * - it acts ONLY on a record that is already `cancelled` (a pending, complete
 *   or failed record is left alone — it cannot be used to settle a job), and
 *   only when the record's `toolName` is the caller's;
 * - it never changes `status`, `completedAt`, `error` or any other field — it
 *   adds `cancelledPartial` and nothing else;
 * - first write wins: a record that already carries `cancelledPartial` is not
 *   rewritten, so the partials cannot be replaced after the fact;
 * - `seatsCast` is derived from `partialVotes`, so the count cannot disagree
 *   with the votes it counts.
 *
 * The cancel path cannot write this itself: `cancel_job` is tool-agnostic and
 * runs before the body has settled, so only the body knows what it collected.
 */
export function attachCancelledPartial(
  jobId: string,
  toolName: string,
  partial: { readonly partialVotes: readonly unknown[]; readonly panelSize: number }
): boolean {
  const existing = readJobResult(jobId);
  if (
    existing?.status !== 'cancelled' ||
    existing.toolName !== toolName ||
    existing.cancelledPartial !== undefined
  ) {
    logger.debug('Skipping cancelled-partial write — record is not a bare cancelled record', {
      jobId,
      toolName,
      status: existing?.status ?? 'unknown',
    });
    return false;
  }
  const cancelledPartial = CancelledPartialSchema.parse({
    partialVotes: [...partial.partialVotes],
    seatsCast: partial.partialVotes.length,
    panelSize: partial.panelSize,
  });
  const updated: JobResult = { ...existing, cancelledPartial };
  persistJobRecordAcrossCandidates(jobId, updated);
  logger.debug('Attached partial votes to cancelled job record', {
    jobId,
    toolName,
    seatsCast: cancelledPartial.seatsCast,
    panelSize: cancelledPartial.panelSize,
  });
  return true;
}
