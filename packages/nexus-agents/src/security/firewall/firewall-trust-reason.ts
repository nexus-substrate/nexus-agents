/**
 * nexus-agents/security/firewall - Trust audit reason
 *
 * The trust audit event's `reason` must state what the reputation gate did —
 * or, under `audit`, what it would have done (#4992 review). A suppressed
 * demotion that leaves no trace reads as a clean classification.
 *
 * @module security/firewall/firewall-trust-reason
 */

import type { ReputationGateDecision } from '../reputation-model.js';

/**
 * Appends the gate's effect to the classifier's reason.
 *
 * @param reason  The classifier's own reason.
 * @param demoted Whether the enforced tier differs from the classifier tier.
 * @param gate    The gate decision, or `undefined` when no gate ran.
 */
export function describeGate(
  reason: string,
  demoted: boolean,
  gate: ReputationGateDecision | undefined
): string {
  if (gate === undefined) return reason;
  if (demoted) {
    return `${reason}; demoted to Tier ${gate.enforcedTier} by reputation gating (${gate.mode})`;
  }
  if (gate.demotionSuppressed) {
    return `${reason}; would demote to Tier ${gate.reconciledTier} (reputation gating: ${gate.mode})`;
  }
  return reason;
}
