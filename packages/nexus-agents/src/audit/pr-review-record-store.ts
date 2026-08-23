/**
 * nexus-agents/audit - PR-Review Audit Record Store (#3831, Epic B).
 *
 * Reads/builds the COMMITTABLE, append-only, tamper-evident pr-review ledger at
 * `<repo-root>/governance/pr-review-records.jsonl` so the WARN-FIRST governor-
 * review gate (`scripts/check-governor-review.ts`, #3831) can QUERY it from CI:
 * does a sha-bound, verified review exist for THIS PR's number AND head sha?
 *
 * SCOPE. Stage 1 (#3831) added the PURE builder ({@link buildPrReviewRecord}) and
 * the READER ({@link readPrReviewRecords}) plus path resolution — the seam the gate
 * and tests need. Stage 2 (#4031) adds the PRODUCER ({@link persistPrReviewRecord},
 * mirroring `persistVoteRecord`): pr_review writes a record as a best-effort side
 * effect so the warn-first gate can finally find authentic, diff-bound records (the
 * prerequisite to ever flipping it from warn to enforce). Persistence never throws
 * into the review path.
 *
 * MERGE SAFETY (mirrors #3927). The ledger is a SET, not a chain: `sequence` is
 * assigned as (max existing sequence)+1, and the self-hash excludes
 * `previousHash`, so two branches that each append from the same tip merge
 * conflict-free under the `governance/pr-review-records.jsonl merge=union`
 * attribute. Duplicate sequences from such a merge are a benign fork signal.
 *
 * @module audit/pr-review-record-store
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { findRepoRoot } from '../config/repo-root-detection.js';
import type { ILogger } from '../core/index.js';
import { createLogger, getErrorMessage } from '../core/index.js';

import type {
  PrReviewDiffProvenance,
  PrReviewRecord,
  PrReviewVerdict,
  PrReviewVoteCounts,
} from './pr-review-record.js';
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
  /** The 40-hex BASE commit SHA the reviewed diff range was computed from (Option-C). */
  readonly baseSha: string;
  /** sha256 of the canonical reviewed diff (`audit/reviewed-diff-hash.ts`) — diff-binding. */
  readonly reviewedDiffHash: string;
  readonly verdict: PrReviewVerdict;
  readonly verified: boolean;
  readonly voteCounts: PrReviewVoteCounts;
  readonly summary: string;
  readonly correlationId?: string | undefined;
  readonly recordedAt?: string | undefined;
  /**
   * What the reviewed diff was DERIVED FROM (#4459). Optional here because the
   * schema field is optional (a record written without it must still parse and
   * still hash as it did pre-#4459). Producers that KNOW their provenance —
   * both in-tree ones do — must pass it; omitting it is a record that declines
   * to say, never a record that is `canonical-git`.
   */
  readonly diffProvenance?: PrReviewDiffProvenance | undefined;
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
 * future producer. The self-hash covers `prNumber`/`baseSha`/`reviewedDiffHash`/
 * `verdict`/`sequence` (the diff-binding, Option-C) but EXCLUDES `previousHash`.
 * The summary is stored truncated.
 */
export function buildPrReviewRecord(input: BuildPrReviewRecordInput): PrReviewRecord {
  const summaryTruncated =
    input.summary.length > MAX_SUMMARY_RECORD_CHARS
      ? input.summary.slice(0, MAX_SUMMARY_RECORD_CHARS) + '...'
      : input.summary;
  const payload: Omit<PrReviewRecord, 'hash'> = {
    version: '1.2',
    sequence: input.sequence ?? 0,
    prNumber: input.prNumber,
    baseSha: input.baseSha,
    reviewedDiffHash: input.reviewedDiffHash,
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
    ...(input.diffProvenance !== undefined ? { diffProvenance: input.diffProvenance } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.previousHash !== undefined ? { previousHash: input.previousHash } : {}),
  };
  return { ...payload, hash: computePrReviewRecordHash(payload) };
}

/** True when running under a test runner (vitest sets `VITEST`). */
function isUnderTestRunner(): boolean {
  return process.env['VITEST'] !== undefined || process.env['NODE_ENV'] === 'test';
}

