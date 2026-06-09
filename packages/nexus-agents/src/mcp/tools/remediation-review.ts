/**
 * Soundness-review surface for audit-mode remediation selections (#3765).
 *
 * The 2nd link in the autonomy enforce-decision-gate evidence chain (#3540 /
 * #3653). The durable soak (#3762) is the set of selections to review; this
 * module records a NAMED-EVALUATOR's verdict (reviewed + sound|unsound) and an
 * owner sign-off for each, then summarizes them into the
 * `judgedSelections`/`judgedSound`/`evaluator`/`owner` the readiness collector
 * (#3764) feeds to {@link evaluateEnforceReadiness}.
 *
 * Why a human surface: the readiness exit criterion (#3612) requires a *named*
 * evaluator and owner — an inherently human act. An LLM-judge pre-pass is
 * deliberately deferred to #3773 (still needs human confirmation regardless).
 *
 * Persistence reuses the shared {@link JsonlStore} primitive — no parallel
 * persistence path. Free-text (`note`) is secret-scrubbed before persist.
 *
 * @module mcp/tools/remediation-review
 */

import { z } from 'zod';

import { JsonlStore } from '../../config/jsonl-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import { scanForSecrets, describeSecretFindings } from './diff-secret-scan.js';
import type { RemediationSoakRecord } from './improvement-remediation-shadow.js';

/**
 * A reference uniquely identifying the soak selection a review applies to:
 * `signalKey::timestamp`. Stable across runs (the soak record's own coordinates).
 */
export function soakRefOf(record: Pick<RemediationSoakRecord, 'signalKey' | 'timestamp'>): string {
  return `${record.signalKey}::${record.timestamp}`;
}

/**
 * One durable soundness-review verdict for a single audit-mode soak selection.
 * `note` is free-text and secret-scrubbed before persist (see
 * {@link scrubReviewRecord}).
 */
export const ReviewRecordSchema = z.object({
  /** Reference to the reviewed soak selection (`signalKey::timestamp`). */
  soakRef: z.string(),
  /** ISO-8601 time the review was recorded. */
  reviewedAt: z.string(),
  /** Always true — a persisted record is, by construction, a review. */
  reviewed: z.literal(true),
  /** Whether the evaluator assessed the selection SOUND. */
  sound: z.boolean(),
  /** Named evaluator who performed the review (required — the gate's named-evaluator criterion). */
  evaluator: z.string().min(1),
  /** Named owner accepting enforcement, recorded at sign-off time (optional per record). */
  owner: z.string().min(1).optional(),
  /** Free-text note (secret-scrubbed). */
  note: z.string().optional(),
});
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

/**
 * Retention cap for the durable review store. Matches the soak cap so every
 * soak selection can have a corresponding review without eviction skew (#3762).
 */
export const REVIEW_MAX_RECORDS = 10_000;

/** JSONL file under NEXUS_DATA_DIR holding the durable soundness-review verdicts. */
export function getRemediationReviewFile(): string {
  return nexusDataPath('learning', 'remediation-reviews.jsonl');
}

/**
 * Redact any secret in a review record's `note` before persist. On a hit the
 * value is replaced with a value-free marker naming the matched pattern(s).
 */
export function scrubReviewRecord(record: ReviewRecord): ReviewRecord {
  if (record.note === undefined) return record;
  const result = scanForSecrets(record.note);
  if (result.clean) return record;
  return { ...record, note: `[redacted: ${describeSecretFindings(result)}]` };
}

/** Durable store for soundness-review records. Scrubs + persists; never throws. */
export interface RemediationReviewStore {
  /** Record (scrub + persist) one review verdict. */
  record(record: ReviewRecord): void;
  /** All persisted review records, oldest first. */
  getRecords(): readonly ReviewRecord[];
}

/**
 * Create a durable review store backed by the shared {@link JsonlStore}
 * (hydrate-on-construct, append-on-write, Zod-validate, oldest-eviction at
 * {@link REVIEW_MAX_RECORDS}). Records are secret-scrubbed before they hit disk.
 */
