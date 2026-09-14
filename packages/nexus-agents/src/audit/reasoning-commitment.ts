/**
 * nexus-agents/audit - Reasoning commitment for the vote record (#6263,
 * #5748 step 1; panel decision 2026-09-14, option A amended with a salt)
 *
 * The committed governance ledger holds each voter's model-written reasoning
 * INSIDE the record hash, so nothing can ever be removed from it without a
 * `hash_mismatch`. On the digest tier (schema 1.13) a voter entry instead
 * carries a per-entry salt, `reasoningNonce`, and a commitment to the text,
 * `reasoningDigest = sha256(reasoningNonce ‖ reasoning)`; the record hash
 * folds the nonce and the digest and NOT the text. The text still travels on
 * the record, outside the hash, and the verifier re-opens the commitment
 * whenever the opening (nonce + text) is present — so while the text is there
 * the tier is exactly as tamper-evident as the one before it, and once a
 * later step drops the text (#6264) the original hash, and any signature
 * over it, still verifies.
 *
 * The salt is the contrarian's amendment: an unsalted digest over
 * low-entropy boilerplate prose is dictionary-attackable once the plaintext
 * is gone. One fresh nonce per ENTRY, not per record, so two seats that
 * answered with the same boilerplate do not reveal it through equal digests.
 *
 * Split out of `vote-record.ts` when the tier pushed that file past the
 * line cap. Structural parameter types (not `VoterSummary`) so this module
 * imports nothing from the record module and there is no cycle.
 *
 * @module audit/reasoning-commitment
 */

import * as crypto from 'node:crypto';

/** A 32-byte value as lowercase hex — the shape of `reasoningNonce` and `reasoningDigest`. */
export const HEX_256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * A fresh per-entry salt for the reasoning commitment: 32 bytes from
 * `crypto.randomBytes`, as lowercase hex.
 */
export function mintReasoningNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * The commitment a digest-tier voter entry makes to its reasoning:
 * `sha256(reasoningNonce ‖ reasoning)`, over the UTF-8 bytes of the 64-char
 * hex nonce followed by the UTF-8 bytes of the text AS STORED (already
 * clipped by `clipForRecord`), so anyone can re-open it from the record
 * alone: `printf '%s%s' "$nonce" "$reasoning" | sha256sum`. The nonce is
 * fixed-width, so the concatenation is unambiguous.
 */
export function computeReasoningDigest(reasoningNonce: string, reasoning: string): string {
  return crypto.createHash('sha256').update(reasoningNonce).update(reasoning).digest('hex');
}

/**
 * The tiers whose voter hash folds the salted reasoning digest instead of the
 * text. A set, not an equality, because step 2 (#6264) adds the tier that
 * carries redaction records and must keep the same fold rule. Tiers are
 * labels: membership here is the ONLY thing that decides the fold, so an
 * older record is never re-projected by a version comparison.
 */
const REASONING_DIGEST_TIERS: ReadonlySet<string> = new Set(['1.13']);

/** True when `version` is a tier whose voter hash folds the digest, not the text. */
export function isReasoningDigestTier(version: string): boolean {
  return REASONING_DIGEST_TIERS.has(version);
}

/** The three voter fields the commitment rule reads; every other field is irrelevant to it. */
export interface ReasoningCommitmentFields {
  readonly role: string;
  readonly reasoning?: string | undefined;
  readonly reasoningNonce?: string | undefined;
  readonly reasoningDigest?: string | undefined;
}

/** A broken commitment SHAPE, at the voter key that is wrong. */
export interface ReasoningCommitmentShapeDefect {
  readonly key: 'reasoning' | 'reasoningNonce' | 'reasoningDigest';
  readonly message: string;
}

