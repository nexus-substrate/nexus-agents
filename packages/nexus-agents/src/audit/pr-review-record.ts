/**
 * nexus-agents/audit - PR-Review Audit Record (#3831, Epic B — governance of
 * the governor).
 *
 * A committed, append-only, tamper-EVIDENT record of a completed `pr_review`
 * over a GOVERNOR-PATH PR, persisted so a WARN-FIRST CI gate
 * (`scripts/check-governor-review.ts`, #3831) can assert that a PR touching the
 * governor's own paths (the /CODEOWNERS governance-of-the-governor list) carries
 * a recorded, DIFF-BOUND review before merge — without the gate re-executing the
 * review (it QUERIES the ledger; pr_review is never re-run in the gate).
 *
 * MODEL: TAMPER-EVIDENT RECORD SET + MONOTONIC SEQUENCE. This MIRRORS the
 * authentic-vote-record model (#3927, `vote-record.ts`) exactly, for the same
 * reason: the ledger is a multi-branch committable artifact, so a linear hash
 * chain (whose `hash` folds in the prior record's hash) cannot survive a
 * concurrent-branch git merge. Two branches each appending from the same tip
 * produce records claiming the same `previousHash`, and any merge-concatenation
 * breaks the back-link check. So this ledger is an UNORDERED SET of self-hashed
 * records plus a monotonic `sequence`: each record's hash is POSITION-INDEPENDENT
 * (covers `sequence` but NOT `previousHash`), stable across merges and reorders.
 * `previousHash` is retained ADVISORILY for audit texture but does NOT
 * participate in verification. Omission is detected via SEQUENCE GAPS; concurrent
 * forks (two records sharing a sequence) are a BENIGN signal, not a failure.
 *
 * KNOWN GAP IN OMISSION DETECTION (#4011, mirrors vote-record.ts): sequence-gap
 * detection only catches an omission that leaves a HOLE in the `0..maxSeq` run. It
 * does NOT catch deletion of a FORK PARTNER — when ≥2 records share a sequence and
 * one is removed, the survivor still occupies that sequence, so no gap appears and
 * verification stays `ok`. Within the disclosed residual-trust boundary
 * (author-typed records; cryptographic signing is #3927 item 4): a commit-access
 * actor could equally never have written the partner, so it grants no new
 * capability. Closing it folds into #3927 item 4.
 *
 * DIFF-BINDING (Option-C, #3831 ratification). The self-`hash` covers
 * `prNumber` + **`baseSha`** + **`reviewedDiffHash`** + `verdict` + the review
 * summary content. Binding the record to the exact reviewed DIFF is what makes the
 * gate NOT theater: a record produced against a different diff does NOT satisfy a
 * later push (the gate matches `prNumber` AND recomputes `reviewedDiffHash` from
 * the committed PR's canonical diff), and the record's content cannot be edited to
 * claim a different diff/verdict without breaking the hash. This replaces the
 * rejected `headSha` binding (a head pointer is mutable; the reviewed bytes are
 * what the voters actually saw).
 *
 * WHY A DEDICATED PAYLOAD-COVERING HASH (and not the audit-event head hash).
 * As in #3897/#3927: the audit-event chain (`computeEventHash` in
 * audit-logger.ts) hashes only the stable HEAD fields and intentionally NOT
 * `metadata`, so riding a metadata payload would leave the verdict OUTSIDE the
 * hash — an attacker could flip `request_changes`→`approve` without breaking any
 * hash. This record instead folds EVERY authenticity-bearing field (the PR
 * number, the base sha, the reviewed-diff hash, the verdict, the verified flag,
 * the vote counts, and the `sequence`) into the self-hash, so editing any of them
 * is a `hash_mismatch`.
 * Cryptographic signing/provenance is DEFERRED (mirrors the #3897 follow-up).
 *
 * @module audit/pr-review-record
 */

import * as crypto from 'node:crypto';

import { z } from 'zod';

/**
 * The aggregate verdict a `pr_review` resolves to, mirroring the pr-review
 * decision vocabulary (`approve` / `request_changes` / `abstain`).
 */
export const PrReviewVerdictSchema = z.enum(['approve', 'request_changes', 'abstain']);
export type PrReviewVerdict = z.infer<typeof PrReviewVerdictSchema>;

