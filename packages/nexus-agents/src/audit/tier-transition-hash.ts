/**
 * nexus-agents/audit - Tier-transition hash canonicalization (#3921)
 *
 * The tier-transition payload an audit event carries in `metadata.tierTransition`
 * is integrity-critical (the ratification gate decides on it) but lived OUTSIDE
 * the event hash. This module canonicalizes that payload into a stable string so
 * `computeEventHash` can fold it into the chain under `hashVersion: 2`. Kept in a
 * sibling module so the logger stays under the file-length cap.
 *
 * INVARIANT (#3961): hash-coverage ⊇ gate-consumption. The SAME predicate
 * ({@link hasTierTransitionPayload}) decides both whether the payload is folded
 * into the hash and whether the ratification gate treats the event as a
 * transition, so any governance event the gate consumes as a transition has its
 * payload hash-covered. Mutating a covered payload therefore always breaks the
 * chain. (Tamper-EVIDENT under unkeyed SHA-256, not tamper-proof — see the
 * audit-hash-chain threat model.)
 *
 * @module audit/tier-transition-hash
 */

import {
  TierTransitionPayloadSchema,
  TIER_TRANSITION_METADATA_KEY,
  type AuditEvent,
} from './audit-types.js';

/**
 * THE single predicate for "this event carries a tier-transition payload": a
 * `governance`-category event whose `metadata.tierTransition` parses against
 * {@link TierTransitionPayloadSchema}. This is the ONE definition both the
 * hash-coverage decision (`computeEventHash`) and the gate-consumption recovery
 * (`extractTierTransition` in audit-logger.ts) derive from, so the two can NEVER
 * diverge (#3961) and hash-coverage ⊇ gate-consumption holds by construction.
 *
 * Previously the hash side keyed off `action.startsWith('tier.')`, NARROWER than
 * what the gate recovers: a `governance` event with a non-`tier.` action carrying
 * a valid payload was hashed WITHOUT covering the payload, yet consumed by the
 * gate as a transition — a single-event undetectable forge (#3961, now closed).
 *
 * Detection is keyed off COVERED head fields (`category`) plus the payload's own
 * validity — NOT the mutable `hashVersion` metadata field (#3921 downgrade fix):
 * keying off stored `hashVersion` let an attacker strip/alter that field to force
 * the v1 head-only projection and silently flip `toTier`. Because `category` and
 * the canonicalized payload are folded into the hash, an attacker cannot escape
 * the payload-covering v2 projection without breaking the chain.
 */
export function hasTierTransitionPayload(event: AuditEvent): boolean {
  if (event.category !== 'governance') return false;
  const raw = event.metadata?.[TIER_TRANSITION_METADATA_KEY];
  if (raw === undefined) return false;
  return TierTransitionPayloadSchema.safeParse(raw).success;
}

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
