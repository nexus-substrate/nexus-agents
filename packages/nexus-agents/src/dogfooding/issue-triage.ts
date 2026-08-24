/**
 * nexus-agents/dogfooding - Issue Triage Processor
 *
 * Deterministic GitHub issue triage using the full security pipeline:
 * - Input sanitization (input-sanitizer.ts)
 * - Trust classification (trust-classifier.ts)
 * - Reputation assessment (reputation-model.ts) [NEW — #828]
 * - Typed agent actions (action-schema.ts)
 * - Policy gate validation (policy-gate.ts)
 * - Corroboration validation (corroboration-validator.ts) [NEW — #828]
 *
 * Read-only by default (dryRun: true). Proposes actions but never
 * auto-posts to GitHub without explicit opt-in.
 *
 * @module dogfooding/issue-triage
 * (Source: Issue #828 — Wire remaining security modules)
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import { sanitizeInput } from '../security/input-sanitizer.js';
import { classifyTrust } from '../security/trust-classifier.js';
import type { ClassifyResult } from '../security/trust-classifier.js';
import { evaluatePolicy } from '../security/policy-gate.js';
import type { ActionContext } from '../security/policy-gate.js';
import { validateCorroboration } from '../security/corroboration-validator.js';
import type { CorroborationResult } from '../security/corroboration-validator.js';
import {
  assessReputation,
  ReputationCache,
  gateWithReputation,
  resolveReputationGatingMode,
} from '../security/reputation-model.js';
import type {
  ReputationAssessment,
  GitHubUserMetadata,
  ReputationGateDecision,
} from '../security/reputation-model.js';
import type { AgentAction, SourceCitation } from '../security/action-schema.js';
import { parseIssueUrl } from '../scm/url-parsers.js';
import { createFullGitHubProvider } from '../scm/github-provider-traits.js';
import type { ScmUserMetadata } from '../scm/types.js';
import { categorizeIssue, extractLabelsFromBody } from './issue-triage-helpers.js';
import type {
  IssueMetadata,
  IssueComment,
  IssueTriageConfig,
  IssueTriageResult,
  ProposedAction,
  TrustAssessment,
} from './issue-triage-types.js';
import { DEFAULT_ISSUE_TRIAGE_CONFIG } from './issue-triage-types.js';

// Re-export for convenience
export { formatTriageComment } from './issue-triage-helpers.js';

const logger = createLogger({ component: 'IssueTriage' });

/**
 * Appends an explicit `RefuseAction` when the enforced tier is hostile (#4667).
 *
 * The generated actions are kept rather than replaced: they are the audit trail
 * of what was declined, and every one of them is already blocked by the policy
 * gate at tier 4. What was missing is a positive statement that the input was
 * refused and where to escalate it.
 */
function appendRefusalIfHostile(
  actions: readonly AgentAction[],
  gateDecision: ReputationGateDecision,
  issue: IssueMetadata
): AgentAction[] {
  if (gateDecision.enforcedTier !== '4') return [...actions];
  return [
    ...actions,
    {
      type: 'RefuseAction',
      reason:
        `Issue #${String(issue.number)} was classified at hostile trust tier 4 ` +
        `(${gateDecision.mode} mode). Automated triage actions are withheld pending human review.`,
      escalateTo: 'security',
    },
  ];
}

/**
 * GitHub issue triage processor.
 *
 * Wires all 8 security modules into a read-only triage pipeline:
 * 1. Fetch issue + comments from GitHub API
 * 2. Sanitize untrusted content (input-sanitizer)
 * 3. Classify author trust (trust-classifier)
 * 4. Assess author reputation (reputation-model) [#828]
 * 5. Generate typed actions (action-schema)
 * 6. Validate through policy gate (policy-gate)
 * 7. Validate corroboration (corroboration-validator) [#828]
 * 8. Return proposed actions
 */
export class IssueTriage {
  private readonly config: IssueTriageConfig;
  private readonly reputationCache: ReputationCache;

  constructor(config?: Partial<IssueTriageConfig>) {
    this.config = { ...DEFAULT_ISSUE_TRIAGE_CONFIG, ...config };
    this.reputationCache = new ReputationCache();
  }