/** The per-review voter-tally summary mirrored from the pr_review aggregate. */
export const PrReviewVoteCountsSchema = z
  .object({
    approve: z.number().int().nonnegative(),
    request_changes: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type PrReviewVoteCounts = z.infer<typeof PrReviewVoteCountsSchema>;

/**
 * One authentic, self-hashed pr-review record. The `hash` covers every
 * authenticity field INCLUDING `prNumber`, `baseSha`, `reviewedDiffHash`, `verdict`, and `sequence`
 * but EXCLUDING `previousHash`, so the record is tamper-EVIDENT and
 * POSITION-INDEPENDENT: any edit to a persisted line is detected by
 * {@link verifyPrReviewRecordSet} as a `hash_mismatch`, while reordering file
 * lines or merging concurrent branches does NOT break the hash.
 */
export const PrReviewRecordSchema = z
  .object({
    /**
     * Schema version. '1.1' is the Option-C binding (#3831): the record binds to
     * `{prNumber, baseSha, reviewedDiffHash}` instead of the rejected `headSha`.
     * Clean break — the committed `governance/pr-review-records.jsonl` ledger is
     * empty on every install (no producer ever wrote a '1.0' record), so there is
     * no '1.0' data to migrate.
     */
    version: z.literal('1.1'),
    /**
     * Monotonic sequence number (integer ≥ 0). Assigned as (max existing
     * sequence)+1 at write time. Sorted, the set of sequences must cover
     * 0..maxSeq with no gap (omission detection); DUPLICATE sequences are a
     * benign concurrent-fork signal, not tampering.
     */
    sequence: z.number().int().nonnegative(),
    /** The PR number the review covers. */
    prNumber: z.number().int().positive(),
    /**
     * The 40-hex BASE commit SHA the reviewed diff was computed against (the
     * `<base>..<head>` range base). Part of the Option-C binding so the gate knows
     * which range to recompute {@link reviewedDiffHash} over.
     */
    baseSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/, 'baseSha must be a 40-char lowercase hex commit sha'),
    /**
     * DIFF-BINDING (Option-C, #3831): sha256 of the canonical reviewed diff bytes
     * (see `audit/reviewed-diff-hash.ts` — pinned `git diff` invocation + 50k
     * byte-truncation). The gate recomputes this from the committed PR's diff and
     * matches it, so a record only satisfies a PR whose reviewed diff is
     * byte-identical to what the voters saw. Covered by the self-hash below, so it
     * cannot be edited to claim a different reviewed diff.
     */
    reviewedDiffHash: z.string().length(64),
    /** ISO-8601 timestamp the review was recorded. */
    recordedAt: z.string().min(1),
    /** The resolved aggregate verdict. */
    verdict: PrReviewVerdictSchema,
    /**
     * Whether the aggregate carried a VERIFIED finding (the 4-point gate). A
     * `request_changes` with `verified: true` is a strict blocker; covered by the
     * hash so it cannot be flipped without detection.
     */
    verified: z.boolean(),
    /** Per-decision voter tally from the pr_review aggregate. */
    voteCounts: PrReviewVoteCountsSchema,
    /** Truncated human-readable review summary for the reviewer record. */
    summary: z.string(),
    /** Optional correlation/decision id linking to the cost rollup / trace. */
    correlationId: z.string().min(1).optional(),
    /**
     * ADVISORY hash of the tip record at write time (absent for the first).
     * Retained for audit texture but NOT covered by `hash` and NOT verified —
     * the record-set model is position-independent (mirrors #3927).
     */
    previousHash: z.string().length(64).optional(),
    /** SHA-256 over every field above EXCEPT `previousHash` (and except `hash`). */
    hash: z.string().length(64),
  })
  .strict();
export type PrReviewRecord = z.infer<typeof PrReviewRecordSchema>;

/** The payload fields (everything except `hash`) — the self-hash projection. */
type PrReviewRecordPayload = Omit<PrReviewRecord, 'hash'>;

/**
 * Compute the SHA-256 over the canonical payload projection. Folds in EVERY
 * authenticity-bearing field — crucially `prNumber`, `baseSha`, `reviewedDiffHash`, and `verdict`
 * (the diff-binding, Option-C) plus the monotonic `sequence` — but EXCLUDES
 * `previousHash`, so the hash is position-independent and stable across
 * concurrent-branch merges and file reorders. Built field-by-field (not
 * `JSON.stringify(record)`) so key-order is deterministic regardless of how the
 * object was constructed; the nested `voteCounts` is likewise rebuilt in schema
 * order so a formatter / `jq -S` / merge tool that reorders keys must NOT flip a
 * legitimate record to `hash_mismatch` (mirrors #3962).
 */
export function computePrReviewRecordHash(payload: PrReviewRecordPayload): string {
  const canonical = JSON.stringify({
    version: payload.version,
    sequence: payload.sequence,
    prNumber: payload.prNumber,
    baseSha: payload.baseSha,
    reviewedDiffHash: payload.reviewedDiffHash,
    recordedAt: payload.recordedAt,
    verdict: payload.verdict,
    verified: payload.verified,
    // Rebuild voteCounts in schema order so the hash does not depend on how the
    // nested object's keys were ordered (mirrors #3962).
    voteCounts: {
      approve: payload.voteCounts.approve,
      request_changes: payload.voteCounts.request_changes,
      abstain: payload.voteCounts.abstain,
      error: payload.voteCounts.error,
      total: payload.voteCounts.total,
    },
    summary: payload.summary,
    correlationId: payload.correlationId ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Discriminated result from {@link verifyPrReviewRecordSet}. On success it may
 * surface `forks` — the sequence numbers that appear on more than one record (a
 * benign concurrent-branch signal, NOT tampering). On failure it names the
 * tamper/omission signal: `hash_mismatch` (a record's content was edited),
 * `missing_hash` (a record carries no hash), or `sequence_gap` (a record is
 * missing from the 0..maxSeq run — an omission).
 *
 * NOT detected (#4011): deletion of a fork PARTNER (a record sharing a sequence
 * with a survivor) leaves no gap, so `ok` stays true. Bounded by the residual-trust
 * boundary (author-typed records; signing deferred to #3927 item 4) — module header.
 */
export type PrReviewRecordVerification =
  | { ok: true; recordCount: number; forks?: number[] }
  | {
      ok: false;
      reason: 'hash_mismatch' | 'missing_hash' | 'sequence_gap';
      recordIndex: number;
      prNumber: number;
      detail: string;
    };

/** Per-record self-hash check; null when the record passes. */
function verifyPrReviewRecord(
  record: PrReviewRecord,
  index: number
): PrReviewRecordVerification | null {
  if (record.hash.length === 0) {
    return {
      ok: false,
      reason: 'missing_hash',
      recordIndex: index,
      prNumber: record.prNumber,
      detail: `record at index ${String(index)} has no hash`,
    };
  }
  const recomputed = computePrReviewRecordHash(record);
  if (recomputed !== record.hash) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      recordIndex: index,
      prNumber: record.prNumber,
      detail: `record at index ${String(index)} stored hash=${record.hash} does not match recomputed=${recomputed}`,
    };
  }
  return null;
}

/** Tally of sequence number → how many records carry it, plus the max seen. */
interface SequenceCensus {
  readonly counts: ReadonlyMap<number, number>;
  readonly maxSeq: number;
}

/** Count how many records carry each sequence number and find the max. */
function censusSequences(records: readonly PrReviewRecord[]): SequenceCensus {
  const counts = new Map<number, number>();
  let maxSeq = 0;
  for (const record of records) {
    counts.set(record.sequence, (counts.get(record.sequence) ?? 0) + 1);
    if (record.sequence > maxSeq) maxSeq = record.sequence;
  }
  return { counts, maxSeq };
}

/** First missing sequence in `0..maxSeq`, or null when the run is complete. */
function firstSequenceGap({ counts, maxSeq }: SequenceCensus): number | null {
  for (let seq = 0; seq <= maxSeq; seq++) {
    if (!counts.has(seq)) return seq;
  }
  return null;
}

/** Sequence numbers carried by more than one record (concurrent forks), ascending. */
function forkSequences({ counts }: SequenceCensus): number[] {
  const forks: number[] = [];
  for (const [seq, count] of counts) {
    if (count > 1) forks.push(seq);
  }
  forks.sort((a, b) => a - b);
  return forks;
}

/**
 * Verify a tamper-evident SET of pr-review records (mirrors
 * {@link verifyVoteRecordSet}, #3927). For each record, the self-hash must
 * recompute from its payload (covers `prNumber`/`baseSha`/`reviewedDiffHash`/`verdict`/`sequence`,
 * excludes `previousHash`). Order of the array does NOT matter — it is a set, not
 * a chain. Semantics:
 *
 * - Any record whose content was edited → `hash_mismatch`. Empty hash →
 *   `missing_hash`. Returns the first such record (array-order scan).
 * - The set of sequence numbers, sorted, must cover `0..maxSeq` with no missing
 *   value. A GAP (an omitted/deleted record) → `sequence_gap` naming the first
 *   missing sequence.
 * - DUPLICATE sequence numbers are a BENIGN concurrent-fork signal (two branches
 *   appended from the same tip, then merged): NOT a failure. They are surfaced on
 *   the success result as `forks` (the duplicated sequence numbers, ascending).
 *
 * LIMIT (#4011): a duplicate sequence being benign means deleting ONE partner of a
 * fork leaves the survivor on that sequence — no gap, so this returns `ok`.
 * Sequence-gap omission detection does NOT cover a deleted fork partner; that
 * guarantee waits on cryptographic signing (#3927 item 4), not `verification.ok`.
 *
 * An empty set verifies trivially.
 */
export function verifyPrReviewRecordSet(
  records: readonly PrReviewRecord[]
): PrReviewRecordVerification {
  // 1) Self-hash every record (order-independent).
  for (let i = 0; i < records.length; i++) {
    const failure = verifyPrReviewRecord(records[i] as PrReviewRecord, i);
    if (failure !== null) return failure;
  }

  if (records.length === 0) return { ok: true, recordCount: 0 };

  // 2) Sequence coverage: 0..maxSeq with no gap (omission); forks are benign.
  const census = censusSequences(records);
  const gap = firstSequenceGap(census);
  if (gap !== null) {
    const anchor = records[0] as PrReviewRecord;
    return {
      ok: false,
      reason: 'sequence_gap',
      recordIndex: 0,
      prNumber: anchor.prNumber,
      detail: `sequence gap: missing sequence ${String(gap)} in run 0..${String(census.maxSeq)}`,
    };
  }

  const forks = forkSequences(census);
  return forks.length > 0
    ? { ok: true, recordCount: records.length, forks }
    : { ok: true, recordCount: records.length };
}
