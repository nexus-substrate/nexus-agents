/**
 * nexus-agents/audit - Tier-transition hash canonicalization (#3921)
 *
 * The tier-transition payload an audit event carries in `metadata.tierTransition`
 * is integrity-critical (the ratification gate decides on it) but lived OUTSIDE
 * the event hash. This module canonicalizes that payload into a stable string so
 * `computeEventHash` can fold it into the chain under `hashVersion: 2`. Kept in a
 * sibling module so the logger stays under the file-length cap.
 *
 * @module audit/tier-transition-hash
 */

import { TierTransitionPayloadSchema } from './audit-types.js';

/**
 * Canonicalize the tier-transition payload into a stable, key-ordered string for
 * hashing (#3921). Fixed field order (not object-insertion order) so the hash is
 * independent of JSON key serialization; `ratificationVoteRef` is folded in as
 * `null` when absent so adding/stripping a ref changes the hash. A payload that
 * no longer parses binds its raw value, so the recomputed hash diverges from the
 * stored one (a tampered v2 payload always breaks the chain).
 */
export function canonicalTierTransition(raw: unknown): string {
  const parsed = TierTransitionPayloadSchema.safeParse(raw);
  if (!parsed.success) return JSON.stringify({ tierTransitionInvalid: raw });
  const p = parsed.data;
  return JSON.stringify({
    kind: p.kind,
    subject: p.subject,
    fromTier: p.fromTier,
    toTier: p.toTier,
    evidenceRef: p.evidenceRef,
    ratificationVoteRef: p.ratificationVoteRef ?? null,
  });
}