  /**
   * Triages a GitHub issue through the full security pipeline.
   */
  async triageIssue(issueUrl: string): Promise<Result<IssueTriageResult, Error>> {
    const startTime = getTimeProvider().now();

    logger.info('Starting issue triage', { issueUrl });

    const parseResult = parseIssueUrl(issueUrl);
    if (!parseResult.ok) return parseResult;

    const { owner, repo, issueNumber } = parseResult.value;

    const fetchResult = await this.fetchIssueData(owner, repo, issueNumber);
    if (!fetchResult.ok) return fetchResult;

    const { issue: issueResult, comments, accountAgeDays } = fetchResult.value;

    // Sanitize untrusted content (Issue #828 — input-sanitizer wiring)
    const safeTitle = this.sanitizeContent(issueResult.title, issueResult.author);
    const safeBody = this.sanitizeContent(issueResult.body, issueResult.author);

    // Classify trust + assess reputation (Issue #828 — new wiring)
    const trustResult = this.classifyAuthor(issueResult);
    const reputation = this.assessAuthorReputation(issueResult, comments, accountAgeDays);

    // #3122: apply the reputation-gating rollout mode (off/audit/enforce). The
    // decision is computed once and used both to gate actions and to surface
    // observability in the result. Audit mode reports a would-be demotion
    // without enforcing it; the allowlist (Tier 1) remains the escape hatch.
    const gateDecision = gateWithReputation(
      trustResult.trustTier,
      reputation,
      resolveReputationGatingMode()
    );
    if (gateDecision.demotionSuppressed) {
      logger.warn('Reputation demotion suppressed by gating mode (would block under enforce)', {
        issueNumber,
        author: issueResult.author,
        mode: gateDecision.mode,
        classifierTier: trustResult.trustTier,
        reconciledTier: gateDecision.reconciledTier,
      });
    }

    // Generate and validate actions
    const actions = this.generateActions(safeTitle, safeBody, issueResult, trustResult);
    // #4667: a hostile enforced tier must produce an explicit refusal. Before
    // this, tier 4 merely meant every generated action failed the policy gate —
    // the caller saw fewer approved actions and no statement that anything was
    // refused, so the fail-closed escalation the rules mandate had no producer.
    // RefuseAction is tier-4 "always allowed" (trust-classifier.ts:170), so it
    // survives the gate that blocks the rest.
    const withRefusal = appendRefusalIfHostile(actions, gateDecision, issueResult);
    const validatedActions = this.validateActions(withRefusal, gateDecision);

    const result = this.buildResult({
      issue: issueResult,
      actions: validatedActions,
      trustResult,
      reputation,
      gateDecision,
      safeContent: { title: safeTitle, body: safeBody },
      startTime,
    });

    logger.info('Issue triage completed', {
      issueNumber,
      category: result.category,
      actionCount: result.proposedActions.length,
      durationMs: result.totalDurationMs,
    });

    return ok(result);
  }

  /**
   * Sanitizes untrusted issue content before processing.
   * (Source: Issue #828 — input-sanitizer wiring)
   */
  private sanitizeContent(text: string, author: string): string {
    if (text.length === 0) return text;
    const result = sanitizeInput(text, 'unknown', author);
    if (result.wasModified) {
      logger.warn('Issue content sanitized', {
        author,
        strippedCount: result.strippedElements.length,
        injectionFlags: result.injectionFlags,
      });
    }
    return result.content;
  }

  /**
   * Classifies the issue author's trust tier.
   * (Source: Issue #828 — trust-classifier wiring)
   */
  private classifyAuthor(issue: IssueMetadata): ClassifyResult {
    return classifyTrust({
      username: issue.author,
      authorAssociation: issue.authorAssociation,
    });
  }

  /**
   * Assesses the issue author's reputation using the reputation model.
   * This is one of the two NEW security module wirings completing #828.
   * (Source: Issue #828 — reputation-model wiring)
   */
  private assessAuthorReputation(
    issue: IssueMetadata,
    comments: readonly IssueComment[],
    accountAgeDays: number | undefined
  ): ReputationAssessment | undefined {
    if (!this.config.enableReputation) return undefined;

    const sanitizeResult = sanitizeInput(issue.body, 'unknown', issue.author);

    // #3121: accountAgeDays is the author's REAL account age (fetched in
    // fetchIssueData) or undefined when the lookup failed. When undefined it is
    // OMITTED so the engine skips the new_account signal (#3106) — never
    // fabricated. priorContributions/recentCommentCount use real comment data.
    const metadata: GitHubUserMetadata = {
      username: issue.author,
      ...(accountAgeDays !== undefined ? { accountAgeDays } : {}),
      priorContributions: countAuthorComments(issue.author, comments),
      recentCommentCount: countRecentComments(issue.author, comments),
      recentCommentWindowMinutes: 10,
      authorAssociation: issue.authorAssociation,
      injectionFlags: sanitizeResult.injectionFlags,
    };

    return assessReputation(metadata, this.reputationCache);
  }

