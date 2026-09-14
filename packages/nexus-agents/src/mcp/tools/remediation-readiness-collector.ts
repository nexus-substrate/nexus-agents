/**
 * Readiness-evidence collector (#3764) — the 3rd link in the autonomy
 * enforce-decision-gate evidence chain (#3540 / #3653).
 *
 * Builds the {@link EnforceReadinessEvidence} that {@link evaluateEnforceReadiness}
 * consumes, from two durable, secret-scrubbed surfaces that just landed:
 *  - the soak summary (#3762) → `shadowSelections` (audit-mode would-remediate count);
 *  - the soundness-review summary (#3765) → `judgedSelections` / `judgedSound` /
 *    `evaluator` / `owner`.
 *
 * This replaces the hardcoded `NOT_READY` producer in `auto-remediation-deps.ts`.
 * FAIL-CLOSED by construction: with no review data, `judgedSelections` is 0 →
 * the judged-coverage criterion fails → enforce stays blocked. It is a pure
 * projection (the two summaries are the only inputs); the async `readiness()`
 * provider that reads them off disk lives in `auto-remediation-deps.ts`.
 *
 * Also home to {@link assessSoakStaleness} (#4279): the flatline/staleness
 * signal the `remediation-review readiness` report prints beside the verdict,
 * so a store that has stopped accruing is visible rather than papered over.
 *
 * @module mcp/tools/remediation-readiness-collector
 */

import type { EnforceReadinessEvidence } from './improvement-enforce-readiness.js';
import type { RemediationSoakSummary } from './improvement-remediation-shadow.js';
import type { RemediationReviewSummary } from './remediation-review.js';

/**
 * Project the durable soak + review summaries into the evidence the readiness
 * gate evaluates. Pure; no I/O. `shadowSelections` is the soak total (every
 * audit-mode selection is a would-remediate observation). Evaluator/owner are
 * carried through only when present, so the gate's named-evaluator/owner
 * criteria fail-closed when the human surface has not signed off.
 */
export function buildEnforceReadinessEvidence(
  soak: RemediationSoakSummary,
  reviews: RemediationReviewSummary
): EnforceReadinessEvidence {
  return {
    shadowSelections: soak.total,
    judgedSelections: reviews.judgedSelections,
    judgedSound: reviews.judgedSound,
    ...(reviews.evaluator !== undefined ? { evaluator: reviews.evaluator } : {}),
    ...(reviews.owner !== undefined ? { owner: reviews.owner } : {}),
  };
}

/**
 * Days with no new soak record after which the readiness report raises a
 * staleness alarm (#4279). The operator store sat at ONE record for five weeks
 * behind a daily green CI job that fed a different, ephemeral store; nothing
 * rendered that flatline. Two weeks is generous against the documented daily
 * local cron cadence (CONFIGURATION.md) while still firing well before the
 * five-week window that went unnoticed. A signal only — it is not a readiness
 * criterion and never changes `ready`.
 */
const SOAK_STALENESS_ALARM_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/** How the operator soak store reads for the readiness report. */
type SoakStoreStatus =
  /** Nothing to measure: the store is empty. */
  | 'unmeasured'
  /** At least one alarm reason (flatlined, stale, or an unreadable last timestamp). */
  | 'alarm'
  /** Accruing: more than one record and the newest is inside the alarm window. */
  | 'fresh';

/** The staleness/flatline signal rendered alongside the readiness verdict (#4279). */
export interface SoakStalenessSignal {
  readonly status: SoakStoreStatus;
  /** Records in the store (after the plausibility filter). */
  readonly recordCount: number;
  /** ISO timestamp of the newest record, when there is one. */
  readonly lastTimestamp?: string;
  /** Whole days since the newest record; undefined when unmeasurable (empty / unreadable). */
  readonly idleDays?: number;
  /** The alarm window, so a reader of the JSON knows what "stale" meant. */
  readonly alarmAfterDays: number;
  /** Every independent alarm cause, each rendered on its own (never else-if). */
  readonly reasons: readonly string[];
}

/**
 * Assess whether the soak store is still accruing. Pure; `nowMs` is supplied so
 * the verdict is reproducible. Each cause is evaluated independently and all of
 * them are reported — a one-record store that is also 97 days idle says both.
 * An empty store is `unmeasured` (there is nothing to be stale ABOUT), which is
 * distinct from `fresh`: the empty case must never read as health.
 */
export function assessSoakStaleness(
  soak: Pick<RemediationSoakSummary, 'total' | 'lastTimestamp'>,
  nowMs: number
): SoakStalenessSignal {
  const base = { recordCount: soak.total, alarmAfterDays: SOAK_STALENESS_ALARM_DAYS };
  if (soak.total === 0) {
    return { ...base, status: 'unmeasured', reasons: ['store is empty — nothing has fed it'] };
  }
  const reasons: string[] = [];
  if (soak.total === 1) reasons.push('flatlined at 1 record');

  const lastMs = soak.lastTimestamp === undefined ? Number.NaN : Date.parse(soak.lastTimestamp);
  const idleDays = Number.isNaN(lastMs)
    ? undefined
    : Math.max(0, Math.floor((nowMs - lastMs) / MS_PER_DAY));
  if (idleDays === undefined) {
    reasons.push('last record timestamp is unreadable — idle time cannot be measured');
  } else if (idleDays >= SOAK_STALENESS_ALARM_DAYS) {
    reasons.push(
      `no new record for ${String(idleDays)} days (alarm at ≥ ${String(SOAK_STALENESS_ALARM_DAYS)} days)`
    );
  }
  return {
    ...base,
    status: reasons.length > 0 ? 'alarm' : 'fresh',
    ...(soak.lastTimestamp !== undefined ? { lastTimestamp: soak.lastTimestamp } : {}),
    ...(idleDays !== undefined ? { idleDays } : {}),
    reasons,
  };
}
