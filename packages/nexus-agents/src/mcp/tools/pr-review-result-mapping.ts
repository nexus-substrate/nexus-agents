/**
 * nexus-agents/mcp - PR Review Result Mapping (split out of pr-review-tool.ts, #4278).
 *
 * Pure per-voter → per-review mapping and summarization helpers for the pr_review
 * tool. Split into its own module (no behavior change) to keep pr-review-tool.ts
 * under the repo's `max-lines` lint budget after adding the #4278 `repoPath` input.
 *
 * @module mcp/tools/pr-review-result-mapping
 */

import type { AgentVoteResult } from '../../cli/vote-types.js';
import { isFindingVerified, parseFindings, type Finding } from './pr-review-findings.js';
import { mapVoteDecisionToPrDecision, type PrReviewVote } from './pr-review-tool.js';

/** Resolves findings for a voter result. Preferred path is the top-level
 * `vote.findings` array (#2245 v4 follow-up — JSON-native, lossless). Falls
 * back to parsing a YAML block from reasoning text for older voter outputs
 * that may still emit the legacy format. */
export function resolveFindings(result: AgentVoteResult): readonly Finding[] {
  const raw = result.vote.findings;
  if (raw !== undefined && raw.length > 0) {
    return raw.map((f) => ({
      summary: f.summary,
      location: f.location,
      severity: f.severity,
      gate: f.gate,
      claim: f.claim,
      verified: isFindingVerified(f.gate),
    }));
  }
  // Fallback: legacy YAML-in-reasoning format.
  return parseFindings(result.vote.reasoning);
}

export function toPrReviewVote(result: AgentVoteResult): PrReviewVote {
  return {
    role: result.role,
    decision: mapVoteDecisionToPrDecision(result.vote.decision),
    confidence: result.vote.confidence,
    reasoning: result.vote.reasoning,
    findings: resolveFindings(result),
    source: result.source,
    cli: result.cli,
    processingTimeMs: result.processingTimeMs,
    ...(result.error !== undefined && { errorMessage: result.error }),
  };
}

export function summarizeReviews(reviews: readonly PrReviewVote[]): {
  approveCount: number;
  requestChangesCount: number;
  abstainCount: number;
  errorCount: number;
} {
  return {
    approveCount: reviews.filter((r) => r.source !== 'error' && r.decision === 'approve').length,
    requestChangesCount: reviews.filter(
      (r) => r.source !== 'error' && r.decision === 'request_changes'
    ).length,
    abstainCount: reviews.filter((r) => r.source !== 'error' && r.decision === 'abstain').length,
    errorCount: reviews.filter((r) => r.source === 'error').length,
  };
}