  /**
   * Generates typed agent actions based on issue analysis.
   */
  private generateActions(
    safeTitle: string,
    safeBody: string,
    issue: IssueMetadata,
    trustResult: ClassifyResult
  ): AgentAction[] {
    const actions: AgentAction[] = [];
    const source = this.createRepoSource(issue);

    // Always generate ClassifyIssue action
    const [category, confidence] = categorizeIssue(safeTitle, safeBody);
    actions.push({
      type: 'ClassifyIssue',
      category,
      confidence,
      sources: [source],
    });

    // Generate ProposeLabels if we found label hints
    const labels = extractLabelsFromBody(safeTitle, safeBody);
    if (labels.length > 0) {
      actions.push({
        type: 'ProposeLabels',
        labels,
        reason: `Keyword-based label extraction from issue #${String(issue.number)}`,
        sources: [source],
      });
    }

    // Generate SummarizeIssue for semi-trusted+ authors
    if (trustResult.trustTier === '1' || trustResult.trustTier === '2') {
      const summary = `Issue #${String(issue.number)} "${safeTitle}" by ${issue.author} (${trustResult.userRole})`;
      actions.push({
        type: 'SummarizeIssue',
        summary: summary.length >= 10 ? summary : `${summary} — awaiting further analysis`,
        sources: [source],
      });
    }

    return actions;
  }

  /**
   * Validates all actions through policy gate and corroboration validator.
   * This completes the #828 wiring by integrating corroboration-validator.
   * (Source: Issue #828 — policy-gate + corroboration-validator wiring)
   */
  private validateActions(
    actions: readonly AgentAction[],
    gateDecision: ReputationGateDecision
  ): ProposedAction[] {
    // #3119 + #3122: reputation GATES via the rollout mode. `enforce` uses the
    // reconciled (possibly demoted) tier; `audit`/`off` enforce the classifier
    // tier (the suppressed demotion is logged upstream). Demotion-only;
    // Tier-1/allowlist always wins.
    const context: ActionContext = {
      inputTrustTier: gateDecision.enforcedTier,
      hasWriteAccess: !this.config.dryRun,
      hasSecretAccess: false,
    };

    return actions.map((action) => {
      const policyDecision = evaluatePolicy(action, context);
      const corrobResult = this.validateActionCorroboration(action);

      return {
        type: action.type,
        description: describeAction(action),
        policyApproved: policyDecision.allowed,
        corroborated: corrobResult.satisfied,
        details: buildActionDetails(action, policyDecision, corrobResult),
      };
    });
  }

  /**
   * Validates corroboration for a single action.
   * This is the second NEW security module wiring completing #828.
   * (Source: Issue #828 — corroboration-validator wiring)
   */
  private validateActionCorroboration(action: AgentAction): CorroborationResult {
    return validateCorroboration(action);
  }

  /**
   * Builds the final triage result.
   */
  private buildResult(opts: {
    issue: IssueMetadata;
    actions: readonly ProposedAction[];
    trustResult: ClassifyResult;
    reputation: ReputationAssessment | undefined;
    gateDecision: ReputationGateDecision;
    safeContent: { title: string; body: string };
    startTime: number;
  }): IssueTriageResult {
    const { issue, actions, trustResult, reputation, gateDecision, safeContent, startTime } = opts;
    const [category, confidence] = categorizeIssue(safeContent.title, safeContent.body);

    // Tier 1 actors (owner/maintainer) cannot be suspicious — reconcile
    // the trust-classifier result with the reputation-model result.
    const isTier1 = trustResult.trustTier === '1';

    const trustAssessment: TrustAssessment = {
      trustTier: trustResult.trustTier,
      userRole: trustResult.userRole,
      isAllowlisted: trustResult.isAllowlisted,
      reputationScore: reputation?.reputationScore,
      suspiciousSignals: isTier1 ? [] : (reputation?.suspiciousSignals ?? []),
      isSuspicious: isTier1 ? false : (reputation?.isSuspicious ?? false),
      // #3122: surface both the enforced tier (what the gate used) and the
      // reconciled tier (what reputation computed) so telemetry can't mistake
      // a would-be demotion for an enforced one.
      enforcedTrustTier: gateDecision.enforcedTier,
      reputationReconciledTier: gateDecision.reconciledTier,
      gatingMode: gateDecision.mode,
    };

    return {
      issueNumber: issue.number,
      repository: `${issue.owner}/${issue.repo}`,
      proposedActions: actions,
      trustAssessment,
      category,
      categoryConfidence: confidence,
      totalDurationMs: getTimeProvider().now() - startTime,
      timestamp: getTimeProvider().nowIso(),
    };
  }

