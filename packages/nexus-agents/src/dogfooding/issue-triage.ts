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
import { assessReputation, ReputationCache } from '../security/reputation-model.js';
import type { ReputationAssessment, GitHubUserMetadata } from '../security/reputation-model.js';
import type { AgentAction, SourceCitation } from '../security/action-schema.js';
import { GitHubClient, parseIssueUrl, createGitHubClientFromEnv } from './github-client.js';
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

    const clientResult = this.getGitHubClient();
    if (!clientResult.ok) return clientResult;

    const client = clientResult.value;

    const issueResult = await client.getIssue(owner, repo, issueNumber);
    if (!issueResult.ok) return err(issueResult.error);

    const commentsResult = await client.listIssueComments(owner, repo, issueNumber);
    const comments = commentsResult.ok ? commentsResult.value : [];

    // Sanitize untrusted content (Issue #828 — input-sanitizer wiring)
    const safeTitle = this.sanitizeContent(issueResult.value.title, issueResult.value.author);
    const safeBody = this.sanitizeContent(issueResult.value.body, issueResult.value.author);

    // Classify trust + assess reputation (Issue #828 — new wiring)
    const trustResult = this.classifyAuthor(issueResult.value);
    const reputation = this.assessAuthorReputation(issueResult.value, comments);

    // Generate and validate actions
    const actions = this.generateActions(safeTitle, safeBody, issueResult.value, trustResult);
    const validatedActions = this.validateActions(actions, trustResult);

    const result = this.buildResult({
      issue: issueResult.value,
      actions: validatedActions,
      trustResult,
      reputation,
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
    comments: readonly IssueComment[]
  ): ReputationAssessment | undefined {
    if (!this.config.enableReputation) return undefined;

    const sanitizeResult = sanitizeInput(issue.body, 'unknown', issue.author);

    const metadata: GitHubUserMetadata = {
      username: issue.author,
      accountAgeDays: estimateAccountAge(issue.createdAt),
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
    trustResult: ClassifyResult
  ): ProposedAction[] {
    const context: ActionContext = {
      inputTrustTier: trustResult.trustTier,
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
    safeContent: { title: string; body: string };
    startTime: number;
  }): IssueTriageResult {
    const { issue, actions, trustResult, reputation, safeContent, startTime } = opts;
    const [category, confidence] = categorizeIssue(safeContent.title, safeContent.body);

    const trustAssessment: TrustAssessment = {
      trustTier: trustResult.trustTier,
      userRole: trustResult.userRole,
      isAllowlisted: trustResult.isAllowlisted,
      reputationScore: reputation?.reputationScore,
      suspiciousSignals: reputation?.suspiciousSignals ?? [],
      isSuspicious: reputation?.isSuspicious ?? false,
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
   * Gets or creates a GitHub client.
   */
  private getGitHubClient(): Result<GitHubClient, Error> {
    if (this.config.githubToken !== undefined) {
      return ok(new GitHubClient({ token: this.config.githubToken }));
    }
    return createGitHubClientFromEnv();
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

/** Estimates account age from the issue creation date. */
function estimateAccountAge(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

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
