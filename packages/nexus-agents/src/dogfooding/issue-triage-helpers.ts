/**
 * nexus-agents/dogfooding - Issue Triage Helpers
 *
 * Pure helper functions for issue classification, label extraction,
 * and result formatting. No side effects or API calls.
 *
 * @module dogfooding/issue-triage-helpers
 * (Source: Issue #828 — Wire remaining security modules)
 */

import type { CorroborationResult } from '../security/corroboration-validator.js';
import type { AgentAction } from '../security/action-schema.js';
import type { ScmCommentDetail } from '../scm/types.js';
import type {
  IssueCategory,
  IssueComment,
  IssueTriageResult,
  ProposedAction,
} from './issue-triage-types.js';
import { CATEGORY_DISPLAY_NAMES, CATEGORY_EMOJI } from './issue-triage-types.js';

// ============================================================================
// Issue Classification
// ============================================================================

/**
 * Keyword sets for each issue category.
 * Lower-cased for case-insensitive matching.
 */
const CATEGORY_KEYWORDS: Record<IssueCategory, readonly string[]> = {
  bug: ['bug', 'error', 'crash', 'broken', 'fix', 'fail', 'issue', 'wrong', 'unexpected'],
  feature: ['feature', 'request', 'enhancement', 'proposal', 'add', 'support', 'implement'],
  question: ['question', 'how to', 'help', 'confused', 'explain', 'documentation'],
  documentation: ['docs', 'documentation', 'readme', 'typo', 'example', 'guide'],
  security: ['security', 'vulnerability', 'cve', 'exploit', 'injection', 'xss', 'csrf'],
  performance: ['performance', 'slow', 'memory', 'leak', 'optimize', 'latency', 'timeout'],
};

/**
 * Classifies an issue by matching keywords in the title and body.
 * Returns the category with the highest keyword match count.
 *
 * @param title - Issue title
 * @param body - Issue body
 * @returns Tuple of [category, confidence]
 */
export function categorizeIssue(title: string, body: string): [IssueCategory, number] {
  const text = `${title} ${body}`.toLowerCase();
  const scores: Record<IssueCategory, number> = {
    bug: 0,
    feature: 0,
    question: 0,
    documentation: 0,
    security: 0,
    performance: 0,
  };

  let totalMatches = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        scores[category as IssueCategory]++;
        totalMatches++;
      }
    }
  }

  // Find category with highest score
  let bestCategory: IssueCategory = 'bug';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as IssueCategory;
    }
  }

  // Confidence: ratio of best score to total matches, minimum 0.1
  const confidence = totalMatches > 0 ? Math.min(bestScore / totalMatches, 1) : 0.1;

  return [bestCategory, Math.round(confidence * 100) / 100];
}

// ============================================================================
// Label Extraction
// ============================================================================

/**
 * Common label patterns that can be extracted from issue text.
 */
const LABEL_HINTS: ReadonlyMap<string, string> = new Map([
  ['bug', 'bug'],
  ['feature request', 'enhancement'],
  ['enhancement', 'enhancement'],
  ['breaking change', 'breaking-change'],
  ['documentation', 'documentation'],
  ['help wanted', 'help wanted'],
  ['good first issue', 'good first issue'],
  ['security', 'security'],
  ['performance', 'performance'],
  ['regression', 'regression'],
]);

/**
 * Extracts suggested labels from issue title and body text.
 *
 * @param title - Issue title
 * @param body - Issue body
 * @returns Array of suggested label strings (max 5)
 */
export function extractLabelsFromBody(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const labels: string[] = [];

  for (const [pattern, label] of LABEL_HINTS) {
    if (text.includes(pattern) && !labels.includes(label)) {
      labels.push(label);
    }
  }

  return labels.slice(0, 5);
}

/** Maps SCM comment details to the triage representation. */
export function mapIssueComments(comments: readonly ScmCommentDetail[]): IssueComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    author: comment.author,
    authorAssociation: comment.authorAssociation,
    createdAt: comment.createdAt,
  }));
}

/** Creates a human-readable description for a typed action. */
export function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'ClassifyIssue':
      return `Classified as ${action.category} (${String(Math.round(action.confidence * 100))}% confidence)`;
    case 'ProposeLabels':
      return `Suggest labels: ${action.labels.join(', ')}`;
    case 'SummarizeIssue':
      return action.summary.slice(0, 100);
    default:
      return `${action.type} action`;
  }
}

/** Builds details object for a proposed action. */
export function buildActionDetails(
  action: AgentAction,
  policy: { allowed: boolean; violations: readonly { rule: string; message: string }[] },
  corrob: CorroborationResult
): Record<string, unknown> {
  return {
    policyViolations: policy.violations.map((violation) => violation.rule),
    missingCorroboration: corrob.missing,
    ...(action.type === 'ClassifyIssue' && { category: action.category }),
    ...(action.type === 'ProposeLabels' && { labels: action.labels }),
  };
}

// ============================================================================
// Result Formatting
// ============================================================================

/**
 * Formats a triage result as a GitHub markdown comment.
 *
 * @param result - The complete triage result
 * @returns Formatted markdown string
 */
export function formatTriageComment(result: IssueTriageResult): string {
  const emoji = CATEGORY_EMOJI[result.category];
  const categoryName = CATEGORY_DISPLAY_NAMES[result.category];
  const lines: string[] = [];

  lines.push(`## ${emoji} Issue Triage: ${categoryName}`);
  lines.push('');
  lines.push(
    `**Category:** ${categoryName} (${String(Math.round(result.categoryConfidence * 100))}% confidence)`
  );
  lines.push(
    `**Trust Tier:** ${result.trustAssessment.trustTier} (${result.trustAssessment.userRole})`
  );

  if (result.trustAssessment.reputationScore !== undefined) {
    lines.push(`**Reputation Score:** ${String(result.trustAssessment.reputationScore)}/100`);
  }

  if (result.trustAssessment.isSuspicious) {
    lines.push('');
    lines.push(':warning: **Suspicious signals detected:**');
    for (const signal of result.trustAssessment.suspiciousSignals) {
      lines.push(`- ${signal}`);
    }
  }

  if (result.proposedActions.length > 0) {
    lines.push('');
    lines.push('### Proposed Actions');
    lines.push('');
    for (const action of result.proposedActions) {
      const status = formatActionStatus(action);
      lines.push(`- ${status} **${action.type}**: ${action.description}`);
    }
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`_Triage completed in ${String(result.totalDurationMs)}ms_`);

  return lines.join('\n');
}

/**
 * Formats the policy/corroboration status of an action.
 */
function formatActionStatus(action: ProposedAction): string {
  if (action.policyApproved && action.corroborated) return ':white_check_mark:';
  if (action.policyApproved && !action.corroborated) return ':yellow_circle:';
  return ':no_entry:';
}
