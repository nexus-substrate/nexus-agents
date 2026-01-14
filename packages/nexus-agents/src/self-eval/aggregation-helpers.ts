/**
 * Aggregation Helpers for Self-Evaluation
 *
 * Helper functions for formatting and displaying aggregation results.
 *
 * @module self-eval/aggregation-helpers
 */

import type { AggregatedResult, OutputOptions } from './aggregation-types.js';

/**
 * Format a single result as summary (one line).
 */
export function formatSummary(result: AggregatedResult): string {
  const confidence = (result.confidence * 100).toFixed(0);
  const dissentCount = result.dissent.length;
  const dissent = dissentCount > 0 ? ` (${String(dissentCount)} dissent)` : '';
  return `[${result.finalRecommendation.toUpperCase()}] ${result.component} (${confidence}% confidence)${dissent}`;
}

/**
 * Format a single result with full details.
 */
export function formatVerbose(result: AggregatedResult, includeAuditTrail: boolean): string {
  const separator = '='.repeat(60);
  const lines: string[] = [
    separator,
    `Component: ${result.component}`,
    `Final Recommendation: ${result.finalRecommendation.toUpperCase()}`,
    `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
    `Evidence Quality: ${(result.evidenceQuality * 100).toFixed(1)}%`,
    ``,
    `Votes:`,
  ];

  for (const vote of result.votes) {
    lines.push(
      `  - ${vote.agent}: ${vote.recommendation} (${(vote.confidence * 100).toFixed(0)}%)`
    );
    for (const concern of vote.concerns) {
      lines.push(`      * ${concern}`);
    }
  }

  if (result.dissent.length > 0) {
    lines.push('');
    lines.push('Dissenting Opinions:');
    for (const d of result.dissent) {
      lines.push(`  - ${d.agent}: ${d.recommendation} (${(d.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (includeAuditTrail) {
    lines.push('');
    lines.push('Audit Trail:');
    for (const entry of result.auditTrail) {
      const verified = entry.verified ? '[v]' : '[ ]';
      const evidence = entry.evidence !== null ? ` | ${entry.evidence}` : '';
      lines.push(`  ${verified} ${entry.agent}: ${entry.claim}${evidence}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format aggregated results for output.
 */
export function formatResults(
  results: readonly AggregatedResult[],
  options: OutputOptions = {}
): string {
  const lines: string[] = [];
  const isVerbose = options.verbose === true;
  const includeAudit = options.includeAuditTrail === true;

  for (const result of results) {
    if (isVerbose) {
      lines.push(formatVerbose(result, includeAudit));
    } else {
      lines.push(formatSummary(result));
    }
  }

  return lines.join('\n');
}
