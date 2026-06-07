/**
 * Priority → consensus-rigor policy for autonomous remediation (#3540 phase 3 / #3653).
 *
 * Owner-directed, consensus-ratified (higher_order 7/7): every surfaced gap/idea/
 * signal is tagged p0–p4 (priority = severity × blast-radius), and the priority
 * selects the consensus rigor required before the loop may auto-remediate it.
 * Higher blast-radius ⇒ stricter algorithm + (for p0) a mandatory dry-run; the
 * lowest tier is file-only (backlog, never auto-remediated).
 *
 * This is the pure policy core — the auto-filer (labels), the enforce
 * orchestrator (gating), and the issue-triage surface all read from here so the
 * mapping has a single authoritative representation (DRY).
 *
 * @module mcp/tools/remediation-priority
 */

// @export-no-consumer-yet — see #3653
// The p0–p4 auto-filer (labels) and the enforce orchestrator (consensus gating)
// consume this policy next; it is the shared authoritative mapping built first.

import type { ConsensusAlgorithm } from '../../consensus/types-core.js';
import type { ImprovementSignal } from './improvement-review.js';
import { isSecuritySignal } from './improvement-remediation-shadow.js';

/** Priority tiers, p0 (most critical) → p4 (trivial/idea). */
export type RemediationPriority = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

/** All tiers, strictest first. */
export const REMEDIATION_PRIORITIES: readonly RemediationPriority[] = [
  'p0',
  'p1',
  'p2',
  'p3',
  'p4',
];

/** The GitHub label applied to an auto-filed issue at a given priority. */
export function priorityLabel(priority: RemediationPriority): string {
  return priority; // labels are literally `p0`…`p4`
}

/** The consensus rigor required before auto-remediating a tier. */
export interface ConsensusRequirement {
  /** Whether the tier is eligible for auto-remediation at all (p4 = file-only). */
  readonly autoRemediate: boolean;
  /** Consensus algorithm to require (undefined when not auto-remediated). */
  readonly algorithm?: ConsensusAlgorithm;
  /** p0 additionally requires a green audit-mode dry-run before a PR is opened. */
  readonly requiresDryRun: boolean;
}

/**
 * Priority → consensus requirement. p0 is unanimous + dry-run (security/breaking);
 * tiers relax down to file-only at p4. Uses the canonical {@link ConsensusAlgorithm}
 * values so the enforce path passes them straight to `consensus_vote`.
 */
const REQUIREMENT_BY_PRIORITY: Readonly<Record<RemediationPriority, ConsensusRequirement>> = {
  p0: { autoRemediate: true, algorithm: 'unanimous', requiresDryRun: true },
  p1: { autoRemediate: true, algorithm: 'supermajority', requiresDryRun: false },
  p2: { autoRemediate: true, algorithm: 'higher_order', requiresDryRun: false },
  p3: { autoRemediate: true, algorithm: 'simple_majority', requiresDryRun: false },
  p4: { autoRemediate: false, requiresDryRun: false },
};

/** Resolve the consensus requirement for a priority tier. */
export function consensusFor(priority: RemediationPriority): ConsensusRequirement {
  return REQUIREMENT_BY_PRIORITY[priority];
}

/**
 * Classify an improvement signal's priority. Security is ALWAYS p0 (fail-closed,
 * via {@link isSecuritySignal} which is itself keyword-fail-closed, #3615);
 * otherwise severity drives the tier. Returns the strictest applicable tier.
 */
export function classifySignalPriority(signal: ImprovementSignal): RemediationPriority {
  if (isSecuritySignal(signal)) return 'p0';
  switch (signal.severity) {
    case 'critical':
      return 'p0';
    case 'warning':
      return 'p2';
    default:
      return 'p3';
  }
}
