/**
 * nexus-agents/dogfooding - PR Reviewer Helpers
 *
 * Helper functions for PR review formatting and aggregation.
 *
 * @module dogfooding/pr-reviewer-helpers
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import { randomUUID } from 'node:crypto';
import type { Result } from '../core/index.js';
import { getTimeProvider, createLogger } from '../core/index.js';
import type { ScmUserMetadata } from '../scm/types.js';
import type {
  PRMetadata,
  PRReviewDraft,
  PRTrustAssessment,
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
import { sanitizeInput } from '../security/input-sanitizer.js';
import { allOf } from '../utils/verdict-aggregation.js';
import {
  assessReputation,
  gateWithReputation,
  resolveReputationGatingMode,
} from '../security/reputation-model.js';
import type {
  ReputationCache,
  ReputationGateDecision,
  ReputationAssessment,
  GitHubUserMetadata,
} from '../security/reputation-model.js';
import type { FirewallResult } from '../security/firewall/firewall-pipeline.js';

const repLogger = createLogger({ component: 'PRReviewer.reputation' });

// =============================================================================
// Reputation Gating Helpers (#3123, epic #3118 Phase 5)
// =============================================================================

/**
 * Best-effort account-age lookup for a PR author (#3133, Phase-3 equivalent for
 * the PR path). Returns the author's real account age in days via the provider's
 * `fetchUserMetadata`, or `undefined` on any failure (err Result, unparseable
 * `createdAt`, or an unexpected rejection) — never fabricated, never throws, so
 * the review is never blocked by this lookup.
 */
export async function fetchAccountAgeDays(
  provider: { fetchUserMetadata: (u: string) => Promise<Result<ScmUserMetadata, Error>> },
  username: string
): Promise<number | undefined> {
  try {
    const result = await provider.fetchUserMetadata(username);
    if (!result.ok) return undefined;
    const createdMs = Date.parse(result.value.createdAt);
    if (!Number.isFinite(createdMs)) return undefined;
    return Math.floor((getTimeProvider().now() - createdMs) / 86_400_000);
  } catch {
    return undefined;
  }
}

/**
 * Assesses the PR author's reputation from the signals available in the PR
 * event: author association + injection flags from the (sanitized) PR body, plus
 * the author's real account age when it was fetched (#3133). `accountAgeDays` is
 * OMITTED when the lookup failed — never fabricated, so the engine skips the
 * `new_account` signal. Returns undefined when reputation is disabled.
 */
export function assessPRReputation(
  pr: PRMetadata,
  cache: ReputationCache,
  enableReputation: boolean,
  accountAgeDays: number | undefined
): ReputationAssessment | undefined {
  if (!enableReputation) return undefined;
  // Only `injectionFlags` is consumed here, and injection detection is
  // role-independent — the userRole arg ('unknown') and the sanitizer's own
  // trustTier output are intentionally irrelevant to this call.
  const sanitizeResult = sanitizeInput(pr.body, 'unknown', pr.author);
  const metadata: GitHubUserMetadata = {
    username: pr.author,
    ...(accountAgeDays !== undefined ? { accountAgeDays } : {}),
    authorAssociation: pr.authorAssociation,
    injectionFlags: sanitizeResult.injectionFlags,
  };
  return assessReputation(metadata, cache);
}

/** Builds the observability assessment surfaced on the review result (#3123). */
export function buildPRTrustAssessment(
  firewall: Pick<FirewallResult, 'trust' | 'isAllowlisted'>,
  reputation: ReputationAssessment | undefined,
  gateDecision: ReputationGateDecision
): PRTrustAssessment {
  const trustResult = firewall.trust;
  // Tier-1 (owner/allowlisted) authors cannot be suspicious.
  const isTier1 = trustResult.trustTier === '1';
  return {
    trustTier: trustResult.trustTier,
    userRole: trustResult.userRole,
    // Measured or absent (#4992): never the classifier's default `false`.
    ...(firewall.isAllowlisted !== undefined ? { isAllowlisted: firewall.isAllowlisted } : {}),
    reputationScore: reputation?.reputationScore,
    suspiciousSignals: isTier1 ? [] : (reputation?.suspiciousSignals ?? []),
    isSuspicious: isTier1 ? false : (reputation?.isSuspicious ?? false),
    enforcedTrustTier: gateDecision.enforcedTier,
    reputationReconciledTier: gateDecision.reconciledTier,
    gatingMode: gateDecision.mode,
  };
}

/**
 * Assesses the PR author's reputation and applies the gating rollout mode
 * (#3123). Returns the gate decision (for the policy gate) and the assessment
 * surfaced on the result. A suppressed demotion (audit/off) is logged.
 */
