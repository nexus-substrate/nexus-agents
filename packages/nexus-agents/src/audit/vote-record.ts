/**
 * nexus-agents/audit - Authentic Vote Record (#3897, model revised #3927)
 *
 * A committed, append-only, tamper-EVIDENT record of a completed
 * `consensus_vote`, persisted at vote time so the authority-ladder promotion
 * gate (`scripts/check-authority-tier-drift.ts`, #3895) can rest authenticity
 * on a tamper-evident record set instead of on hand-transcribed YAML.
 *
 * MODEL: TAMPER-EVIDENT RECORD SET + MONOTONIC SEQUENCE (NOT a linear hash
 * chain). #3927 (design vote 7-0, Option B). The original #3897 design was a
 * LINEAR HASH CHAIN: each record's `hash` folded in the prior record's hash, so
 * the order of file lines was load-bearing. That model cannot survive a
 * concurrent-branch git merge — two branches that each append a record from the
 * same tip produce two records claiming the same `previousHash`, and any
 * merge-concatenation breaks the back-link check. The revised model treats the
 * ledger as an UNORDERED SET of self-hashed records plus a monotonic `sequence`
 * number: each record's hash is POSITION-INDEPENDENT (covers `sequence` but NOT
 * `previousHash`), so it is stable across merges and reorders. `previousHash`
 * is retained ADVISORILY for audit texture but does NOT participate in
 * verification. Omission is detected via SEQUENCE GAPS; concurrent forks (two
 * records sharing a sequence) are a BENIGN signal, not a failure.
 *
 * WHY A DEDICATED PAYLOAD-COVERING HASH (and not the audit-event head hash).
 * The audit-event chain (`computeEventHash` in audit-logger.ts) hashes only the
 * stable HEAD fields (id/timestamp/category/action/outcome/actor/previousHash)
 * and intentionally NOT `metadata` — so riding a tier-transition-style metadata
 * payload would leave the vote `decision`/`approvalPercentage` OUTSIDE the
 * hash: an attacker could flip `rejected`→`approved` in the metadata without
 * breaking any hash. That defeats the whole point of #3897. This record instead
 * folds EVERY authenticity-bearing field — the proposal content hash, the
 * decision, the approval percentage, the vote counts, the per-voter summary,
 * and the `sequence` — into the self-hash, so editing any of them is detected
 * as a `hash_mismatch`. This is the tamper-evidence MVP; cryptographic
 * signing/provenance (binding the record to a key) is DEFERRED (#3897 follow-up).
 *
 * NOTE: the separate audit-event/tier-transition chain (`audit-logger.ts`) IS
 * still a real linear hash chain — it has a single-writer runtime and never
 * merges concurrent branches, so the chain model holds there. Only THIS ledger
 * (a multi-branch committable artifact) was converted to a record set.
 *
 * @module audit/vote-record
 */

import * as crypto from 'node:crypto';

import { z } from 'zod';

/** Decision an `approved`/`rejected`/`no_quorum` consensus vote resolves to. */
export const VoteRecordDecisionSchema = z.enum(['approved', 'rejected', 'no_quorum']);
export type VoteRecordDecision = z.infer<typeof VoteRecordDecisionSchema>;