/**
 * Refuse to WRITE the source checkout's own tracked chain from a test (#4415).
 *
 * `governance/pr-review-records.jsonl` is tracked and hash-chained. During
 * #4412 a test appended three fabricated verdicts to it — they chained
 * correctly onto each other, so `verify_audit_chain` would have read a valid
 * chain containing fake reviews. They were noticed only because `git status`
 * showed a tracked file dirty before a commit.
 *
 * A fabricated record that hash-chains cleanly is worse than a corrupt file:
 * it is indistinguishable from a real one. The threat model already scopes the
 * chain as tamper-*evident*, which only holds if we do not manufacture
 * plausible entries ourselves.
 *
 * Guards the DESTINATION, not how it was derived — an explicit `filePath` or
 * env var pointing at the same file is the same harm. Resolution itself stays
 * unguarded: `resolvePrReviewRecordsPath` is a query, and tests legitimately
 * assert its fall-through behaviour (#4278/#4312) without writing anything.
 *
 * A throwaway repo — the shape a legitimate persistence test uses — is
 * untouched.
 */
function assertNotSourceCheckoutWrite(filePath: string): void {
  if (!isUnderTestRunner()) return;
  const here = findRepoRoot(process.cwd());
  if (here === null) return;
  if (resolve(filePath) !== resolve(join(here, PR_REVIEW_RECORDS_REL_PATH))) return;
  throw new Error(
    `Refusing to write ${filePath} from a test run (#4415): this is the source ` +
      "checkout's tracked, hash-chained audit file, and a fabricated record that " +
      'chains cleanly is indistinguishable from a real verdict. Pass repoPath to a ' +
      'throwaway repo, or set NEXUS_PR_REVIEW_RECORDS_PATH.'
  );
}

/**
 * Resolve the committable artifact path (mirrors #3927). Precedence:
 *  1. {@link PR_REVIEW_RECORDS_PATH_ENV} when set non-empty — a RELATIVE value is
 *     resolved against `process.cwd()` to an absolute path; an already-absolute
 *     value is returned unchanged. Operator-trust (set at process start):
 *     intentionally UNRESTRICTED — no repo-root check.
 *  2. otherwise, when `repoPathOverride` is a non-whitespace string (#4278 —
 *     threaded from the pr_review tool's optional `repoPath` input) AND it
 *     resolves to a REAL repo root ({@link findRepoRoot} finds a `.git`
 *     ancestor from it), `<that root>/`{@link PR_REVIEW_RECORDS_REL_PATH} is
 *     used. Call-time input is NOT operator-trust — any MCP client can supply
 *     `repoPath`, so (unlike the env var) it is constrained to a real repo
 *     root rather than accepted as an arbitrary writable directory (security
 *     review on #4312: an unconstrained override would let a caller redirect
 *     the producer's `mkdirSync`+`appendFileSync` to any path the process can
 *     write, e.g. `repoPath: '/var/www/html'`). An override that is NOT a real
 *     repo root is NOT used — falls through to tier 3, never to an arbitrary
 *     directory.
 *  3. otherwise `<repo-root>/governance/pr-review-records.jsonl` resolved from
 *     {@link findRepoRoot}(`process.cwd()`).
 * Returns `undefined` when none of the above yields a path. A whitespace-only
 * env value is treated as unset (falls through to the next tier).
 */
