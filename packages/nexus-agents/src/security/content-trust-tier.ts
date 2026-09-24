/**
 * Content-provenance trust tier (#6751).
 *
 * The caller's tier (`RequestContext.trustTier`) says who invoked a tool. A
 * record about CONTENT needs the tier of where that content came from, which is
 * the least-trusted of the caller, the task content itself (declared by the
 * caller, or Tier 3 when undeclared — #6795) and every source that fed it.
 * Consumers: the dev-pipeline consensus→execute policy gate
 * ({@link resolveContentTrustProvenance}),
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
 * Tier applied to a caller-supplied task string whose provenance nobody
 * declared (#6795): Tier 3 (Untrusted). A trusted caller can relay hostile
 * content (pasted issue text, a forwarded comment), so the caller's own tier
 * says nothing about where the words came from.
 */
const UNDECLARED_SOURCE_TRUST_TIER: TrustTier = '3';

/**
 * Every input to a content-tier decision, and the decision (#6795). Carried
 * into the policy-gate snapshot and a debug log so a reviewer can see what the
 * caller DECLARED, what was MEASURED, and whether the declaration was clamped.
 */
export interface ContentTrustProvenance {
  /** Measured caller tier; `undefined` when nothing about the caller was measured. */
  readonly callerTier: TrustTier | undefined;
  /** The caller's declared `sourceTrustTier` for the task content; `undefined` = not declared. */
  readonly declaredSourceTier: TrustTier | undefined;
  /** Tier applied to the task content: the declaration, or {@link UNDECLARED_SOURCE_TRUST_TIER}. */
  readonly taskContentTier: TrustTier;
  /**
   * True when the declaration named a MORE trusted tier than the measured
   * caller tier. A declaration never raises trust above the caller, so the
   * caller tier bound the result.
   */
  readonly declarationClamped: boolean;
  /** Tiers of the measured sources that fed the run (research fetches are 3). */
  readonly sourceTiers: readonly TrustTier[];
  /** The resolved content tier; `undefined` when the caller tier is unmeasured. */
  readonly contentTier: TrustTier | undefined;
}

/**
 * Resolve the content tier and record how it was reached (#6751, #6795).
 *
 * The content tier is the least-trusted of the caller tier, the task content
 * tier (declared, or 3 when omitted) and every measured source tier. Taking
 * the least-trusted also bounds the declaration: it can lower trust, never
 * raise it above the measured caller.
 *
 * Empty and absent cases are explicit:
 * - `callerTier` undefined, or not a valid tier string, gives `contentTier`
 *   `undefined`. Policy consumers then default to Tier 4 (fail-closed); an
 *   unmeasured caller is never upgraded by a declaration or a source tier.
 * - No declaration applies {@link UNDECLARED_SOURCE_TRUST_TIER}: unknown
 *   provenance is untrusted, and that is a measured value, not an absent one.
 * - No source tiers leaves the caller and task content tiers.
 */
export function resolveContentTrustProvenance(
  callerTier: string | undefined,
  sourceTiers: readonly TrustTier[],
  declaredSourceTier: TrustTier | undefined
): ContentTrustProvenance {
  const parsed = TrustTierSchema.safeParse(callerTier);
  const measuredCaller = parsed.success ? parsed.data : undefined;
  const taskContentTier = declaredSourceTier ?? UNDECLARED_SOURCE_TRUST_TIER;
  const declarationClamped =
    measuredCaller !== undefined &&
    declaredSourceTier !== undefined &&
    TRUST_TIER_NUMERIC[declaredSourceTier] < TRUST_TIER_NUMERIC[measuredCaller];
  return {
    callerTier: measuredCaller,
    declaredSourceTier,
    taskContentTier,
    declarationClamped,
    sourceTiers,
    contentTier:
      measuredCaller === undefined
        ? undefined
        : leastTrustedTier([measuredCaller, taskContentTier, ...sourceTiers]),
  };
}

/**
 * The content tier alone; see {@link resolveContentTrustProvenance}.
 * `declaredSourceTier` is required so every call site states whether the
 * caller declared a provenance — `undefined` means Tier 3, not the caller's.
 */
export function resolveContentTrustTier(
  callerTier: string | undefined,
  sourceTiers: readonly TrustTier[],
  declaredSourceTier: TrustTier | undefined
): TrustTier | undefined {
  return resolveContentTrustProvenance(callerTier, sourceTiers, declaredSourceTier).contentTier;
}
