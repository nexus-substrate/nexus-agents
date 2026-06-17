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

import { TierTransitionPayloadSchema, type AuditEvent } from './audit-types.js';

/**
 * Identify a tier-transition event by its COVERED head fields — a `governance`
 * event whose `action` is `tier.*` (the only emitter is `logTierTransition`) —
 * NOT by the mutable `hashVersion` metadata field. This is the integrity hinge
 * (#3921 downgrade fix): keying the v2 projection off the stored `hashVersion`
 * let an attacker editing the plaintext log strip/alter that field to force the
 * v1 head-only projection and silently flip `toTier`. Because `category` and
 * `action` are themselves folded into the hash, an attacker cannot escape the
 * payload-covering v2 projection without breaking the chain.
 */
export function isTierTransitionEvent(event: AuditEvent): boolean {
  return event.category === 'governance' && event.action.startsWith('tier.');
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