/** On a text-hashing tier the digest keys are unhashed decoration: neither may be present. */
function textTierShapeDefect(v: ReasoningCommitmentFields): ReasoningCommitmentShapeDefect | null {
  if (v.reasoningNonce !== undefined) {
    return { key: 'reasoningNonce', message: 'reasoningNonce is a 1.13 key' };
  }
  if (v.reasoningDigest !== undefined) {
    return { key: 'reasoningDigest', message: 'reasoningDigest is a 1.13 key' };
  }
  return null;
}

/**
 * On the digest tier an entry WITH reasoning carries both keys — a digest
 * without its nonce cannot be opened, a nonce without its digest commits to
 * nothing — and an entry WITHOUT reasoning carries neither: a commitment with
 * nothing to open it is refused HERE; step 2's redacted form (digest kept,
 * nonce and text dropped) is its own tier with its own verifier state (#6264).
 */
function digestTierShapeDefect(
  v: ReasoningCommitmentFields
): ReasoningCommitmentShapeDefect | null {
  const hasText = v.reasoning !== undefined;
  const hasNonce = v.reasoningNonce !== undefined;
  const hasDigest = v.reasoningDigest !== undefined;
  if (hasText && !hasNonce) {
    return { key: 'reasoningNonce', message: 'reasoning without its reasoningNonce' };
  }
  if (hasText && !hasDigest) {
    return { key: 'reasoningDigest', message: 'reasoning without its reasoningDigest' };
  }
  if (!hasText && (hasNonce || hasDigest)) {
    return { key: 'reasoning', message: 'a reasoning commitment with no reasoning to open it' };
  }
  return null;
}

/**
 * What a voter entry's reasoning commitment must look like on its tier, or
 * `null` when it does. One rule, two consumers: the record schema's
 * refinement turns a defect into a parse issue at the named key (so the
 * write path and every reader refuse the line), and the verifier turns it
 * into a `hash_mismatch` (so a typed record that never went through the
 * schema still cannot verify).
 */
export function reasoningCommitmentShapeDefect(
  digestTier: boolean,
  v: ReasoningCommitmentFields
): ReasoningCommitmentShapeDefect | null {
  return digestTier ? digestTierShapeDefect(v) : textTierShapeDefect(v);
}

/**
 * The first voter entry whose reasoning commitment is broken, as a message
 * naming the entry, or `null` when every commitment is sound.
 *
 * Two checks per entry: the shape rule ({@link reasoningCommitmentShapeDefect})
 * and — when nonce and text are both present — the commitment itself,
 * `reasoningDigest === sha256(nonce ‖ reasoning)`. On the digest tier the
 * record hash cannot see the text, so THIS is what makes a text edited in
 * place a verification failure rather than a silent change: the hash still
 * matches, the commitment does not. A digest nobody re-opens would be a
 * check that cannot fail.
 *
 * Used by `verifyVoteRecordSet` and by the caller-commits append script,
 * which vets a source record's self-hash alone (its sequence census would
 * misread a lone record) and needs the same commitment check so an edited
 * text is refused BEFORE the committed line is written, not by the
 * read-back afterwards.
 */
export function findReasoningCommitmentDefect(record: {
  readonly version: string;
  readonly voters: readonly ReasoningCommitmentFields[];
}): string | null {
  const digestTier = isReasoningDigestTier(record.version);
  for (const [i, v] of record.voters.entries()) {
    const where = `voters[${String(i)}] (${v.role})`;
    const shape = reasoningCommitmentShapeDefect(digestTier, v);
    if (shape !== null) return `${where}: ${shape.message}`;
    if (v.reasoningNonce === undefined || v.reasoning === undefined) continue;
    const recomputed = computeReasoningDigest(v.reasoningNonce, v.reasoning);
    if (recomputed !== v.reasoningDigest) {
      return (
        `${where}: stored reasoningDigest=${String(v.reasoningDigest)} does not match ` +
        `sha256(reasoningNonce ‖ reasoning)=${recomputed} — the reasoning was edited without re-committing`
      );
    }
  }
  return null;
}
