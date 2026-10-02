/**
 * nexus-agents/mcp - PR Review Result Mapping (split out of pr-review-tool.ts, #4278).
 *
 * Pure per-voter → per-review mapping and summarization helpers for the pr_review
 * tool. Split into its own module (no behavior change) to keep pr-review-tool.ts
 * under the repo's `max-lines` lint budget after adding the #4278 `repoPath` input.
 *
 * @module mcp/tools/pr-review-result-mapping
 */

import { MAX_SUMMARY_RECORD_CHARS } from '../../audit/pr-review-record-store.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { isAbsentSeat } from '../../cli/voter-unverifiable.js';
import {
  BLOCKING_SEVERITY_FLOOR,
  findingsAgree,
  isBlockingSeverity,
  isFindingVerified,
  parseFindings,
  type Finding,
} from './pr-review-findings.js';
import {
  mapVoteDecisionToPrDecision,
  PR_REVIEW_ROLES,
  type PrReviewAggregate,
  type PrReviewVote,
} from './pr-review-tool.js';

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
  /** Seats that could not read the diff (#6094). Always present; NOT inside `abstainCount`. */
  unverifiableCount: number;
} {
  const judged = reviews.filter((r) => !isAbsentSeat(r));
  return {
    approveCount: judged.filter((r) => r.decision === 'approve').length,
    requestChangesCount: judged.filter((r) => r.decision === 'request_changes').length,
    abstainCount: judged.filter((r) => r.decision === 'abstain').length,
    errorCount: reviews.filter((r) => r.source === 'error').length,
    unverifiableCount: reviews.filter((r) => r.source === 'unverifiable').length,
  };
}

/**
 * Fence model-supplied locations as a Markdown code span. Backslashes do not
 * escape inside a code span, so a backtick is replaced (with `'`) rather than
 * escaped; control characters collapse to spaces.
 */
function formatFindingLocation(location: string, maxChars: number): string {
  const sanitized = location
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/`/g, "'")
    .slice(0, maxChars);
  return `\`${sanitized}\``;
}

/** Budget each location so the reason retains every fence and its explanation. */
function describeUnconfirmedFindings(
  reviewers: readonly { role: PrReviewVote['role']; finding: Finding }[]
): string {
  // No findings means there is no unconfirmed reason to describe.
  const first = reviewers[0];
  if (first === undefined) return '';
  const lone = reviewers.length === 1;
  const prefix = lone
    ? `unconfirmed: 1 reviewer (${first.role}) at `
    : `unconfirmed: ${String(reviewers.length)} reviewers (`;
  const suffix = lone
    ? '; needs second reviewer'
    : ') found non-overlapping issues; needs agreement';
  const locations = (maxChars: number): string =>
    reviewers
      .map(({ role, finding }) =>
        lone
          ? formatFindingLocation(finding.location, maxChars)
          : `${role} at ${formatFindingLocation(finding.location, maxChars)}`
      )
      .join(', ');
  const available = MAX_SUMMARY_RECORD_CHARS - prefix.length - suffix.length - locations(0).length;
  const locationLimit = Math.min(120, Math.floor(available / reviewers.length));
  return `${prefix}${locations(locationLimit)}${suffix}`;
}

/** Corroboration is between roles, never multiple findings from the same role. */
export function aggregateBlockingFindings(
  valid: readonly PrReviewVote[],
  repoPath?: string
): PrReviewAggregate | undefined {
  const blockers = valid
    .filter((r) => r.decision === 'request_changes')
    .flatMap((r) =>
      r.findings
        .filter((f) => f.verified && isBlockingSeverity(f.severity, r.role))
        .map((finding) => ({ role: r.role, finding }))
    );
  const first = blockers[0];
  // No verified findings at the floor: leave the decision to the remaining tiers.
  if (first === undefined) return undefined;
  for (const [index, left] of blockers.entries()) {
    for (const right of blockers.slice(index + 1)) {
      if (findingsAgree(left.finding, right.finding, left.role, right.role, repoPath)) {
        return { decision: 'request_changes', verified: true };
      }
    }
  }
  const reviewers = new Map<string, (typeof blockers)[number]>();
  for (const blocker of blockers) {
    if (!reviewers.has(blocker.role)) reviewers.set(blocker.role, blocker);
  }
  return {
    decision: 'request_changes',
    verified: false,
    reason: describeUnconfirmedFindings([...reviewers.values()]),
  };
}

/** Disclose sub-floor request_changes findings, retaining any panel or blocker reason. */
export function discloseSeverityFloor(
  aggregate: PrReviewAggregate,
  valid: readonly PrReviewVote[]
): PrReviewAggregate {
  const findings = valid
    .filter((r) => r.decision === 'request_changes')
    .flatMap((r) => r.findings.filter((f) => !isBlockingSeverity(f.severity, r.role)));
  const count = findings.length;
  // No sub-floor request_changes findings means no severity-based change to disclose.
  if (count === 0) return aggregate;
  const verifiedCount = findings.filter((f) => f.verified).length;
  const unverifiedCount = count - verifiedCount;
  const disclosure = `${String(count)} low/info ${count === 1 ? 'finding' : 'findings'} from request_changes voters below the blocking floor (${BLOCKING_SEVERITY_FLOOR}): ${String(verifiedCount)} verified, ${String(unverifiedCount)} unverified`;
  return {
    ...aggregate,
    reason: aggregate.reason === undefined ? disclosure : `${aggregate.reason}; ${disclosure}`,
  };
}

/** Verification describes panel completeness, independently of its decision. */
export function aggregatePanelVerdict(
  reviews: readonly PrReviewVote[],
  valid: readonly PrReviewVote[],
  decision: PrReviewAggregate['decision']
): PrReviewAggregate {
  const complete = valid.length === reviews.length;
  return discloseSeverityFloor(
    complete
      ? { decision, verified: true }
      : {
          decision,
          verified: false,
          reason: `incomplete panel: ${String(valid.length)} of ${String(reviews.length)} voters responded`,
        },
    valid
  );
}

/**
 * #4132: the absolute_quorum verified-approve gate. Reached only when every
 * non-error voter approved. Requires ZERO errors, a COMPLETE panel
 * (`valid.length === PR_REVIEW_ROLES.length`), and the contrarian (catfish)
 * present-and-approving. Any shortfall degrades to a recoverable
 * `{ decision: 'abstain', verified: false, reason }` — the no_quorum analogue.
 */
export function absoluteQuorumApprove(
  reviews: readonly PrReviewVote[],
  valid: readonly PrReviewVote[]
): PrReviewAggregate {
  // Absent seats: errored OR unverifiable (#6094) — both void the quorum.
  const errorCount = reviews.length - valid.length;
  const erroredRoles = reviews.filter(isAbsentSeat).map((r) => r.role);
  const catfish = valid.find((r) => r.role === 'catfish');
  const catfishApproved = catfish?.decision === 'approve';
  const panelComplete = valid.length === PR_REVIEW_ROLES.length;

  if (errorCount > 0 || !catfishApproved || !panelComplete) {
    const missing = catfishApproved ? [] : ['catfish'];
    const named = [...erroredRoles, ...missing];
    const list = named.length > 0 ? named.join(', ') : 'incomplete panel';
    return {
      decision: 'abstain',
      verified: false,
      reason: `no_quorum: re-run — voter(s) [${list}] errored/missing (absolute_quorum)`,
    };
  }
  return { decision: 'approve', verified: true };
}