export function createRemediationReviewStore(
  filePath: string = getRemediationReviewFile(),
  maxRecords: number = REVIEW_MAX_RECORDS
): RemediationReviewStore {
  const store = new JsonlStore<ReviewRecord>({
    filePath,
    schema: ReviewRecordSchema,
    maxRecords,
    component: 'RemediationReviewStore',
  });
  return {
    record(record: ReviewRecord): void {
      store.append(scrubReviewRecord(record));
    },
    getRecords(): readonly ReviewRecord[] {
      return store.all();
    },
  };
}

let reviewSingleton: RemediationReviewStore | undefined;

/** Process-wide durable review store (lazily constructed, hydrates from disk). */
export function getRemediationReviewStore(): RemediationReviewStore {
  reviewSingleton ??= createRemediationReviewStore();
  return reviewSingleton;
}

/** Test helper — drops the cached singleton so a fresh NEXUS_DATA_DIR is picked up. */
export function _resetRemediationReviewStoreForTests(): void {
  reviewSingleton = undefined;
}

/**
 * The aggregate the readiness collector (#3764) consumes: how many selections
 * were judged, how many sound, and the evaluator/owner of record.
 */
export interface RemediationReviewSummary {
  /** Distinct soak selections that have been reviewed. */
  readonly judgedSelections: number;
  /** Of those, how many were assessed SOUND. */
  readonly judgedSound: number;
  /** Latest named evaluator across reviews (undefined when none). */
  readonly evaluator?: string;
  /** Latest named owner sign-off (undefined when none). */
  readonly owner?: string;
}

/**
 * Summarize review records for the readiness gate. Dedupes by `soakRef` keeping
 * the LATEST review per selection (a selection re-reviewed counts once, with the
 * newest verdict). The evaluator/owner reported are from the most recent review
 * that carried them. Pure over its input; does no I/O.
 */
export function summarizeRemediationReviews(
  records: readonly ReviewRecord[]
): RemediationReviewSummary {
  // Last-wins per soakRef: later records in the append-ordered log supersede.
  const latest = new Map<string, ReviewRecord>();
  for (const r of records) latest.set(r.soakRef, r);

  let judgedSound = 0;
  let evaluator: string | undefined;
  let owner: string | undefined;
  for (const r of records) {
    // evaluator/owner track append order so the most recent sign-off wins.
    evaluator = r.evaluator;
    if (r.owner !== undefined) owner = r.owner;
  }
  for (const r of latest.values()) {
    if (r.sound) judgedSound++;
  }
  return {
    judgedSelections: latest.size,
    judgedSound,
    ...(evaluator !== undefined ? { evaluator } : {}),
    ...(owner !== undefined ? { owner } : {}),
  };
}

/** Read + summarize the durable review evidence from disk (convenience for #3764). */
export function readRemediationReviewSummary(
  store: RemediationReviewStore = getRemediationReviewStore()
): RemediationReviewSummary {
  return summarizeRemediationReviews(store.getRecords());
}

/**
 * The soak selections that have NOT yet been reviewed — the pending queue the
 * CLI `list` surface shows. Pure over its inputs.
 */
export function pendingSoakSelections(
  soak: readonly Pick<RemediationSoakRecord, 'signalKey' | 'timestamp'>[],
  reviews: readonly ReviewRecord[]
): readonly { soakRef: string; signalKey: string; timestamp: string }[] {
  const reviewed = new Set(reviews.map((r) => r.soakRef));
  const out: { soakRef: string; signalKey: string; timestamp: string }[] = [];
  for (const s of soak) {
    const soakRef = soakRefOf(s);
    if (!reviewed.has(soakRef)) {
      out.push({ soakRef, signalKey: s.signalKey, timestamp: s.timestamp });
    }
  }
  return out;
}
