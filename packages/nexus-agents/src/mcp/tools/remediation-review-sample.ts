/**
 * Owner-sample model (the sole definition of judgment identity and history).
 * A sample is {sampleId, owner, drawnAt, refs}; persisted names are id/sampledAt,
 * with panel snapshots retained as provenance. An owner judgment has judgeKind
 * 'owner-sample', sampleId === sample.id and evaluator === sample.owner. The
 * mark's --owner annotation is NOT judgment identity; it is used only for the
 * separate explicit sign-off. Sample-bound marks (including legacy human-kind
 * non-owner marks) never become primary human re-judgments.
 *
 * Primary judgments exclude sample marks. Human re-judgment outranks panel;
 * within each kind the last appended judgment wins. Disagreement belongs to
 * (sampleId, ref), originates against the drawn panel snapshot, and resolves only
 * on a later valid mark in THAT sample agreeing with the current primary row,
 * after that row (timestamp, then append order). Another sample can never clear it. Unresolved disagreements
 * with superseded panels are moot, reported separately, never stale failures.
 *
 * Current panels require a fully owner-judged sample drawn strictly after the
 * newest current panel. Without current panels agreement is n/a regardless of
 * sample history, except every panel rejection overridden to sound by a human
 * needs a subsequent owner confirmation in a recorded sample; a later dissent
 * in that sample revokes its confirmation. Sign-off copies preserve judgment time
 * and order, since attestation is not re-judgment. Such rejected
 * panels remain drawable for confirmation even after supersession. Every
 * unconfirmed override is mandatory in addition to the n random current-panel
 * refs; overrides never consume that quota. A draw missing a newly unconfirmed
 * override is stale and must be redrawn to include it.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { JsonlStore } from '../../config/jsonl-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import type { JudgmentCounts, ReviewRecord } from './remediation-review.js';

const PanelSnapshotSchema = z.object({
  soakRef: z.string(),
  voteRecordId: z.string().min(1),
  soakRecordHash: z.string().regex(/^[a-f0-9]{64}$/),
  sound: z.boolean(),
});
export const ReviewSampleSchema = z
  .object({
    id: z.string().min(1),
    seed: z.string().min(1),
    owner: z.string().trim().min(1),
    sampledAt: z.string(),
    refs: z.array(z.string()),
    /** Present on new draws; legacy draws remain readable. */
    randomRefs: z.array(z.string()).optional(),
    mandatoryOverrideRefs: z.array(z.string()).optional(),
    panels: z.array(PanelSnapshotSchema),
  })
  .refine(
    (s) =>
      new Set(s.refs).size === s.refs.length &&
      s.refs.length === s.panels.length &&
      s.refs.every((ref, i) => s.panels[i]?.soakRef === ref),
    { message: 'Sample refs must be distinct and bound to panel snapshots' }
  );
export type ReviewSample = z.infer<typeof ReviewSampleSchema>;
export interface RemediationReviewSampleStore {
  readonly hydrationComplete?: boolean;
  record(sample: ReviewSample): boolean;
  getRecords(): readonly ReviewSample[];
}

export function createRemediationReviewSampleStore(
  filePath: string = nexusDataPath('learning', 'remediation-review-samples.jsonl')
): RemediationReviewSampleStore {
  const store = new JsonlStore<ReviewSample>({
    filePath,
    schema: ReviewSampleSchema,
    // Samples are decision evidence: rotation must never erase a disagreement.
    maxRecords: Number.MAX_SAFE_INTEGER,
    component: 'RemediationReviewSampleStore',
  });
  return {
    get hydrationComplete() {
      return store.hydrationComplete;
    },
    record: (sample) => store.hydrationComplete && store.append(sample),
    getRecords: () => store.all(),
  };
}

/** No cached singleton: each read reflects the latest owner's persisted draw. */
export function getRemediationReviewSampleStore(): RemediationReviewSampleStore {
  return createRemediationReviewSampleStore();
}

