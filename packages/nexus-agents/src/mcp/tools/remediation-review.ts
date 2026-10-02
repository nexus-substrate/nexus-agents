/** Durable human, panel and sampled owner remediation judgments (#4279). */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { JsonlStore } from '../../config/jsonl-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import { scanForSecrets, describeSecretFindings } from './diff-secret-scan.js';
import {
  getRemediationSoakFile,
  RemediationSoakRecordSchema,
} from './improvement-remediation-shadow.js';
import type { RemediationSoakRecord } from './improvement-remediation-shadow.js';
import {
  getRemediationReviewSampleStore,
  summarizeOwnerSample,
  evaluateOwnerSampleHistory,
  currentRemediationJudgments,
  ownerSampleIsFresh,
  ownerSampleOverrideFailure,
  ownerSampleSignOff,
} from './remediation-review-sample.js';
import type { ReviewSample, RemediationReviewSampleStore } from './remediation-review-sample.js';
export * from './remediation-review-sample.js';
import { verifyRemediationReviewEvidence } from './remediation-review-evidence.js';

/** SHA256 binds panel provenance to the exact persisted line, including whitespace. */
export function hashSoakRecordLine(line: string): string {
  return createHash('sha256').update(line).digest('hex');
}

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
export const ReviewRecordSchema = z
  .object({
    judgeKind: z.enum(['human', 'panel', 'owner-sample']).default('human'),
    voteRecordId: z.string().min(1).optional(),
    /** Exact absolute ledger used by the panel vote; absent legacy rows cannot verify. */
    voteLedgerPath: z.string().refine(isAbsolute, 'Vote ledger path must be absolute').optional(),
    soakRecordHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sampleId: z.string().min(1).optional(),
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
    /** True only for the explicit sign-off operation; absent on legacy human rows. */
    ownerSignedOff: z.boolean().optional(),
    /** Free-text note (secret-scrubbed). */
    note: z.string().optional(),
  })
  .superRefine((record, ctx) => {
    if (
      record.judgeKind === 'panel' &&
      (record.voteRecordId === undefined ||
        record.soakRecordHash === undefined ||
        record.evaluator !== `panel:${record.voteRecordId}` ||
        record.owner !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Panel requires vote provenance, panel evaluator and no owner',
      });
    }
    if (record.judgeKind === 'owner-sample' && record.sampleId === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Owner sample requires sampleId' });
    }
  });
export type ReviewRecord = z.input<typeof ReviewRecordSchema>;
export type NormalizedReviewRecord = z.output<typeof ReviewRecordSchema>;

/**
 * Preserve judgment history: automatic eviction could erase owner disagreement.
 * Soak retention is separate; references to evicted artifacts are reported.
 */
const REVIEW_MAX_RECORDS = Number.MAX_SAFE_INTEGER;

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