export function gatePRAuthor(
  pr: PRMetadata,
  firewall: Pick<FirewallResult, 'trust' | 'isAllowlisted'>,
  accountAgeDays: number | undefined,
  cache: ReputationCache,
  enableReputation: boolean
): { gateDecision: ReputationGateDecision; trustAssessment: PRTrustAssessment } {
  const trustResult = firewall.trust;
  const reputation = assessPRReputation(pr, cache, enableReputation, accountAgeDays);
  const gateDecision = gateWithReputation(
    trustResult.trustTier,
    reputation,
    resolveReputationGatingMode()
  );
  if (gateDecision.demotionSuppressed) {
    repLogger.warn('Reputation demotion suppressed by gating mode (would block under enforce)', {
      prNumber: pr.number,
      author: pr.author,
      mode: gateDecision.mode,
      classifierTier: trustResult.trustTier,
      reconciledTier: gateDecision.reconciledTier,
    });
  }
  return {
    gateDecision,
    trustAssessment: buildPRTrustAssessment(firewall, reputation, gateDecision),
  };
}

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
  // #5012: an expert that errored produced no verdict, so it can neither
  // approve nor object. `allOf(reviews, …, false)` already refuses to call
  // ZERO reviews unanimous approval (#4581); feeding it synthetic approvals
  // for failed experts defeated that guard by making the list non-empty.
  const verdicts = reviews.filter((r) => r.errored !== true);
  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasHigh = findings.some((f) => f.severity === 'high');
  // Zero expert reviews is not unanimous approval (#4581): with `true` here the
  // `hasHigh && !allApproved` branch could never fire on an unreviewed PR, so a
  // HIGH finding silently downgraded from request_changes to comment.
  const allApproved = allOf(verdicts, (r) => r.approved, false);

  if (hasCritical) return 'request_changes';
  if (hasHigh && !allApproved) return 'request_changes';
  if (findings.length > 0) return 'comment';
  // Nothing read the diff, so there is nothing to approve. `comment` posts the
  // failure summaries without asserting the change is fine.
  if (verdicts.length === 0) return 'comment';
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
export function formatReviewComment(result: PRReviewDraft): string {
  const emoji = DECISION_EMOJI[result.decision];
  const decisionText = result.decision.replaceAll('_', ' ').toUpperCase();

  const findingsSection = formatFindingsSection(result);
  const statsSection = formatStatsSection(result);

  return `## ${emoji} Nexus Agents Review: ${decisionText}

${result.summary}

${findingsSection}

${statsSection}

---
*Reviewed by [nexus-agents](https://github.com/nexus-substrate/nexus-agents) in ${String(result.totalDurationMs)}ms*`;
}

function formatFindingsSection(result: PRReviewDraft): string {
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

function formatStatsSection(result: PRReviewDraft): string {
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
    // #5012: NOT `approved: true`. "Don't block on failures" made an expert
    // that never ran indistinguishable from one that read the diff and had no
    // objection, and `determineDecision` turned three of those into an APPROVE
    // posted to GitHub.
    approved: false,
    errored: true,
    summary: `Review failed: ${error}`,
    findings: [],
    durationMs,
    confidence: 0,
  };
}

/** The policy gate's verdict on posting a review, as the caller needs it. */
interface ReviewPostingVerdict {
  readonly allowed: boolean;
  readonly hasRuleOfTwoViolation: boolean;
  readonly violations: readonly { rule: string }[];
}

/**
 * Decide whether review posting is blocked, and how to describe it.
 *
 * Consumes the gate's own `allowed` rather than re-deriving a narrower
 * condition. The caller previously blocked on `hasRuleOfTwoViolation` alone
 * while `evaluatePolicy` had already computed `allowed`.
 *
 * For the action `auditReviewAction` builds, the two are currently EQUIVALENT:
 * tiers 1-2 yield no violations, tiers 3-4 yield INSUFFICIENT_TRUST +
 * UNTRUSTED_INFLUENCE + RULE_OF_TWO together. So this changes no behaviour
 * today. It makes the equivalence guaranteed rather than accidental — it holds
 * only because that context hardcodes `hasWriteAccess` and `hasSecretAccess`
 * to true, which is what makes `checkRuleOfTwo` fire at tier 3+. Make either
 * conditional and RULE_OF_TWO stops firing while the other two blocking rules
 * still do, and a review would post against `allowed: false`.
 *
 * Returns `undefined` when posting may proceed. Rule of Two keeps its own
 * label: it is the distinctive condition (untrusted input + write access +
 * secrets at once) and reads very differently from a trust-tier block.
 */
export function reviewPostingBlock(
  verdict: ReviewPostingVerdict
): { label: string; reason: string } | undefined {
  if (verdict.allowed) return undefined;
  const label = verdict.hasRuleOfTwoViolation ? 'Rule of Two' : 'Policy gate';
  return { label, reason: `${label}: ${verdict.violations.map((v) => v.rule).join(', ')}` };
}
