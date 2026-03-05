/**
 * nexus-agents/consensus - Incremental Quorum
 *
 * Detects ambiguous voting scenarios and triggers voter pool expansion.
 * Complements agreement-based cascading (early termination when certain)
 * with expansion when uncertain.
 *
 * (Source: Issue #1408 — Incremental Quorum for Consensus Robustness)
 *
 * @module consensus/incremental-quorum
 */

import type { Vote } from './types.js';

/**
 * Parameters for ambiguity detection.
 */
export interface AmbiguityParams {
  /** Minimum average confidence to avoid expansion. */
  readonly confidenceThreshold: number;
  /** If approval rate is within this band of the threshold, consider ambiguous. */
  readonly ambiguityBand: number;
}

/**
 * Determines if the current voting state is ambiguous.
 *
 * Ambiguity is detected when:
 * 1. Approval rate is within the ambiguity band of the threshold, OR
 * 2. Average voter confidence is below the confidence threshold
 *
 * @param votes - Current vote map
 * @param totalExpected - Total expected voters
 * @param threshold - Algorithm-specific approval threshold (0-1)
 * @param params - Ambiguity detection parameters
 * @returns true if the voting state is ambiguous
 */
export function isVotingAmbiguous(
  votes: ReadonlyMap<string, Vote>,
  totalExpected: number,
  threshold: number,
  params: AmbiguityParams
): boolean {
  if (votes.size === 0) return false;

  let approvals = 0;
  let totalConfidence = 0;
  for (const vote of votes.values()) {
    if (vote.decision === 'approve') approvals++;
    totalConfidence += vote.confidence;
  }

  const approvalRate = approvals / totalExpected;
  const avgConfidence = totalConfidence / votes.size;

  // Check if approval rate is within the ambiguity band of threshold
  const lowerBand = threshold - params.ambiguityBand;
  const upperBand = threshold + params.ambiguityBand;
  const rateAmbiguous = approvalRate >= lowerBand && approvalRate <= upperBand;

  // Check if confidence is too low
  const confidenceAmbiguous = avgConfidence < params.confidenceThreshold;

  return rateAmbiguous || confidenceAmbiguous;
}
