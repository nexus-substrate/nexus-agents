/**
 * Access Constraint Deriver — Trust-tier gate (#1977 condition 4).
 *
 * Filters which user objectives are eligible for LLM-based derivation.
 *
 * Rationale: the LLM deriver uses the SAME model backbone that might be
 * compromised by prompt injection. If the objective itself comes from an
 * untrusted source (GitHub issue comment from unknown user = Tier 3,
 * content flagged with injection patterns = Tier 4), feeding it to the
 * deriver LLM would let an attacker influence the derived policy.
 *
 * So: only Tier 1 (authoritative) and Tier 2 (semi-trusted) inputs go
 * to the LLM. Tier 3/4 goes directly to the regex fallback, skipping
 * the LLM entirely.
 *
 * @module security/access-constraint-deriver/trust-gate
 */

import type { TrustTier } from '../trust-types.js';

/** Decision returned by the trust gate. */
export type TrustGateDecision =
  | { readonly allow: 'llm' }
  | { readonly allow: 'fallback-only'; readonly reason: string };

/**
 * Decides whether an objective with the given trust tier may be sent to
 * the LLM deriver.
 *
 * - Tier 1 (authoritative): LLM allowed
 * - Tier 2 (semi-trusted): LLM allowed
 * - Tier 3 (untrusted): fallback-only — refuse LLM path
 * - Tier 4 (hostile): fallback-only — refuse LLM path
 * - Missing / unknown tier: fallback-only (safe default)
 */
export function gateTrust(tier: TrustTier | undefined): TrustGateDecision {
  if (tier === '1' || tier === '2') return { allow: 'llm' };
  if (tier === '3') {
    return {
      allow: 'fallback-only',
      reason: 'trust-tier-3: untrusted objective; skipping LLM derivation',
    };
  }
  if (tier === '4') {
    return {
      allow: 'fallback-only',
      reason: 'trust-tier-4: hostile objective; skipping LLM derivation',
    };
  }
  return {
    allow: 'fallback-only',
    reason: 'trust-tier-unknown: missing classification; safe-default to fallback',
  };
}
