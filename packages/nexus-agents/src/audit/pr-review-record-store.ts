/**
 * nexus-agents/audit - PR-Review Audit Record Store (#3831, Epic B).
 *
 * Reads/builds the COMMITTABLE, append-only, tamper-evident pr-review ledger at
 * `<repo-root>/governance/pr-review-records.jsonl` so the WARN-FIRST governor-
 * review gate (`scripts/check-governor-review.ts`, #3831) can QUERY it from CI:
 * does a sha-bound, verified review exist for THIS PR's number AND head sha?
 *
 * SCOPE (#3831 Stage 1). This module deliberately exposes only the PURE builder
 * ({@link buildPrReviewRecord}) and the READER ({@link readPrReviewRecords}) plus
 * the path resolution — the seam the gate and tests need. The PRODUCER (pr_review
 * writing records as a side effect, the caller-commits flow shared with #3927) is
 * a tracked FOLLOW-ON and intentionally NOT wired here, so this stage adds the
 * gate + schema + verification without changing the pr_review write path.
 *
 * MERGE SAFETY (mirrors #3927). The ledger is a SET, not a chain: `sequence` is
 * assigned as (max existing sequence)+1, and the self-hash excludes
 * `previousHash`, so two branches that each append from the same tip merge
 * conflict-free under the `governance/pr-review-records.jsonl merge=union`
 * attribute. Duplicate sequences from such a merge are a benign fork signal.
 *
 * @module audit/pr-review-record-store
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { findRepoRoot } from '../config/repo-root-detection.js';

import type { PrReviewRecord, PrReviewVerdict, PrReviewVoteCounts } from './pr-review-record.js';
import { PrReviewRecordSchema, computePrReviewRecordHash } from './pr-review-record.js';

/** Repo-relative committable artifact path (read by the gate/CI). */
export const PR_REVIEW_RECORDS_REL_PATH = 'governance/pr-review-records.jsonl';

/**
 * Env var to force the artifact path (mirrors #3927's `NEXUS_VOTE_RECORDS_PATH`).
 * When set non-empty it is used directly (resolved to an absolute path) and the
 * cwd/{@link findRepoRoot} detection is skipped — the escape hatch for the
 * future producer running outside the repo (e.g. co-located/CI contexts).
 */
export const PR_REVIEW_RECORDS_PATH_ENV = 'NEXUS_PR_REVIEW_RECORDS_PATH';

/** Max summary chars retained in the human record. */
const MAX_SUMMARY_RECORD_CHARS = 500;

/** Inputs for {@link buildPrReviewRecord} — the finalized review data. */
export interface BuildPrReviewRecordInput {
  readonly prNumber: number;
  /** The 40-hex head commit SHA the review was run against (sha-binding). */
  readonly headSha: string;
  readonly verdict: PrReviewVerdict;
  readonly verified: boolean;
  readonly voteCounts: PrReviewVoteCounts;
  readonly summary: string;
  readonly correlationId?: string | undefined;
  readonly recordedAt?: string | undefined;
  /**
   * Monotonic sequence number for this record. Defaults to 0 (first record)
   * when omitted; the future producer supplies (max existing sequence)+1.
   */
  readonly sequence?: number | undefined;
  /**
   * Advisory tip hash (audit texture only). NOT covered by the self-hash and
   * NOT verified — retained so a reviewer can see the write-time tip.
   */
  readonly previousHash?: string | undefined;
}

/**
 * Construct a fully self-hashed {@link PrReviewRecord} from a completed review.
 * Pure (no I/O) so it is unit-testable and reusable by the gate seam and the
 * future producer. The self-hash covers `prNumber`/`headSha`/`verdict`/`sequence`
 * (the sha-binding, condition 1) but EXCLUDES `previousHash`. The summary is
 * stored truncated.
 */
export function buildPrReviewRecord(input: BuildPrReviewRecordInput): PrReviewRecord {
  const summaryTruncated =
    input.summary.length > MAX_SUMMARY_RECORD_CHARS
      ? input.summary.slice(0, MAX_SUMMARY_RECORD_CHARS) + '...'
      : input.summary;
  const payload: Omit<PrReviewRecord, 'hash'> = {
    version: '1.0',
    sequence: input.sequence ?? 0,
    prNumber: input.prNumber,
    headSha: input.headSha,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    verdict: input.verdict,
    verified: input.verified,
    voteCounts: {
      approve: input.voteCounts.approve,
      request_changes: input.voteCounts.request_changes,
      abstain: input.voteCounts.abstain,
      error: input.voteCounts.error,
      total: input.voteCounts.total,
    },
    summary: summaryTruncated,
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.previousHash !== undefined ? { previousHash: input.previousHash } : {}),
  };
  return { ...payload, hash: computePrReviewRecordHash(payload) };
}

/**
 * Resolve the committable artifact path (mirrors #3927). Precedence:
 *  1. {@link PR_REVIEW_RECORDS_PATH_ENV} when set non-empty — a RELATIVE value is
 *     resolved against `process.cwd()` to an absolute path; an already-absolute
 *     value is returned unchanged.
 *  2. otherwise `<repo-root>/governance/pr-review-records.jsonl` resolved from
 *     {@link findRepoRoot}(`process.cwd()`).
 * Returns `undefined` when neither yields a path. A whitespace-only override is
 * treated as unset (falls through to root detection).
 */
export function resolvePrReviewRecordsPath(): string | undefined {
  const envPath = process.env[PR_REVIEW_RECORDS_PATH_ENV];
  if (envPath !== undefined && envPath.trim() !== '') {
    return isAbsolute(envPath) ? envPath : resolve(envPath);
  }
  const root = findRepoRoot(process.cwd());
  if (root === null) return undefined;
  return join(root, PR_REVIEW_RECORDS_REL_PATH);
}

/**
 * Read the persisted pr-review record set from disk. The GATE SEAM (#3831):
 * `check-governor-review.ts` reads these records, verifies the set
 * ({@link verifyPrReviewRecordSet}), and queries for a record matching the PR's
 * number AND head sha. File-line order is NOT significant (the records are a
 * set). Returns the parsed records and any line that failed to parse.
 */
export function readPrReviewRecords(filePath: string): {
  readonly records: PrReviewRecord[];
  readonly invalidLines: number[];
} {
  const records: PrReviewRecord[] = [];
  const invalidLines: number[] = [];
  if (!existsSync(filePath)) return { records, invalidLines };
  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    try {
      const parsed = PrReviewRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) records.push(parsed.data);
      else invalidLines.push(i + 1);
    } catch {
      invalidLines.push(i + 1);
    }
  }
  return { records, invalidLines };
}
