/**
 * nexus-agents/audit - Redaction record for the vote ledger (#6264, #5748
 * step 2; panel decision 2026-09-14 option A amended, corrected by the #6274
 * panel so the nonce sits outside the hash)
 *
 * A REDACTION is the one sanctioned edit of a committed vote record: the
 * OPENING of a voter's reasoning commitment — the text and its salt,
 * `reasoning` + `reasoningNonce` — is dropped, and the hash-covered
 * `reasoningDigest` stays. Because the digest tier folds only the digest
 * (`vote-record.ts`, #6263), the record's hash — and any signature over it —
 * is unchanged by the drop; the 256-bit unknown salt leaves the digest an
 * opaque commitment nobody can dictionary-check.
 *
 * What makes it an EDIT rather than TAMPERING is this record: a self-hashed
 * line appended at the ledger's next `sequence` that names the target record,
 * the voter roles whose openings were dropped, who did it, when and why. The
 * verifier (`verifyVoteRecordSet`) answers `redacted` for an entry whose
 * opening is absent ONLY when a redaction record here names that record id
 * and role; the opening absent with no such record is `hash_mismatch` — the
 * named empty case — and a redaction record that names nothing it can bind
 * to (no such record, a target not at an earlier sequence, no such role, a
 * role with no commitment, or a role whose opening is still present) is
 * `redaction_unbound`, never ok.
 *
 * What a redaction does NOT remove: the tally, the decision, the clip marker
 * `reasoningTruncated`, and the digest all stay hash-covered and legible; and
 * nothing here touches git history — a plaintext already committed stays in
 * earlier commits until a history rewrite the ledger tooling does not perform
 * (#6265's README states this).
 *
 * Structural parameter types (`ReasoningCommitmentFields`, not `VoterSummary`)
 * so this module imports nothing from the record module and there is no cycle.
 *
 * @module audit/redaction-record
 */

import * as crypto from 'node:crypto';

import { z } from 'zod';

import type { ReasoningCommitmentFields } from './reasoning-commitment.js';

/**
 * One redaction. `kind` is the ledger-line discriminator: a vote record has
 * no `kind`, so the parser routes a `kind: 'redaction'` line here and every
 * other line to `VoteRecordSchema`. `targetVoterRoles` is `.min(1)` because a
 * redaction that names no role redacts nothing — the empty redaction is
 * refused, not accepted as a no-op. `.strict()` on the record-schema rule: an
 * unknown key would be a field the hash does not cover.
 */
export const RedactionRecordSchema = z
  .object({
    kind: z.literal('redaction'),
    /** Unique record id, on the vote-record rule. */
    id: z.string().min(1),
    /** Monotonic sequence number, shared with the vote records of the same ledger. */
    sequence: z.number().int().nonnegative(),
    /** The `id` of the vote record whose entries were redacted. */
    targetId: z.string().min(1),
    /** The voter roles on the target whose openings were dropped; never empty. */
    targetVoterRoles: z.array(z.string().min(1).max(100)).min(1),
    /** ISO-8601 timestamp of the redaction. */
    at: z.string().min(1),
    /** Who sanctioned it — author-typed, on the residual-trust boundary of every record. */
    by: z.string().min(1).max(200),
    /** Why. Bounded so the reason cannot itself become the thing that needs redacting. */
    reason: z.string().min(1).max(2000),
    /** SHA-256 over every field above. */
    hash: z.string().length(64),
  })
  .strict();
export type RedactionRecord = z.infer<typeof RedactionRecordSchema>;

/** The payload fields (everything except `hash`) — the self-hash projection. */
export type RedactionRecordPayload = Omit<RedactionRecord, 'hash'>;

/**
 * SHA-256 over the canonical projection, built field-by-field in schema order
 * (never `JSON.stringify(record)`) so the hash is independent of key insertion
 * order — the `computeVoteRecordHash` rule (#3962). `targetVoterRoles` is
 * folded in the order written: reordering the roles of a persisted redaction
 * is an edit and reads as one.
 */
