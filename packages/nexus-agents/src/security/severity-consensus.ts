/**
 * Severity Consensus — Multi-model vote on critical security findings (#1681 Phase 2b)
 *
 * For confirmed critical/high findings from triage, uses consensus voting
 * to validate severity. Rate-limited to top N findings per scan.
 *
 * @module security/severity-consensus
 */

import { z } from 'zod';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict, TriagedFinding } from './finding-triage.js';
export type { TriagedFinding } from './finding-triage.js';

// ============================================================================
// Types
// ============================================================================

export const SeverityVerdictSchema = z.object({
  originalSeverity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  consensusSeverity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  approved: z.boolean(),
  approvalPercentage: z.number().min(0).max(100),
  reasoning: z.string().max(500),
});

export type SeverityVerdict = z.infer<typeof SeverityVerdictSchema>;

export interface SeverityConsensusConfig {
  /** Max findings to run consensus on (default: 5). */
  readonly maxFindings: number;
}

export const DEFAULT_SEVERITY_CONSENSUS_CONFIG: SeverityConsensusConfig = {
  maxFindings: 5,
};

/** Function that runs consensus vote and returns approval + percentage. */
export type ConsensusFn = (proposal: string) => Promise<{
  approved: boolean;
  approvalPercentage: number;
}>;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Build a consensus proposal for a severity assessment.
 */
function buildSeverityProposal(finding: SecurityFinding, verdict: TriageVerdict): string {
  return [
    `Assess the severity of this confirmed security finding:`,
    ``,
    `Rule: ${finding.rule}`,
    `File: ${finding.file}:${String(finding.startLine)}`,
    `CWEs: ${finding.cweIds.join(', ') || 'None'}`,
    `Scanner severity: ${finding.severity}`,
    `Triage assessment: ${verdict.suggestedSeverity} (confidence: ${String(verdict.confidence)})`,
    `Triage reasoning: ${verdict.reasoning}`,
    ``,
    `Proposal: Classify this finding as "${verdict.suggestedSeverity}" severity.`,
    `Vote APPROVE if the suggested severity is correct.`,
    `Vote REJECT if the severity should be different.`,
  ].join('\n');
}

/**
 * Run severity consensus on a single triaged finding.
 */
export async function assessSeverity(
  triaged: TriagedFinding,
  consensusFn: ConsensusFn
): Promise<SeverityVerdict> {
  const proposal = buildSeverityProposal(triaged.finding, triaged.verdict);

  try {
    const result = await consensusFn(proposal);
    return {
      originalSeverity: triaged.finding.severity,
      consensusSeverity: result.approved
        ? triaged.verdict.suggestedSeverity
        : triaged.finding.severity,
      approved: result.approved,
      approvalPercentage: result.approvalPercentage,
      reasoning: result.approved
        ? `Consensus approved triage severity: ${triaged.verdict.suggestedSeverity}`
        : `Consensus rejected triage severity, retaining scanner severity: ${triaged.finding.severity}`,
    };
  } catch {
    // On consensus failure, retain original scanner severity
    return {
      originalSeverity: triaged.finding.severity,
      consensusSeverity: triaged.finding.severity,
      approved: false,
      approvalPercentage: 0,
      reasoning: 'Consensus vote failed — retaining scanner severity',
    };
  }
}

/**
 * Run severity consensus on a batch of triaged findings.
 * Only processes confirmed critical/high findings, rate-limited to maxFindings.
 */
export async function assessSeverityBatch(
  triagedFindings: readonly TriagedFinding[],
  consensusFn: ConsensusFn,
  config: SeverityConsensusConfig = DEFAULT_SEVERITY_CONSENSUS_CONFIG
): Promise<SeverityVerdict[]> {
  const criticalHigh = triagedFindings.filter(
    (t) =>
      t.verdict.confirmed &&
      (t.verdict.suggestedSeverity === 'critical' || t.verdict.suggestedSeverity === 'high')
  );

  const toAssess = criticalHigh.slice(0, config.maxFindings);
  const results: SeverityVerdict[] = [];

  for (const triaged of toAssess) {
    const verdict = await assessSeverity(triaged, consensusFn);
    results.push(verdict);
  }

  return results;
}
