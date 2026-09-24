/**
 * Content-provenance trust tier (#6751).
 *
 * The caller's tier (`RequestContext.trustTier`) says who invoked a tool. A
 * record about CONTENT needs the tier of where that content came from, which is
 * the least-trusted of the caller and every source that fed it. Consumers: the
 * dev-pipeline consensus→execute policy gate ({@link resolveContentTrustTier}),
 * and the `memory_write` tool and stored-memory tier reader
 * ({@link leastTrustedTier}).
 *
 * @module security/content-trust-tier
 */

import { TRUST_TIER_NUMERIC, TrustTierSchema } from './trust-types.js';
import type { TrustTier } from './trust-types.js';

/**
 * Tier of content read from external sources (web and registry discovery with
 * unknown authors), which `.rules/untrusted-input.md` classes as Tier 3
 * (Untrusted).
 */
export const EXTERNAL_CONTENT_TRUST_TIER: TrustTier = '3';

/**
 * Least-trusted (highest-numbered) of `tiers`; `undefined` for an empty list —
 * no tier was recorded, which is not the same as a trusted one.
 */
export function leastTrustedTier(tiers: readonly TrustTier[]): TrustTier | undefined {
  let least: TrustTier | undefined;
  for (const tier of tiers) {
    if (least === undefined || TRUST_TIER_NUMERIC[tier] > TRUST_TIER_NUMERIC[least]) least = tier;
  }
  return least;
}

/**
 * Resolve the content tier from the caller tier and the source tiers that fed
 * the content. Returns the least-trusted (highest-numbered) of them.
 *
 * Empty and absent cases are explicit:
 * - `callerTier` undefined, or not a valid tier string, returns `undefined`.
 *   Policy consumers then default to Tier 4 (fail-closed); an unknown caller is
 *   never upgraded by a source tier.
 * - No source tiers returns the caller tier: the content is the caller's own.
 */
export function resolveContentTrustTier(
  callerTier: string | undefined,
  sourceTiers: readonly TrustTier[]
): TrustTier | undefined {
  const parsed = TrustTierSchema.safeParse(callerTier);
  if (!parsed.success) return undefined;
  return leastTrustedTier([parsed.data, ...sourceTiers]);
}