/** Crypto-generated seed plus SHA256 rankings make the draw reproducible independent of log order. */
export function drawRemediationReviewSample(
  records: readonly ReviewRecord[],
  n: number,
  owner: string,
  seed: string = randomBytes(32).toString('hex'),
  samples: readonly ReviewSample[] = []
): ReviewSample {
  z.number().int().positive().parse(n);
  owner = z.string().trim().min(1).parse(owner);
  z.string().min(1).parse(seed);
  const current = currentRemediationJudgments(records);
  const candidates = [...current.values()].filter((r) => r.judgeKind === 'panel');
  const unconfirmed = new Set(
    evaluateOwnerSampleHistory(samples, records).unconfirmedPanelRejectionRefs
  );
  const overrides = [
    ...new Map(
      overriddenPanelRejections(records, current)
        .filter((row) => unconfirmed.has(row.soakRef))
        .map((row) => [row.soakRef, row])
    ).values(),
  ];
  const rank = (ref: string): string =>
    createHash('sha256')
      .update(JSON.stringify([seed, ref]))
      .digest('hex');
  candidates.sort(
    (a, b) => rank(a.soakRef).localeCompare(rank(b.soakRef)) || a.soakRef.localeCompare(b.soakRef)
  );
  overrides.sort((a, b) => a.soakRef.localeCompare(b.soakRef));
  const random = candidates.slice(0, n);
  const panels = [...random, ...overrides].map((r) => PanelSnapshotSchema.parse(r));
  return {
    id: randomUUID(),
    seed,
    owner,
    sampledAt: new Date().toISOString(),
    refs: panels.map((p) => p.soakRef),
    randomRefs: random.map((row) => row.soakRef),
    mandatoryOverrideRefs: overrides.map((row) => row.soakRef),
    panels,
  };
}

/** Names are free text, like named-evaluator/owner criteria: consistency, not identity. */
export function isOwnerSampleMark(sample: ReviewSample, mark: ReviewRecord): boolean {
  return (
    mark.judgeKind === 'owner-sample' &&
    mark.sampleId === sample.id &&
    mark.evaluator === sample.owner &&
    sample.refs.includes(mark.soakRef)
  );
}

/** One primary judgment per ref: human outranks panel, sample marks are independent. */
export function currentRemediationJudgments(
  records: readonly ReviewRecord[]
): Map<string, ReviewRecord> {
  const current = new Map<string, ReviewRecord>();
  for (const row of records) {
    if (row.judgeKind === 'owner-sample' || row.sampleId !== undefined) continue;
    if (
      row.judgeKind === 'panel' &&
      current.get(row.soakRef)?.judgeKind !== 'panel' &&
      current.has(row.soakRef)
    )
      continue;
    current.set(row.soakRef, row);
  }
  return current;
}

function ownerSampleJudgments(
  sample: ReviewSample,
  records: readonly ReviewRecord[]
): Map<string, ReviewRecord> {
  const current = currentRemediationJudgments(records);
  const marks = new Map<string, ReviewRecord>();
  const positions = judgmentPositions(records);
  for (const mark of chronologicalReviews(records)) {
    if (!isOwnerSampleMark(sample, mark)) continue;
    const primary = current.get(mark.soakRef);
    if (judgmentFollows(mark, primary, positions)) marks.set(mark.soakRef, mark);
  }
  return marks;
}

function chronologicalReviews(records: readonly ReviewRecord[]): readonly ReviewRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => a.record.reviewedAt.localeCompare(b.record.reviewedAt) || a.index - b.index)
    .map(({ record }) => record);
}

/** Explicit sign-off copies attest the same judgment, retaining its original event order. */
function judgmentPositions(records: readonly ReviewRecord[]): ReadonlyMap<ReviewRecord, number> {
  const first = new Map<string, number>();
  const positions = new Map<ReviewRecord, number>();
  records.forEach((row, index) => {
    const key = judgmentKey(row);
    const original = first.get(key) ?? index;
    first.set(key, original);
    positions.set(row, row.ownerSignedOff === true ? original : index);
  });
  return positions;
}