/** Durable review store. Invalid provenance throws; persistence failure returns false. */
export interface RemediationReviewStore {
  /** False when any persisted evidence was unreadable or schema-invalid. */
  readonly hydrationComplete?: boolean;
  /** Record (scrub + persist) one review verdict. */
  record(record: ReviewRecord, rawSoakLine?: string): boolean;
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
  const config = {
    filePath,
    schema: ReviewRecordSchema,
    maxRecords,
    component: 'RemediationReviewStore',
  };
  let store = new JsonlStore<ReviewRecord>(config);
  return {
    get hydrationComplete(): boolean {
      return store.hydrationComplete;
    },
    record(record: ReviewRecord, rawSoakLine?: string): boolean {
      // Decision evidence must preserve corruption instead of rewriting it as valid rows.
      if (!store.hydrationComplete) return false;
      const parsed = ReviewRecordSchema.parse(record);
      if (
        parsed.judgeKind === 'panel' &&
        (rawSoakLine === undefined || hashSoakRecordLine(rawSoakLine) !== parsed.soakRecordHash)
      ) {
        throw new Error('Panel soak hash mismatch');
      }
      if (parsed.judgeKind === 'panel' && rawSoakLine !== undefined) {
        const coordinates = RemediationSoakRecordSchema.pick({
          signalKey: true,
          timestamp: true,
        }).parse(JSON.parse(rawSoakLine));
        if (soakRefOf(coordinates) !== parsed.soakRef)
          throw new Error('Panel soak reference mismatch');
      }
      const persisted = store.append(scrubReviewRecord(parsed));
      // JsonlStore retains failed appends in memory; evidence must reflect durable rows only.
      if (!persisted) store = new JsonlStore<ReviewRecord>(config);
      return persisted;
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
export interface JudgmentCounts {
  readonly n: number;
  readonly disagreements: number;
}

export interface RemediationReviewSummary {
  readonly human: JudgmentCounts;
  readonly panel: JudgmentCounts;
  readonly sample: JudgmentCounts;
  readonly sampleExists: boolean;
  readonly sampledSelections: number;
  readonly sampleFresh: boolean;
  readonly sampleFreshnessReason?: string;
  readonly namedEvaluatorJudgments?: number;
  readonly evictedReviewRows: number;
  readonly unverifiablePanelRows: number;
  readonly supersededPanelRows?: number;
  readonly mootOwnerDisagreements?: number;
  readonly overriddenPanelRejections?: number;
  readonly unconfirmedPanelRejections?: number;
  readonly unverifiablePanelReasons?: readonly string[];
  /** Applicability retains excluded current rows; superseded panels are counted separately. */
  readonly reviewStoreComplete?: boolean;
  readonly sampleStoreComplete?: boolean;
  readonly rawPanelRows?: number;
  readonly rawOwnerSampleRows?: number;
  readonly evictedPanelRows?: number;
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
 * the current primary judgment per selection (human outranks panel;
 * sample marks are independent). The evaluator/owner reported are from the most recent review
 * that carried them. Pure over its input; does no I/O.
 */
export function summarizeRemediationReviews(
  records: readonly ReviewRecord[],
  sample?: ReviewSample,
  samples?: readonly ReviewSample[]
): RemediationReviewSummary {
  const latest = currentRemediationJudgments(records);
  const { disagreements, ...history } = evaluateOwnerSampleHistory(
    summarySamples(sample, samples),
    records
  );

  let judgedSound = 0;
  const human = { n: 0, disagreements: 0 };
  const panel = { n: 0, disagreements: 0 };
  for (const r of latest.values()) {
    if (r.sound) judgedSound++;
    const counts = r.judgeKind === 'panel' ? panel : human;
    counts.n++;
    if (!r.sound) counts.disagreements++;
  }
  return {
    human,
    panel,
    sample: {
      n: summarizeOwnerSample(sample, records).n,
      disagreements,
    },
    ...history,
    sampleFresh: ownerSampleIsFresh(sample, records, summarySamples(sample, samples)),
    ...sampleOverrideDetails(sample, summarySamples(sample, samples), records),
    evictedReviewRows: 0,
    unverifiablePanelRows: 0,
    rawPanelRows: records.filter((r) => r.judgeKind === 'panel').length,
    supersededPanelRows: records.filter(
      (r) => r.judgeKind === 'panel' && latest.get(r.soakRef) !== r
    ).length,
    rawOwnerSampleRows: records.filter((r) => r.judgeKind === 'owner-sample').length,
    evictedPanelRows: 0,
    sampleExists: sample !== undefined,
    sampledSelections: sample?.refs.length ?? 0,
    judgedSelections: latest.size,
    namedEvaluatorJudgments: records.filter(isNamedHumanEvaluator).length,
    judgedSound,
    ...latestAttestation(records, panel.n > 0 ? sample : undefined),
  };
}

/** Default to the current draw only when no explicit history was supplied. */
function summarySamples(
  sample: ReviewSample | undefined,
  samples: readonly ReviewSample[] | undefined
): readonly ReviewSample[] {
  return samples ?? (sample === undefined ? [] : [sample]);
}

function isNamedHumanEvaluator(record: ReviewRecord): boolean {
  return (
    record.judgeKind !== 'panel' &&
    record.evaluator.trim() !== '' &&
    !/^panel:/i.test(record.evaluator.trim())
  );
}

/** Legacy human owner rows remain sign-offs; explicit annotations never attest. */
function isSignedHumanOwner(record: ReviewRecord): boolean {
  return (
    record.judgeKind !== 'panel' &&
    record.judgeKind !== 'owner-sample' &&
    record.ownerSignedOff !== false &&
    record.owner !== undefined
  );
}

function latestAttestation(
  records: readonly ReviewRecord[],
  sample?: ReviewSample
): Pick<RemediationReviewSummary, 'evaluator' | 'owner'> {
  // evaluator/owner = the attestation from the most RECENT review by reviewedAt,
  // selected deterministically (not by append/hydrate position) so the
  // named-evaluator/owner the enforce gate reads can't shift with file order.
  let evaluator: string | undefined;
  let owner: string | undefined;
  let evaluatorAt = '';
  let ownerAt = '';
  for (const r of records) {
    if (isNamedHumanEvaluator(r) && r.reviewedAt >= evaluatorAt) {
      evaluator = r.evaluator;
      evaluatorAt = r.reviewedAt;
    }
    if (isSignedHumanOwner(r) && r.reviewedAt >= ownerAt) {
      owner = r.owner;
      ownerAt = r.reviewedAt;
    }
  }
  const activeOwner = sample === undefined ? owner : ownerSampleSignOff(sample, records);
  return {
    ...(evaluator !== undefined ? { evaluator } : {}),
    ...(activeOwner !== undefined ? { owner: activeOwner } : {}),
  };
}

/** Preserve raw overridden rejections when verified evidence drops superseded panels. */
function sampleOverrideDetails(
  sample: ReviewSample | undefined,
  samples: readonly ReviewSample[],
  records: readonly ReviewRecord[]
): { sampleFresh?: false; sampleFreshnessReason?: string } {
  const reason = ownerSampleOverrideFailure(sample, samples, records);
  return reason === undefined ? {} : { sampleFresh: false, sampleFreshnessReason: reason };
}

/** Read + summarize the durable review evidence from disk (convenience for #3764). */
export function readRemediationReviewSummary(
  store: RemediationReviewStore = getRemediationReviewStore(),
  samples: RemediationReviewSampleStore = getRemediationReviewSampleStore(),
  rawSoakLines: readonly string[] = readRawSoakLines()
): RemediationReviewSummary {
  const rawRecords = store.getRecords();
  const verified = verifyRemediationReviewEvidence(rawRecords, rawSoakLines);
  const history = samples.getRecords();
  const summary = summarizeRemediationReviews(verified.records, history.at(-1), history);
  const { disagreements, ...ownerHistory } = evaluateOwnerSampleHistory(history, rawRecords);
  return {
    ...summary,
    sample: {
      ...summary.sample,
      disagreements,
    },
    ...ownerHistory,
    ...sampleOverrideDetails(history.at(-1), history, rawRecords),
    reviewStoreComplete: store.hydrationComplete ?? true,
    sampleStoreComplete: samples.hydrationComplete ?? true,
    rawPanelRows: rawRecords.filter((r) => r.judgeKind === 'panel').length,
    rawOwnerSampleRows: rawRecords.filter((r) => r.judgeKind === 'owner-sample').length,
    evictedPanelRows: verified.evictedPanelRows,
    evictedReviewRows: verified.evictedReviewRows,
    unverifiablePanelRows: verified.unverifiablePanelRows,
    supersededPanelRows: verified.supersededPanelRows,
    unverifiablePanelReasons: verified.unverifiablePanelReasons,
  };
}

/** Current primary evidence only, plus retained owner marks from every sample. */
export function readRemediationReviewRecords(
  store: RemediationReviewStore = getRemediationReviewStore(),
  rawSoakLines: readonly string[] = readRawSoakLines(),
  indexedSoakLines?: ReadonlyMap<string, string>,
  retainOverriddenRejections = false
): readonly ReviewRecord[] {
  return verifyRemediationReviewEvidence(
    store.getRecords(),
    rawSoakLines,
    indexedSoakLines,
    retainOverriddenRejections
  ).records;
}

function readRawSoakLines(): readonly string[] {
  try {
    return readFileSync(getRemediationSoakFile(), 'utf-8').split('\n');
  } catch {
    return [];
  }
}

/**
 * The soak selections that have NOT yet been reviewed — the pending queue the
 * CLI `list` surface shows. Pure over its inputs.
 */
export function pendingSoakSelections(
  soak: readonly Pick<RemediationSoakRecord, 'signalKey' | 'timestamp'>[],
  reviews: readonly ReviewRecord[]
): readonly { soakRef: string; signalKey: string; timestamp: string }[] {
  const reviewed = new Set(
    reviews.filter((r) => r.judgeKind !== 'owner-sample').map((r) => r.soakRef)
  );
  const out: { soakRef: string; signalKey: string; timestamp: string }[] = [];
  for (const s of soak) {
    const soakRef = soakRefOf(s);
    if (!reviewed.has(soakRef)) {
      out.push({ soakRef, signalKey: s.signalKey, timestamp: s.timestamp });
    }
  }
  return out;
}
