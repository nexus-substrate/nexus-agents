/**
 * nexus-agents/dogfooding - Issue Triage Helpers
 *
 * Helper functions for issue classification, label extraction, per-action
 * validation and result formatting. Pure except `validateActionsThroughFirewall`,
 * which runs the shared untrusted-input firewall (#5383).
 *
 * @module dogfooding/issue-triage-helpers
 * (Source: Issue #828 — Wire remaining security modules)
 */

import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';
import type { AgentAction } from '../security/action-schema.js';
import type { FirewallProcessOptions } from '../security/firewall/firewall-types.js';
import type { TrustTier } from '../security/trust-types.js';
import type {
  FirewallActionInput,
  FirewallCorroborationDecision,
} from './untrusted-input-firewall.js';
import {
  evaluateActionThroughFirewall,
  validateActionCorroboration,
} from './untrusted-input-firewall.js';
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

/**
 * Builds details object for a proposed action.
 *
 * A corroboration refusal (`enforce`, #6309) is recorded where a policy
 * refusal is: its rule joins `policyViolations`, and `refusedAtStage` names
 * the stage so the record cannot be read as a trust-tier block. Under `off`
 * and `audit` the check is recorded, never refused; `corroborationWouldRefuse`
 * is `audit`'s telemetry and is `false` under `off` by construction.
 */
export function buildActionDetails(
  action: AgentAction,
  policy: { allowed: boolean; violations: readonly { rule: string; message: string }[] },
  corrob: FirewallCorroborationDecision
): Record<string, unknown> {
  const policyRules = policy.violations.map((violation) => violation.rule);
  return {
    ...(corrob.refused
      ? {
          policyViolations: [...policyRules, 'INSUFFICIENT_CORROBORATION'],
          missingCorroboration: corrob.missing,
          refusedAtStage: corrob.stage,
        }
      : {
          policyViolations: policyRules,
          missingCorroboration: corrob.missing,
          corroborationWouldRefuse: corrob.wouldRefuse,
        }),
    ...(action.type === 'ClassifyIssue' && { category: action.category }),
    ...(action.type === 'ProposeLabels' && { labels: action.labels }),
  };
}

/**
 * Validates every action through the firewall's policy gate and its
 * corroboration stage (originally Issue #828; #5383 moved the policy
 * evaluation inside the firewall and #6309 the corroboration check, so this
 * path has ONE composition).
 *
 * Each action is one firewall run with `action` and the repository label set,
 * then one `validateActionCorroboration` call. The policy decision is read
 * from `FirewallResult.policy` and enforced HERE as `policyApproved`, whatever
 * `NEXUS_FIREWALL_POLICY` is — the mode only decides whether the firewall
 * refuses on its own (`enforce`), and such a refusal lands on the record as
 * `policyApproved: false` with its rules, exactly where the direct
 * `evaluatePolicy` verdict used to land. A corroboration refusal lands the
 * same way (#6309 panel, option R): the action stays on the list, refused,
 * with `refusedAtStage: 'corroboration'` and what was missing — never
 * dropped. Under `off` and `audit` corroboration is recorded as
 * `corroborated`, as the direct `validateCorroboration` call recorded it.
 *
 * `gate.enforcedTier` is the classification run's (the reputation gate's under
 * the #3122 rollout mode); a per-action run that enforces a different tier
 * fails the whole call closed, because the citations were stamped with it. A
 * corroboration stage that did not run fails the call the same way.
 */
export function validateActionsThroughFirewall(
  input: FirewallActionInput,
  gate: Pick<FirewallProcessOptions, 'context' | 'reputation'> & {
    readonly enforcedTier: TrustTier;
  },
  actions: readonly AgentAction[],
  existingLabels: ReadonlySet<string> | undefined
): Result<ProposedAction[], Error> {
  // Spread in only when present, so the firewall sees absence as absence and
  // fails the label-validity check closed (`LABEL_SET_UNAVAILABLE`).
  const labels = existingLabels !== undefined ? { existingLabels } : {};
  const proposed: ProposedAction[] = [];
  for (const action of actions) {
    const decision = evaluateActionThroughFirewall(input, { ...gate, ...labels, action });
    if (!decision.ok) return decision;
    const corroboration = validateActionCorroboration(action);
    if (!corroboration.ok) return corroboration;
    proposed.push({
      type: action.type,
      description: describeAction(action),
      policyApproved: decision.value.allowed && !corroboration.value.refused,
      corroborated: corroboration.value.satisfied,
      details: buildActionDetails(action, decision.value, corroboration.value),
    });
  }
  return ok(proposed);
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
      lines.push(
        `- ${status} **${action.type}**: ${action.description}${formatRefusalReason(action)}`
      );
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

/** The refusal-bearing subset of `ProposedAction.details`, read with guards. */
interface ActionRefusalDetails {
  readonly policyViolations: readonly string[];
  readonly missingCorroboration: readonly string[];
  readonly refusedAtStage?: 'corroboration';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Reads WHY an action was refused (or left uncorroborated) off its `details`
 * (#6309 review): `details` is untyped on the record, so this is the one
 * place the keys `buildActionDetails` writes are read back. A key that is
 * absent or malformed reads as empty, never as a rule.
 */
export function readActionRefusal(action: ProposedAction): ActionRefusalDetails {
  const { policyViolations, missingCorroboration, refusedAtStage } = action.details;
  return {
    policyViolations: isStringArray(policyViolations) ? policyViolations : [],
    missingCorroboration: isStringArray(missingCorroboration) ? missingCorroboration : [],
    ...(refusedAtStage === 'corroboration' ? { refusedAtStage } : {}),
  };
}

/**
 * The parenthetical after a refused action's line, so a corroboration refusal
 * is distinguishable from a policy refusal where a reader sees it (#6309
 * review). Empty for an action that was not refused.
 */
function formatRefusalReason(action: ProposedAction): string {
  if (action.policyApproved) return '';
  const refusal = readActionRefusal(action);
  const policyRules = refusal.policyViolations.filter((r) => r !== 'INSUFFICIENT_CORROBORATION');
  const parts: string[] = [];
  if (policyRules.length > 0) parts.push(`policy: ${policyRules.join(', ')}`);
  if (refusal.refusedAtStage !== undefined) {
    parts.push(`refused at ${refusal.refusedAtStage}: ${refusal.missingCorroboration.join('; ')}`);
  }
  // A refusal that names nothing is still a refusal; say so rather than print nothing.
  return ` (${parts.length > 0 ? parts.join('; ') : 'refused: no rule recorded'})`;
}