function judgmentKey(row: ReviewRecord): string {
  return JSON.stringify([
    row.soakRef,
    row.judgeKind ?? 'human',
    row.sampleId,
    row.evaluator,
    row.reviewedAt,
    row.sound,
  ]);
}

/** Verification must retain the judgment that an explicit sign-off copy attests. */
export function isJudgmentAttestationSource(
  row: ReviewRecord,
  primary: ReviewRecord | undefined
): boolean {
  return primary?.ownerSignedOff === true && judgmentKey(row) === judgmentKey(primary);
}

function judgmentFollows(
  mark: ReviewRecord,
  primary: ReviewRecord | undefined,
  positions: ReadonlyMap<ReviewRecord, number>
): boolean {
  if (primary === undefined) return false;
  return (
    mark.reviewedAt > primary.reviewedAt ||
    (mark.reviewedAt === primary.reviewedAt &&
      (positions.get(mark) ?? -1) > (positions.get(primary) ?? -1))
  );
}

/** Retain every rejected panel row overridden to sound, including unverifiable history. */
export function isOverriddenPanelRejection(
  row: ReviewRecord,
  current: ReadonlyMap<string, ReviewRecord>
): boolean {
  const primary = current.get(row.soakRef);
  return (
    row.judgeKind === 'panel' &&
    !row.sound &&
    primary?.judgeKind !== 'panel' &&
    primary?.sound === true
  );
}

function overriddenPanelRejections(
  records: readonly ReviewRecord[],
  current: ReadonlyMap<string, ReviewRecord>
): readonly ReviewRecord[] {
  return records.filter((row) => isOverriddenPanelRejection(row, current));
}

export interface OwnerSampleHistory {
  readonly disagreements: number;
  readonly mootOwnerDisagreements: number;
  readonly overriddenPanelRejections: number;
  readonly unconfirmedPanelRejections: number;
  readonly unconfirmedPanelRejectionRefs: readonly string[];
}

/** Derive disagreement and override evidence from raw history, never the filtered panel set. */
export function evaluateOwnerSampleHistory(
  samples: readonly ReviewSample[],
  records: readonly ReviewRecord[]
): OwnerSampleHistory {
  const current = currentRemediationJudgments(records);
  const unresolved = new Map<string, string>();
  const confirmations = new Map<string, string>();
  const positions = judgmentPositions(records);
  const draws = new Map(samples.map((sample) => [sample.id, sample]));
  for (const mark of chronologicalReviews(records)) {
    const snapshot = snapshotForOwnerMark(draws, mark);
    if (snapshot === undefined) continue;
    const key = JSON.stringify([mark.sampleId, mark.soakRef]);
    const primary = current.get(mark.soakRef);
    const follows = judgmentFollows(mark, primary, positions);
    const agrees = follows && mark.sound === primary?.sound;
    if (agrees) {
      unresolved.delete(key);
      if (primary.judgeKind !== 'panel') confirmations.set(key, mark.soakRef);
    } else {
      confirmations.delete(key);
      if (follows || mark.sound !== snapshot.sound) unresolved.set(key, mark.soakRef);
    }
  }
  const refs = [...unresolved.values()];
  const overrides = overriddenPanelRejections(records, current);
  const confirmedRefs = new Set(confirmations.values());
  return {
    disagreements: refs.filter((ref) => current.get(ref)?.judgeKind === 'panel').length,
    mootOwnerDisagreements: refs.filter((ref) => current.get(ref)?.judgeKind !== 'panel').length,
    overriddenPanelRejections: overrides.length,
    unconfirmedPanelRejections: overrides.filter((row) => !confirmedRefs.has(row.soakRef)).length,
    unconfirmedPanelRejectionRefs: [
      ...new Set(
        overrides.filter((row) => !confirmedRefs.has(row.soakRef)).map((row) => row.soakRef)
      ),
    ],
  };
}

