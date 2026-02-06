/**
 * nexus-agents/dogfooding - PR Reviewer Helpers
 *
 * Helper functions for PR review formatting and aggregation.
 *
 * @module dogfooding/pr-reviewer-helpers
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import { randomUUID } from 'node:crypto';
import type {
  PRMetadata,
  PRReviewResult,
  ExpertReviewResult,
  ReviewFinding,
  ReviewCategory,
  ReviewSeverity,
  ReviewDecision,
} from './pr-review-types.js';
import {
  SEVERITY_ORDER,
  CATEGORY_DISPLAY_NAMES,
  SEVERITY_EMOJI,
  DECISION_EMOJI,
} from './pr-review-types.js';

// =============================================================================
// Parsing Helpers
// =============================================================================

export function parseSeverity(value: unknown): ReviewSeverity {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower in SEVERITY_ORDER) return lower as ReviewSeverity;
  }
  return 'medium';
}

export function parseCategory(value: unknown): ReviewCategory {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower in CATEGORY_DISPLAY_NAMES) return lower as ReviewCategory;
  }
  return 'code_quality';
}

export function extractSummary(output: Record<string, unknown>): string {
  if (typeof output.summary === 'string') return output.summary;
  if (typeof output.content === 'string') return output.content;
  if (typeof output.message === 'string') return output.message;
  return 'Review completed';
}

export function extractStringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

// =============================================================================
// Finding Parsing
// =============================================================================

export function parseFindings(
  output: Record<string, unknown>,
  expertId: string,
  minSeverity: ReviewSeverity
): ReviewFinding[] {
  const minOrder = SEVERITY_ORDER[minSeverity];
  const sources = collectSources(output);

  const findings: ReviewFinding[] = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const finding = parseOneFinding(item, expertId, minOrder);
      if (finding !== null) findings.push(finding);
    }
  }
  return findings;
}

function collectSources(output: Record<string, unknown>): unknown[] {
  return [
    output.findings,
    output.vulnerabilities,
    output.issues,
    (output as { content?: { findings?: unknown } }).content,
  ];
}

function parseOneFinding(item: unknown, expertId: string, minOrder: number): ReviewFinding | null {
  if (typeof item !== 'object' || item === null) return null;

  const record = item as Record<string, unknown>;
  const severity = parseSeverity(record.severity);
  if (SEVERITY_ORDER[severity] < minOrder) return null;

  return {
    id: randomUUID(),
    category: parseCategory(record.category),
    severity,
    title: extractStringField(record, 'title', 'name') ?? 'Finding',
    description: extractStringField(record, 'description', 'message') ?? '',
    file: typeof record.file === 'string' ? record.file : undefined,
    line: typeof record.line === 'number' ? record.line : undefined,
    suggestion: typeof record.suggestion === 'string' ? record.suggestion : undefined,
    expertId,
    confidence: typeof record.confidence === 'number' ? record.confidence : 0.7,
  };
}

// =============================================================================
// Decision Helpers
// =============================================================================

export function determineApproval(findings: ReviewFinding[]): boolean {
  const hasBlocking = findings.some((f) => f.severity === 'critical' || f.severity === 'high');
  return !hasBlocking;
}

export function determineDecision(
  reviews: ExpertReviewResult[],
  findings: ReviewFinding[]
): ReviewDecision {
  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasHigh = findings.some((f) => f.severity === 'high');
  const allApproved = reviews.every((r) => r.approved);

  if (hasCritical) return 'request_changes';
  if (hasHigh && !allApproved) return 'request_changes';
  if (findings.length > 0) return 'comment';
  return 'approve';
}

export function calculateConsensus(reviews: ExpertReviewResult[]): number {
  if (reviews.length === 0) return 1;
  const approvals = reviews.filter((r) => r.approved).length;
  return approvals / reviews.length;
}

// =============================================================================
// Counting Helpers
// =============================================================================

export function countBySeverity(findings: ReviewFinding[]): Record<ReviewSeverity, number> {
  const counts: Record<ReviewSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const f of findings) {
    counts[f.severity]++;
  }

  return counts;
}

export function countByCategory(findings: ReviewFinding[]): Record<ReviewCategory, number> {
  const counts: Record<ReviewCategory, number> = {
    security: 0,
    performance: 0,
    code_quality: 0,
    testing: 0,
    documentation: 0,
    architecture: 0,
  };

  for (const f of findings) {
    counts[f.category]++;
  }

  return counts;
}

export function sumFindings(counts: Record<ReviewSeverity, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// =============================================================================
// Summary Generation
// =============================================================================

export function generateSummary(
  pr: PRMetadata,
  reviews: ExpertReviewResult[],
  decision: ReviewDecision
): string {
  const expertSummaries = reviews
    .map((r) => `- **${CATEGORY_DISPLAY_NAMES[r.expertType as ReviewCategory]}**: ${r.summary}`)
    .join('\n');

  return `Reviewed PR #${String(pr.number)}: ${pr.title}

**Decision:** ${decision.replaceAll('_', ' ')}
**Experts consulted:** ${String(reviews.length)}

${expertSummaries}`;
}

// =============================================================================
// GitHub Comment Formatting
// =============================================================================

/**
 * Formats the review result as a GitHub comment.
 */
export function formatReviewComment(result: PRReviewResult): string {
  const emoji = DECISION_EMOJI[result.decision];
  const decisionText = result.decision.replaceAll('_', ' ').toUpperCase();

  const findingsSection = formatFindingsSection(result);
  const statsSection = formatStatsSection(result);

  return `## ${emoji} Nexus Agents Review: ${decisionText}

${result.summary}

${findingsSection}

${statsSection}

---
*Reviewed by [nexus-agents](https://github.com/williamzujkowski/nexus-agents) in ${String(result.totalDurationMs)}ms*`;
}

function formatFindingsSection(result: PRReviewResult): string {
  const allFindings = result.expertReviews.flatMap((r) => r.findings);

  if (allFindings.length === 0) {
    return '_No issues found._';
  }

  const sorted = [...allFindings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  const lines = ['### Findings', ''];

  for (const f of sorted) {
    const emoji = SEVERITY_EMOJI[f.severity];
    const loc =
      f.file !== undefined
        ? ` (\`${f.file}${f.line !== undefined ? `:${String(f.line)}` : ''}\`)`
        : '';
    lines.push(`${emoji} **${f.title}**${loc}`);
    lines.push(`> ${f.description}`);
    if (f.suggestion !== undefined) {
      lines.push(`> 💡 ${f.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatStatsSection(result: PRReviewResult): string {
  const { findingsBySeverity } = result;
  const total = sumFindings(findingsBySeverity);

  const parts: string[] = [];
  for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as ReviewSeverity[]) {
    const count = findingsBySeverity[severity];
    if (count > 0) {
      parts.push(`${SEVERITY_EMOJI[severity]} ${String(count)} ${severity}`);
    }
  }

  return `<details>
<summary>Review Statistics (${String(total)} findings)</summary>

- Experts: ${String(result.expertCount)}
- Consensus: ${(result.consensusScore * 100).toFixed(0)}%
- Duration: ${String(result.totalDurationMs)}ms
- Findings: ${parts.join(', ') || 'none'}

</details>`;
}

// =============================================================================
// Failed Review Factory
// =============================================================================

export function createFailedReview(
  expertId: string,
  category: ReviewCategory,
  durationMs: number,
  error: string
): ExpertReviewResult {
  return {
    expertId,
    expertType: category,
    approved: true, // Don't block on failures
    summary: `Review failed: ${error}`,
    findings: [],
    durationMs,
    confidence: 0,
  };
}