export function computeRedactionRecordHash(payload: RedactionRecordPayload): string {
  const canonical = JSON.stringify({
    kind: payload.kind,
    id: payload.id,
    sequence: payload.sequence,
    targetId: payload.targetId,
    targetVoterRoles: [...payload.targetVoterRoles],
    at: payload.at,
    by: payload.by,
    reason: payload.reason,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Build a self-hashed redaction record. The producer (`scripts/redact-vote-record.ts`, #6265) and the tests share this one constructor. */
export function buildRedactionRecord(
  input: Omit<RedactionRecordPayload, 'kind' | 'targetVoterRoles'> & {
    readonly targetVoterRoles: readonly string[];
  }
): RedactionRecord {
  const payload: RedactionRecordPayload = {
    kind: 'redaction',
    id: input.id,
    sequence: input.sequence,
    targetId: input.targetId,
    targetVoterRoles: [...input.targetVoterRoles],
    at: input.at,
    by: input.by,
    reason: input.reason,
  };
  return { ...payload, hash: computeRedactionRecordHash(payload) };
}

/**
 * Drop the OPENING — `reasoning` and `reasoningNonce`, together — of every
 * voter entry whose role is in `roles`; every other entry, and every other
 * key of a named entry (the digest, the clip marker, the tally fields), is
 * returned as-is. This is the whole edit a redaction makes to a vote record;
 * the record hash does not change (`computeVoteRecordHash` folds neither key
 * on the digest tier).
 */
export function redactVoterOpenings<V extends ReasoningCommitmentFields>(
  voters: readonly V[],
  roles: ReadonlySet<string>
): Omit<V, 'reasoning' | 'reasoningNonce'>[] {
  return voters.map((v) => {
    if (!roles.has(v.role)) return v;
    const { reasoning: _reasoning, reasoningNonce: _reasoningNonce, ...rest } = v;
    return rest;
  });
}

/** The reasons a redaction record can fail; `verifyVoteRecordSet` folds them into its reason set. */
export type RedactionFailureReason = 'hash_mismatch' | 'missing_hash' | 'redaction_unbound';

/** A failed redaction record, shaped like the verifier's failure minus `ok`. */
export interface RedactionVerificationFailure {
  readonly reason: RedactionFailureReason;
  /** Index into the REDACTIONS array the verifier was given; the detail says so. */
  readonly recordIndex: number;
  readonly recordId: string;
  readonly detail: string;
}

/**
 * One verified record's redaction state, reported per record on an `ok`
 * verification — the third answer beside ok and `hash_mismatch` (#6264).
 * `voterRoles` are the roles whose openings are gone, sorted and unique;
 * `redactionIds` every redaction record that names this record, in the order
 * given (two records naming the same entry are idempotent — see
 * {@link findRedactionDefect}).
 */
export interface RedactedRecordReport {
  readonly recordId: string;
  readonly voterRoles: readonly string[];
  readonly redactionIds: readonly string[];
}

/** What the binding rule reads off a target record. */
interface RedactionTarget {
  readonly id: string;
  readonly sequence: number;
  readonly voters: readonly ReasoningCommitmentFields[];
}

/** The roles every redaction record names, keyed by target record id. */
export function redactedRolesByTarget(
  redactions: readonly RedactionRecord[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const byTarget = new Map<string, Set<string>>();
  for (const r of redactions) {
    const roles = byTarget.get(r.targetId) ?? new Set<string>();
    for (const role of r.targetVoterRoles) roles.add(role);
    byTarget.set(r.targetId, roles);
  }
  return byTarget;
}

/**
 * Why one redaction record does not bind to a redacted commitment, or `null`
 * when it does. A redaction binds when its target exists AT AN EARLIER
 * SEQUENCE and EVERY named role is a voter on it whose entry carries
 * `reasoningDigest` with the opening (text and nonce) ABSENT. Anything else
 * is a record that claims a removal the ledger does not show: no such
 * record, a target at or past the redaction's own sequence (an honest ledger
 * appends the redaction only after the target is committed, so this order
 * cannot be produced — #6345), no such role, a role that never had a
 * commitment, or — the misreport — a role whose text is still there. A
 * second redaction naming an already-redacted entry binds
 * exactly as the first did (idempotent): two branches can each append one
 * and merge under `merge=union`, and refusing that would make a merged
 * ledger invalid for doing the right thing twice.
 */
function redactionBindingDefect(
  r: RedactionRecord,
  targets: readonly RedactionTarget[]
): string | null {
  const matched = targets.filter((t) => t.id === r.targetId);
  if (matched.length === 0) return `targetId '${r.targetId}' matches no record in the set`;
  for (const target of matched) {
    if (target.sequence >= r.sequence) {
      return `at sequence ${String(r.sequence)} is not past its target '${target.id}' at sequence ${String(target.sequence)} — a redaction can only follow the record it redacts`;
    }
    for (const role of r.targetVoterRoles) {
      const entries = target.voters.filter((v) => v.role === role);
      if (entries.length === 0) {
        return `names role '${role}', which is not a voter on '${target.id}'`;
      }
      for (const v of entries) {
        if (v.reasoningDigest === undefined) {
          return `names role '${role}' on '${target.id}', which carries no reasoning commitment`;
        }
        if (v.reasoning !== undefined || v.reasoningNonce !== undefined) {
          return `names role '${role}' on '${target.id}' whose opening is still present — the redaction is recorded but not applied`;
        }
      }
    }
  }
  return null;
}

/**
 * The first redaction record that fails, or `null` when every one passes.
 * Two checks per record: its own self-hash (a redaction record is tamper-
 * evident like every other line — `missing_hash` / `hash_mismatch`), then
 * the binding rule ({@link redactionBindingDefect}) → `redaction_unbound`.
 * Self-hashes are checked for ALL records before any binding, so a tampered
 * line is named as tampered rather than as unbound.
 */
export function findRedactionDefect(
  redactions: readonly RedactionRecord[],
  targets: readonly RedactionTarget[]
): RedactionVerificationFailure | null {
  for (const [i, r] of redactions.entries()) {
    const at = `redaction record at index ${String(i)}`;
    if (r.hash.length === 0) {
      return {
        reason: 'missing_hash',
        recordIndex: i,
        recordId: r.id,
        detail: `${at} has no hash`,
      };
    }
    const recomputed = computeRedactionRecordHash(r);
    if (recomputed !== r.hash) {
      return {
        reason: 'hash_mismatch',
        recordIndex: i,
        recordId: r.id,
        detail: `${at} stored hash=${r.hash} does not match recomputed=${recomputed}`,
      };
    }
  }
  for (const [i, r] of redactions.entries()) {
    const defect = redactionBindingDefect(r, targets);
    if (defect !== null) {
      return {
        reason: 'redaction_unbound',
        recordIndex: i,
        recordId: r.id,
        detail: `redaction record '${r.id}' at index ${String(i)} ${defect}`,
      };
    }
  }
  return null;
}

/**
 * The per-record `redacted` reports for a set whose redactions all bind:
 * one per target record, in the order the RECORDS were given, naming the
 * roles (sorted, unique) and every redaction record that names it.
 */
export function redactedRecordReports(
  records: readonly { readonly id: string }[],
  redactions: readonly RedactionRecord[]
): RedactedRecordReport[] {
  const roles = redactedRolesByTarget(redactions);
  const reports: RedactedRecordReport[] = [];
  for (const record of records) {
    const named = roles.get(record.id);
    if (named === undefined) continue;
    reports.push({
      recordId: record.id,
      voterRoles: [...named].sort(),
      redactionIds: redactions.filter((r) => r.targetId === record.id).map((r) => r.id),
    });
  }
  return reports;
}