/** A recorded draw cannot cover an unconfirmed override it never included. */
export function ownerSampleOverrideFailure(
  sample: ReviewSample | undefined,
  samples: readonly ReviewSample[],
  records: readonly ReviewRecord[]
): string | undefined {
  if (sample === undefined) return undefined;
  const missing = evaluateOwnerSampleHistory(samples, records).unconfirmedPanelRejectionRefs.filter(
    (ref) => !sample.refs.includes(ref)
  );
  return missing.length === 0
    ? undefined
    : `stale owner sample — unconfirmed human override absent from draw: ${missing.join(', ')}`;
}

/** Strict freshness applies only to current panels; absence is handled as n/a by readiness. */
export function ownerSampleIsFresh(
  sample: ReviewSample | undefined,
  records: readonly ReviewRecord[],
  samples: readonly ReviewSample[] = []
): boolean {
  if (ownerSampleOverrideFailure(sample, samples, records) !== undefined) return false;
  const panels = [...currentRemediationJudgments(records).values()].filter(
    (row) => row.judgeKind === 'panel'
  );
  if (sample === undefined || panels.length === 0) return false;
  const drawnAt = Date.parse(sample.sampledAt);
  return (
    Number.isFinite(drawnAt) &&
    panels.every((row) => {
      const judgedAt = Date.parse(row.reviewedAt);
      return Number.isFinite(judgedAt) && drawnAt > judgedAt;
    })
  );
}

export function pendingSampleRefs(
  sample: ReviewSample,
  records: readonly ReviewRecord[]
): readonly string[] {
  if (sample.refs.length === 0) return []; // Empty draw has no pending refs; readiness still fails sample minimum.
  const marks = ownerSampleJudgments(sample, records);
  return sample.refs.filter((ref) => !marks.has(ref));
}

export function summarizeOwnerSample(
  sample: ReviewSample | undefined,
  records: readonly ReviewRecord[]
): JudgmentCounts {
  if (sample === undefined || sample.refs.length === 0) return { n: 0, disagreements: 0 };
  const marks = ownerSampleJudgments(sample, records);
  const current = currentRemediationJudgments(records);
  let n = 0;
  let disagreements = 0;
  for (const panel of sample.panels) {
    const mark = marks.get(panel.soakRef);
    if (mark === undefined) continue;
    n++;
    if (mark.sound !== current.get(panel.soakRef)?.sound) disagreements++;
  }
  return { n, disagreements };
}

/** Current-panel disagreements only; superseded-ref disagreements are separately moot. */
export function summarizeOwnerSampleHistory(
  samples: readonly ReviewSample[],
  records: readonly ReviewRecord[]
): number {
  return evaluateOwnerSampleHistory(samples, records).disagreements;
}

function snapshotForOwnerMark(
  draws: ReadonlyMap<string, ReviewSample>,
  mark: ReviewRecord
): z.infer<typeof PanelSnapshotSchema> | undefined {
  if (mark.sampleId === undefined) return undefined;
  const sample = draws.get(mark.sampleId);
  if (sample === undefined || !isOwnerSampleMark(sample, mark)) return undefined;
  return sample.panels.find((panel) => panel.soakRef === mark.soakRef);
}

/** An owner attests only the complete active sample, with its recorded name on each mark. */
export function ownerSampleSignOff(
  sample: ReviewSample,
  records: readonly ReviewRecord[]
): string | undefined {
  if (sample.refs.length === 0) return undefined;
  const marks = ownerSampleJudgments(sample, records);
  let owner: string | undefined;
  for (const ref of sample.refs) {
    const mark = marks.get(ref);
    const markOwner = mark?.owner;
    if (markOwner !== sample.owner || mark?.ownerSignedOff !== true) return undefined;
    if (owner !== undefined && owner !== markOwner) return undefined;
    owner = markOwner;
  }
  return owner;
}