  /**
   * Creates a repo file source citation for the triage.
   */
  private createRepoSource(issue: IssueMetadata): SourceCitation {
    return {
      type: 'repoFile',
      path: `issues/${String(issue.number)}`,
    };
  }

  /**
   * Fetches issue data from the SCM provider and maps to dogfooding types.
   */
  private async fetchIssueData(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<
    Result<{ issue: IssueMetadata; comments: IssueComment[]; accountAgeDays?: number }, Error>
  > {
    const provider = createFullGitHubProvider(`${owner}/${repo}`);

    const detailResult = await provider.getIssueDetail(issueNumber);
    if (!detailResult.ok) return err(detailResult.error);

    const detail = detailResult.value;
    const issue: IssueMetadata = {
      number: detail.number,
      title: detail.title,
      body: detail.body,
      author: detail.author,
      authorAssociation: detail.authorAssociation,
      owner,
      repo,
      url: detail.url,
      state: detail.state,
      labels: [...detail.labels],
      createdAt: detail.createdAt,
    };

    const commentsResult = await provider.listCommentDetails(issueNumber);
    const comments: IssueComment[] = commentsResult.ok
      ? commentsResult.value.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author,
          authorAssociation: c.authorAssociation,
          createdAt: c.createdAt,
        }))
      : [];

    // #3121: fetch the author's REAL account age (their account creation date,
    // not the issue date). Best-effort — on failure or an unparseable date we
    // omit it, so the reputation engine SKIPS the new_account signal (#3106)
    // rather than fabricating a value. Reputation must not block on this.
    const accountAgeDays = await this.fetchAccountAgeDays(provider, detail.author);

    return ok(
      accountAgeDays !== undefined ? { issue, comments, accountAgeDays } : { issue, comments }
    );
  }

  /**
   * Best-effort lookup of a GitHub user's account age in days. Returns
   * `undefined` if the user-metadata fetch fails or the creation date can't be
   * parsed (#3121) — callers must treat absence as "unknown", not "benign".
   */
  private async fetchAccountAgeDays(
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
      // Truly best-effort: even an unexpected rejection (token resolution,
      // transport) must not break triage — fall back to "unknown" age.
      return undefined;
    }
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

/** Counts how many comments the author has made on the issue. */
function countAuthorComments(author: string, comments: readonly IssueComment[]): number {
  return comments.filter((c) => c.author === author).length;
}

/** Counts recent comments from the author (within 10 minutes). */
function countRecentComments(author: string, comments: readonly IssueComment[]): number {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  return comments.filter(
    (c) => c.author === author && new Date(c.createdAt).getTime() > tenMinutesAgo
  ).length;
}

/** Creates a human-readable description for a typed action. */
function describeAction(action: AgentAction): string {
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
function buildActionDetails(
  action: AgentAction,
  policy: { allowed: boolean; violations: readonly { rule: string; message: string }[] },
  corrob: CorroborationResult
): Record<string, unknown> {
  return {
    policyViolations: policy.violations.map((v) => v.rule),
    missingCorroboration: corrob.missing,
    ...(action.type === 'ClassifyIssue' && { category: action.category }),
    ...(action.type === 'ProposeLabels' && { labels: action.labels }),
  };
}

/**
 * Creates an IssueTriage instance.
 */
export function createIssueTriage(config?: Partial<IssueTriageConfig>): IssueTriage {
  return new IssueTriage(config);
}
