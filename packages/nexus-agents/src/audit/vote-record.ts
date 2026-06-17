/**
 * nexus-agents/audit - Authentic Vote Record (#3897)
 *
 * A committed, append-only, tamper-EVIDENT record of a completed
 * `consensus_vote`, persisted at vote time so the authority-ladder promotion
 * gate (`scripts/check-authority-tier-drift.ts`, #3895) can rest authenticity
 * on a hash chain instead of on hand-transcribed YAML.
 *
 * WHY A DEDICATED PAYLOAD-COVERING HASH (and not the audit-event head hash).
 * The audit-event chain (`computeEventHash` in audit-logger.ts) hashes only the
 * stable HEAD fields (id/timestamp/category/action/outcome/actor/previousHash)
 * and intentionally NOT `metadata` — so riding a tier-transition-style metadata
 * payload would leave the vote `decision`/`approvalPercentage` OUTSIDE the
 * chain: an attacker could flip `rejected`→`approved` in the metadata without
 * breaking any hash. That defeats the whole point of #3897. This record instead
 * folds EVERY authenticity-bearing field — the proposal content hash, the
 * decision, the approval percentage, the vote counts, and the per-voter
 * summary — into the chained hash, so editing any of them is detected as a
 * `hash_mismatch`. This is the tamper-evidence MVP; cryptographic
 * signing/provenance (binding the record to a key) is DEFERRED (#3897 follow-up).
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
 * One authentic, hash-chained vote record. The `hash` covers every field above
 * it (including `previousHash`), so the record is tamper-EVIDENT: any edit to a
 * persisted line is detected by {@link verifyVoteRecordChain}.
 */
export const VoteRecordSchema = z
  .object({
    /** Schema version for forward migrations. */
    version: z.literal('1.0'),
    /** Unique record id (also usable as a `ratificationVoteRef`). */
    id: z.string().min(1),
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
    /** Hash of the previous record in the chain (absent for the first). */
    previousHash: z.string().length(64).optional(),
    /** SHA-256 over every field above + previousHash. */
    hash: z.string().length(64),
  })
  .strict();
export type VoteRecord = z.infer<typeof VoteRecordSchema>;

/** The payload fields (everything except `hash`) the chain hash covers. */
type VoteRecordPayload = Omit<VoteRecord, 'hash'>;

/**
 * Compute the SHA-256 over the canonical payload projection. Unlike the
 * audit-event head hash, this folds in EVERY authenticity-bearing field, so a
 * flipped `decision` or altered `approvalPercentage` changes the hash (the
 * core #3897 property). The projection is built field-by-field (not
 * `JSON.stringify(record)`) so key-order is deterministic regardless of how the
 * object was constructed.
 */
export function computeVoteRecordHash(payload: VoteRecordPayload): string {
  const canonical = JSON.stringify({
    version: payload.version,
    id: payload.id,
    recordedAt: payload.recordedAt,
    proposalHash: payload.proposalHash,
    proposal: payload.proposal,
    strategy: payload.strategy,
    decision: payload.decision,
    approvalPercentage: payload.approvalPercentage,
    voteCounts: payload.voteCounts,
    voters: payload.voters.map((v) => ({
      role: v.role,
      decision: v.decision,
      confidence: v.confidence,
    })),
    correlationId: payload.correlationId ?? null,
    previousHash: payload.previousHash ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** SHA-256 of arbitrary text — used for the proposal content hash. */
export function hashProposal(proposal: string): string {
  return crypto.createHash('sha256').update(proposal).digest('hex');
}

/**
 * Discriminated result from {@link verifyVoteRecordChain}. Mirrors the audit
 * `ChainVerification` shape so a future gate consumer handles both uniformly.
 */
export type VoteRecordVerification =
  | { ok: true; recordCount: number }
  | {
      ok: false;
      reason: 'hash_mismatch' | 'previous_hash_mismatch' | 'missing_hash';
      recordIndex: number;
      recordId: string;
      detail: string;
    };

/** Per-record check; null when the record passes. */
function verifyVoteRecord(
  record: VoteRecord,
  index: number,
  priorHash: string | undefined
): VoteRecordVerification | null {
  if (record.hash.length === 0) {
    return {
      ok: false,
      reason: 'missing_hash',
      recordIndex: index,
      recordId: record.id,
      detail: `record at index ${String(index)} has no hash`,
    };
  }
  if (index > 0 && record.previousHash !== priorHash) {
    return {
      ok: false,
      reason: 'previous_hash_mismatch',
      recordIndex: index,
      recordId: record.id,
      detail: `record at index ${String(index)} previousHash=${record.previousHash ?? '(missing)'} does not match prior record hash=${priorHash ?? '(missing)'}`,
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

/**
 * Verify a hash-chained sequence of vote records. Walks the array in order and
 * checks (a) each record's `hash` recomputes from its payload, and (b) each
 * record's `previousHash` matches the prior record's `hash`. Returns the first
 * detected tampering signal — a single tamper invalidates everything
 * downstream. An empty sequence verifies trivially.
 */
export function verifyVoteRecordChain(records: readonly VoteRecord[]): VoteRecordVerification {
  let priorHash: string | undefined;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record === undefined) continue;
    const failure = verifyVoteRecord(record, i, priorHash);
    if (failure !== null) return failure;
    priorHash = record.hash;
  }
  return { ok: true, recordCount: records.length };
}