/** Per-voter summary carried in an authentic vote record. */
export const VoterSummarySchema = z
  .object({
    role: z.string().min(1).max(100),
    decision: z.enum(['approve', 'reject', 'abstain']),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type VoterSummary = z.infer<typeof VoterSummarySchema>;

/** The vote-count breakdown mirrored from the consensus engine result. */
export const VoteRecordCountsSchema = z
  .object({
    approve: z.number().int().nonnegative(),
    reject: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type VoteRecordCounts = z.infer<typeof VoteRecordCountsSchema>;

/**
 * One authentic, self-hashed vote record. The `hash` covers every authenticity
 * field INCLUDING `sequence` but EXCLUDING `previousHash`, so the record is
 * tamper-EVIDENT and POSITION-INDEPENDENT: any edit to a persisted line is
 * detected by {@link verifyVoteRecordSet} as a `hash_mismatch`, while reordering
 * file lines or merging concurrent branches does NOT break the hash.
 */
export const VoteRecordSchema = z
  .object({
    /**
     * Schema version. '1.1' marked the chain→record-set+sequence model (#3927);
     * '1.2' adds the optional `ratifies` subject-binding field (#3927 item 1).
     * Both are accepted — a 1.1 record (no `ratifies`) verifies unchanged because
     * `ratifies` is folded into the self-hash ONLY when present (see
     * {@link computeVoteRecordHash}).
     */
    version: z.enum(['1.1', '1.2']),
    /** Unique record id (also usable as a `ratificationVoteRef`). */
    id: z.string().min(1),
    /**
     * Monotonic sequence number (integer ≥ 0). Assigned as (max existing
     * sequence)+1 at write time. Sorted, the set of sequences must cover
     * 0..maxSeq with no gap (omission detection); DUPLICATE sequences are a
     * benign concurrent-fork signal, not tampering.
     */
    sequence: z.number().int().nonnegative(),
    /** ISO-8601 timestamp the vote was recorded. */
    recordedAt: z.string().min(1),
    /**
     * SHA-256 of the FULL proposal text. The proposal itself is truncated for
     * the human record (`proposal`), but the hash binds the record to the exact
     * proposal voted on — a later edit of `proposal` that changes meaning is
     * detectable by recomputing this hash from the original.
     */
    proposalHash: z.string().length(64),
    /** Truncated proposal text for the human/reviewer record. */
    proposal: z.string(),
    /** The voting strategy used. */
    strategy: z.enum([
      'simple_majority',
      'supermajority',
      'unanimous',
      'higher_order',
      'opinion_wise',
      'proof_of_learning',
    ]),
    /** The resolved decision. */
    decision: VoteRecordDecisionSchema,
    /** Approval fraction as a percentage (0-100). */
    approvalPercentage: z.number().min(0).max(100),
    /** Vote-count breakdown. */
    voteCounts: VoteRecordCountsSchema,
    /** Per-voter {role, decision, confidence} summary. */
    voters: z.array(VoterSummarySchema),
    /** Optional correlation/decision id linking to the cost rollup / trace. */
    correlationId: z.string().min(1).optional(),
    /**
     * The loop/strategy subject this vote RATIFIES (#3927 item 1). Present only on
     * a ratification vote; set at vote time and bound into the self-hash (so it is
     * tamper-evident). The authority-tier promotion gate
     * (`scripts/check-authority-tier-drift.ts`) resolves a transition's
     * `ratificationVoteRef` to a record and requires `ratifies === transition.subject`
     * (with `decision === 'approved'` and `strategy === 'higher_order'`). Absent on
     * an ordinary (non-ratification) vote; a 1.1 record never carries it.
     */
    ratifies: z.string().min(1).optional(),
    /**
     * ADVISORY hash of the tip record at write time (absent for the first).
     * Retained for audit texture but NOT covered by `hash` and NOT verified —
     * the record-set model is position-independent (#3927).
     */
    previousHash: z.string().length(64).optional(),
    /** SHA-256 over every field above EXCEPT `previousHash` (and except `hash`). */
    hash: z.string().length(64),
  })
  .strict();
export type VoteRecord = z.infer<typeof VoteRecordSchema>;

/** The payload fields (everything except `hash`) — the self-hash projection. */
type VoteRecordPayload = Omit<VoteRecord, 'hash'>;

/**
 * Compute the SHA-256 over the canonical payload projection. Unlike the
 * audit-event head hash, this folds in EVERY authenticity-bearing field (so a
 * flipped `decision` or altered `approvalPercentage` changes the hash — the
 * core #3897 property) AND the monotonic `sequence` (#3927) — but it EXCLUDES
 * `previousHash`, so the hash is position-independent and stable across
 * concurrent-branch merges and file reorders. The projection is built
 * field-by-field (not `JSON.stringify(record)`) so key-order is deterministic
 * regardless of how the object was constructed — and the NESTED objects
 * (`voteCounts` and each `voters[]` element) are likewise rebuilt field-by-field
 * in schema order (#3962). A formatter / `jq -S` / merge tool that reorders the
 * keys of a persisted record must NOT flip a legitimate record to
 * `hash_mismatch`: the hash is independent of key insertion order at every level.
 */
export function computeVoteRecordHash(payload: VoteRecordPayload): string {
  const base = {
    version: payload.version,
    id: payload.id,
    sequence: payload.sequence,
    recordedAt: payload.recordedAt,
    proposalHash: payload.proposalHash,
    proposal: payload.proposal,
    strategy: payload.strategy,
    decision: payload.decision,
    approvalPercentage: payload.approvalPercentage,
    // Rebuild voteCounts in schema order (approve, reject, abstain, total) so the
    // hash does not depend on how the nested object's keys were ordered (#3962).
    voteCounts: {
      approve: payload.voteCounts.approve,
      reject: payload.voteCounts.reject,
      abstain: payload.voteCounts.abstain,
      total: payload.voteCounts.total,
    },
    voters: payload.voters.map((v) => ({
      role: v.role,
      decision: v.decision,
      confidence: v.confidence,
    })),
    correlationId: payload.correlationId ?? null,
  };
  // `ratifies` (#3927) is folded in ONLY when present, appended after the stable
  // base fields. This keeps the projection BYTE-IDENTICAL to the pre-1.2 form for
  // any record without it — so every historical 1.1 record (which never carried
  // `ratifies`) re-hashes unchanged (back-compat). It stays fully tamper-evident:
  // adding, removing, or editing `ratifies` on a persisted record flips the hash
  // (an absent field re-hashes one way, a present field the other).
  const canonical = JSON.stringify(
    payload.ratifies !== undefined ? { ...base, ratifies: payload.ratifies } : base
  );
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** SHA-256 of arbitrary text — used for the proposal content hash. */
export function hashProposal(proposal: string): string {
  return crypto.createHash('sha256').update(proposal).digest('hex');
}

/**
 * Discriminated result from {@link verifyVoteRecordSet}. On success it may
 * surface `forks` — the sequence numbers that appear on more than one record
 * (a benign concurrent-branch signal, NOT tampering). On failure it names the
 * tamper/omission signal: `hash_mismatch` (a record's content was edited),
 * `missing_hash` (a record carries no hash), or `sequence_gap` (a record is
 * missing from the 0..maxSeq run — an omission).
 */
export type VoteRecordVerification =
  | { ok: true; recordCount: number; forks?: number[] }
  | {
      ok: false;
      reason: 'hash_mismatch' | 'missing_hash' | 'sequence_gap';
      recordIndex: number;
      recordId: string;
      detail: string;
    };

/** Per-record self-hash check; null when the record passes. */
function verifyVoteRecord(record: VoteRecord, index: number): VoteRecordVerification | null {
  if (record.hash.length === 0) {
    return {
      ok: false,
      reason: 'missing_hash',
      recordIndex: index,
      recordId: record.id,
      detail: `record at index ${String(index)} has no hash`,
    };
  }
  const recomputed = computeVoteRecordHash(record);
  if (recomputed !== record.hash) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      recordIndex: index,
      recordId: record.id,
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
function censusSequences(records: readonly VoteRecord[]): SequenceCensus {
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
 * Verify a tamper-evident SET of vote records (#3927). For each record, the
 * self-hash must recompute from its payload (covers `sequence`, excludes
 * `previousHash`). Order of the array does NOT matter — it is a set, not a
 * chain. Semantics:
 *
 * - Any record whose content was edited → `hash_mismatch`. Empty hash →
 *   `missing_hash`. Returns the first such record (array-order scan).
 * - The set of sequence numbers, sorted, must cover `0..maxSeq` with no missing
 *   value. A GAP (an omitted/deleted record) → `sequence_gap` naming the first
 *   missing sequence.
 * - DUPLICATE sequence numbers are a BENIGN concurrent-fork signal (two branches
 *   appended from the same tip, then merged): NOT a failure. They are surfaced
 *   on the success result as `forks` (the duplicated sequence numbers, ascending).
 *
 * An empty set verifies trivially.
 */
export function verifyVoteRecordSet(records: readonly VoteRecord[]): VoteRecordVerification {
  // 1) Self-hash every record (order-independent).
  for (let i = 0; i < records.length; i++) {
    const failure = verifyVoteRecord(records[i] as VoteRecord, i);
    if (failure !== null) return failure;
  }

  if (records.length === 0) return { ok: true, recordCount: 0 };

  // 2) Sequence coverage: 0..maxSeq with no gap (omission); forks are benign.
  const census = censusSequences(records);
  const gap = firstSequenceGap(census);
  if (gap !== null) {
    const anchor = records[0] as VoteRecord;
    return {
      ok: false,
      reason: 'sequence_gap',
      recordIndex: 0,
      recordId: anchor.id,
      detail: `sequence gap: missing sequence ${String(gap)} in run 0..${String(census.maxSeq)}`,
    };
  }

  const forks = forkSequences(census);
  return forks.length > 0
    ? { ok: true, recordCount: records.length, forks }
    : { ok: true, recordCount: records.length };
}