export function resolvePrReviewRecordsPath(repoPathOverride?: string): string | undefined {
  const envPath = process.env[PR_REVIEW_RECORDS_PATH_ENV];
  if (envPath !== undefined && envPath.trim() !== '') {
    // Explicit target — the caller has stated where it wants records to land.
    return isAbsolute(envPath) ? envPath : resolve(envPath);
  }

  if (repoPathOverride !== undefined && repoPathOverride.trim() !== '') {
    const overrideRoot = findRepoRoot(repoPathOverride);
    if (overrideRoot !== null) return join(overrideRoot, PR_REVIEW_RECORDS_REL_PATH);
    // Not a real repo root — do NOT write to an arbitrary directory; fall
    // through to cwd detection below.
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

/**
 * Read the ledger tip: the maximum existing `sequence` and the advisory last-line
 * hash. Mirrors the vote-record store's `readLedgerTip` (#3927). The producer
 * assigns the next record `sequence = maxSequence + 1` and records `previousHash`
 * as the last line's hash (advisory audit texture; NOT covered by the self-hash,
 * so concurrent appends from the same tip stay merge-safe under `merge=union`).
 * Returns `{ maxSequence: -1, lastHash: undefined }` for a missing/empty/unreadable
 * ledger — a tip read must never fail the producer that follows.
 */
function readPrReviewLedgerTip(
  filePath: string,
  logger: ILogger
): { maxSequence: number; lastHash: string | undefined } {
  if (!existsSync(filePath)) return { maxSequence: -1, lastHash: undefined };
  try {
    const { records } = readPrReviewRecords(filePath);
    if (records.length === 0) return { maxSequence: -1, lastHash: undefined };
    let maxSequence = -1;
    for (const record of records) {
      if (record.sequence > maxSequence) maxSequence = record.sequence;
    }
    const last = records[records.length - 1];
    return { maxSequence, lastHash: last?.hash };
  } catch (error: unknown) {
    logger.warn('Failed to read pr-review-record ledger tip', { error: getErrorMessage(error) });
    return { maxSequence: -1, lastHash: undefined };
  }
}

/** Options for {@link persistPrReviewRecord}. `sequence`/`previousHash` are assigned by the store. */
export interface PersistPrReviewRecordOptions extends Omit<
  BuildPrReviewRecordInput,
  'previousHash' | 'sequence'
> {
  /**
   * Override the artifact path; takes precedence over {@link PR_REVIEW_RECORDS_PATH_ENV}
   * and the {@link resolvePrReviewRecordsPath} resolution.
   */
  readonly filePath?: string | undefined;
  /**
   * Repo-root override (#4278) forwarded to {@link resolvePrReviewRecordsPath}
   * when `filePath` is not given. Sits below {@link PR_REVIEW_RECORDS_PATH_ENV}
   * but above `findRepoRoot(process.cwd())` in the resolution precedence.
   * Call-time input (not operator-trust): only honored when it resolves to a
   * REAL repo root (a `.git` ancestor); otherwise ignored and the resolver
   * falls through to cwd detection — see that function's doc comment.
   */
  readonly repoPathOverride?: string | undefined;
  readonly logger?: ILogger | undefined;
}

/**
 * Persist an authentic pr-review record (#4031, the #3831 Stage-2 producer that
 * Stage 1 deferred). Best-effort and append-only: reads the ledger tip (max
 * sequence + advisory last hash), assigns the next monotonic `sequence`, builds a
 * self-hashed {@link PrReviewRecord} binding {prNumber, baseSha, reviewedDiffHash,
 * verdict}, and appends one JSON line. Returns the written record — or `undefined`
 * when the path could not be resolved or the write failed. Persistence NEVER
 * throws into the review path (an audit sink must not break the operation it
 * observes), mirroring {@link persistVoteRecord} and the warn-first posture of the
 * gate this feeds.
 *
 * AUTHENTICITY (the load-bearing invariant the design vote flagged): the caller
 * MUST pass `reviewedDiffHash` computed over the EXACT diff the voters reviewed
 * (`computeReviewedDiffHash(prDiff)`), never a re-fetched/drifted diff — an
 * authentic-looking record bound to the wrong artifact is worse than no record.
 * `baseSha` is CALLER-ASSERTED and NOT cross-validated against the diff here; for
 * the current warn-first phase this is acceptable, but a future warn→enforce flip
 * (#3831) MUST NOT treat `baseSha` as verified provenance without adding that check.
 *
 * Path precedence: `opts.filePath` > {@link PR_REVIEW_RECORDS_PATH_ENV} >
 * `opts.repoPathOverride` > {@link resolvePrReviewRecordsPath}'s
 * `findRepoRoot(process.cwd())` fallback.
 */
export function persistPrReviewRecord(
  opts: PersistPrReviewRecordOptions
): PrReviewRecord | undefined {
  const logger = opts.logger ?? createLogger({ component: 'pr-review-record-store' });
  const filePath = opts.filePath ?? resolvePrReviewRecordsPath(opts.repoPathOverride);
  if (filePath === undefined) {
    logger.warn('Cannot persist pr-review record: no records path resolved', {
      prNumber: opts.prNumber,
    });
    return undefined;
  }
  // Before the try: a swallowed guard would silently skip the write and hide
  // the very mistake it exists to surface.
  assertNotSourceCheckoutWrite(filePath);

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const { maxSequence, lastHash } = readPrReviewLedgerTip(filePath, logger);
    const record = buildPrReviewRecord({
      ...opts,
      sequence: maxSequence + 1,
      previousHash: lastHash,
    });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
    logger.info('Persisted authentic pr-review record', {
      prNumber: record.prNumber,
      verdict: record.verdict,
      sequence: record.sequence,
      path: filePath,
    });
    return record;
  } catch (error: unknown) {
    logger.warn('Failed to persist authentic pr-review record', {
      error: getErrorMessage(error),
      prNumber: opts.prNumber,
      path: filePath,
    });
    return undefined;
  }
}
