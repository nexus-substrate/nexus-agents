/**
 * nexus-agents/dogfooding - PR Reviewer
 *
 * Multi-agent PR review orchestrator using collaboration protocols.
 *
 * @module dogfooding/pr-reviewer
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import type { Result, Task, TaskResult, IModelAdapter } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import { sanitizeInput } from '../security/input-sanitizer.js';
import { classifyTrust } from '../security/trust-classifier.js';
import type { ClassifyResult } from '../security/trust-classifier.js';
import { evaluatePolicy } from '../security/policy-gate.js';
import type { ActionContext } from '../security/policy-gate.js';
import { ReputationCache } from '../security/reputation-model.js';
import type { ReputationGateDecision } from '../security/reputation-model.js';
import { createSecurityExpert } from '../agents/experts/security-expert.js';
import { createCodeExpert } from '../agents/experts/code-expert.js';
import { createTestingExpert } from '../agents/experts/testing-expert.js';
import { SwarmObserver } from '../observability/swarm-observer.js';
import type {
  PRMetadata,
  PRReviewConfig,
  PRReviewResult,
  PRReviewDraft,
  ReviewPostOutcome,
  PRTrustAssessment,
  PRFetchData,
  ExpertReviewResult,
  ReviewCategory,
} from './pr-review-types.js';
import { DEFAULT_PR_REVIEW_CONFIG, CATEGORY_DISPLAY_NAMES } from './pr-review-types.js';
import { parsePRUrl } from '../scm/url-parsers.js';
import { createFullGitHubProvider } from '../scm/github-provider-traits.js';
import type { FullCapableProvider } from '../scm/types.js';
import {
  parseFindings,
  extractSummary,
  determineApproval,
  determineDecision,
  calculateConsensus,
  countBySeverity,
  countByCategory,
  sumFindings,
  generateSummary,
  createFailedReview,
  gatePRAuthor,
  fetchAccountAgeDays,
} from './pr-reviewer-helpers.js';

// Re-export for convenience
export { formatReviewComment } from './pr-reviewer-helpers.js';

const logger = createLogger({ component: 'PRReviewer' });

/**
 * Multi-agent PR reviewer.
 */
export class PRReviewer {
  private readonly config: PRReviewConfig;
  private readonly observer: SwarmObserver;
  private readonly adapter: IModelAdapter | undefined;
  private readonly reputationCache: ReputationCache;

  constructor(config?: Partial<PRReviewConfig>, adapter?: IModelAdapter) {
    this.config = { ...DEFAULT_PR_REVIEW_CONFIG, ...config };
    this.observer = new SwarmObserver();
    this.adapter = adapter ?? undefined;
    this.reputationCache = new ReputationCache();
  }

  /**
   * Reviews a pull request using multi-agent collaboration.
   */
  async reviewPR(prUrl: string): Promise<Result<PRReviewResult, Error>> {
    const startTime = getTimeProvider().now();
    const traceId = SwarmObserver.generateTraceId();

    logger.info('Starting PR review', { prUrl, traceId });

    const parseResult = parsePRUrl(prUrl);
    if (!parseResult.ok) return parseResult;

    const { owner, repo, prNumber } = parseResult.value;

    const fetchResult = await this.fetchPRData(owner, repo, prNumber);
    if (!fetchResult.ok) return fetchResult;

    const { metadata: prMetadata, provider, accountAgeDays } = fetchResult.value;

    // Classify PR author trust tier (Issue #828 — defense-in-depth)
    const trustResult = this.classifyPRAuthor(prMetadata);
    logger.info('PR author trust classified', {
      prNumber,
      author: prMetadata.author,
      trustTier: trustResult.trustTier,
      userRole: trustResult.userRole,
      isAllowlisted: trustResult.isAllowlisted,
    });

    // #3123: assess reputation and apply the gating rollout mode (off/audit/
    // enforce), mirroring issue_triage — closes the PR-path equivalent of the
    // #828/#3106 dead-end (reputation was classified but never gated here).
    const { gateDecision, trustAssessment } = gatePRAuthor(
      prMetadata,
      trustResult,
      accountAgeDays,
      this.reputationCache,
      this.config.enableReputation
    );

    const expertReviews = await this.runExpertReviews(prMetadata, traceId);
    const result = this.aggregateReviews(prMetadata, expertReviews, startTime, trustAssessment);

    const postOutcome: ReviewPostOutcome = this.config.dryRun
      ? { status: 'skipped', reason: 'dry-run' }
      : await this.postReviewToGitHub(provider, parseResult.value, result, gateDecision);

    logger.info('PR review completed', {
      prNumber,
      decision: result.decision,
      findingsCount: sumFindings(result.findingsBySeverity),
      durationMs: result.totalDurationMs,
      postStatus: postOutcome.status,
    });

    return ok({ ...result, postOutcome });
  }

  /**
   * Runs all expert reviews in parallel.
   */
  private async runExpertReviews(pr: PRMetadata, traceId: string): Promise<ExpertReviewResult[]> {
    const reviewPromises = this.config.experts.map((category) =>
      this.runSingleExpertReview(pr, category, traceId)
    );

    const results = await Promise.allSettled(reviewPromises);

    return results
      .filter((r): r is PromiseFulfilledResult<ExpertReviewResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Runs a single expert review.
   */
  private async runSingleExpertReview(
    pr: PRMetadata,
    category: ReviewCategory,
    traceId: string
  ): Promise<ExpertReviewResult> {
    const startTime = getTimeProvider().now();
    const expertId = `${category}-expert`;

    logger.debug('Running expert review', { expertId, category });

    const expert = this.createExpert(category);
    const task = this.createReviewTask(pr, category);

    const result = await expert.execute(task);
    const durationMs = getTimeProvider().now() - startTime;

    this.observer.recordInteraction({
      from: 'pr-reviewer',
      to: expertId,
      interactionType: 'delegate',
      outcome: result.ok ? 'success' : 'failure',
      traceId,
      durationMs,
    });

    if (!result.ok) {
      return createFailedReview(expertId, category, durationMs, result.error.message);
    }

    return this.parseExpertResult(expertId, category, result.value, durationMs);
  }

  /**
   * Creates the appropriate expert for a category.
   */
  private createExpert(category: ReviewCategory): {
    execute: (task: Task) => Promise<Result<TaskResult, Error>>;
  } {
    const baseOptions = {
      ...(this.adapter !== undefined && { adapter: this.adapter }),
      ...(this.config.modelConfig !== undefined && {
        temperature: this.config.modelConfig.temperature,
        maxTokens: this.config.modelConfig.maxTokens,
      }),
    };

    switch (category) {
      case 'security':
        return createSecurityExpert(baseOptions);
      case 'testing':
        return createTestingExpert(baseOptions);
      case 'code_quality':
      case 'performance':
      case 'documentation':
      case 'architecture':
      default:
        return createCodeExpert(baseOptions);
    }
  }

  /**
   * Creates a review task for an expert.
   */
  private createReviewTask(pr: PRMetadata, category: ReviewCategory): Task {
    return {
      id: `review-${String(pr.number)}-${category}`,
      description: this.buildTaskDescription(pr, category),
      context: { files: pr.files.map((f) => f.filename) },
      constraints: { maxTokens: this.config.modelConfig?.maxTokens ?? 8192 },
    };
  }

  /**
   * Classifies the PR author's trust tier using GitHub author_association.
   * (Source: Issue #828 — Wire security modules into production pipeline)
   */
  private classifyPRAuthor(pr: PRMetadata): ClassifyResult {
    return classifyTrust({
      username: pr.author,
      authorAssociation: pr.authorAssociation,
    });
  }

  /**
   * Sanitizes untrusted PR content (body/title) before embedding in expert tasks.
   * Uses the security/input-sanitizer pipeline to strip injection vectors.
   * (Source: Issue #828 — Wire security modules into production pipeline)
   */
  private sanitizePRContent(text: string, author: string): string {
    if (text.length === 0) return text;
    const result = sanitizeInput(text, 'unknown', author);
    if (result.wasModified) {
      logger.warn('PR content sanitized before expert review', {
        author,
        strippedCount: result.strippedElements.length,
        injectionFlags: result.injectionFlags,
        trustTier: result.trustTier,
      });
    }
    return result.content;
  }

  /**
   * Builds the task description for an expert.
   */
  private buildTaskDescription(pr: PRMetadata, category: ReviewCategory): string {
    const filesSummary = pr.files
      .map((f) => `- ${f.filename} (+${String(f.additions)}/-${String(f.deletions)})`)
      .join('\n');

    // Sanitize untrusted PR content before embedding in expert task (Issue #828)
    const safeTitle = this.sanitizePRContent(pr.title, pr.author);
    const safeBody = this.sanitizePRContent(pr.body, pr.author);

    return `Review this pull request for ${CATEGORY_DISPLAY_NAMES[category]} concerns:

## PR: ${safeTitle}

**Author:** ${pr.author}
**Branch:** ${pr.head} → ${pr.base}
**Changes:** +${String(pr.additions)} / -${String(pr.deletions)} lines

### Description
${safeBody || 'No description provided.'}

### Changed Files
${filesSummary}

### File Diffs
${this.formatDiffs(pr)}

Provide a structured review with:
1. Overall approval (APPROVED/CHANGES_REQUESTED)
2. Summary of findings
3. Specific issues with severity (critical/high/medium/low/info)
4. Suggested improvements`;
  }

  /**
   * Formats file diffs for the review task.
   */
  private formatDiffs(pr: PRMetadata): string {
    const maxDiffLength = 2000;
    let totalLength = 0;
    const diffs: string[] = [];

    for (const file of pr.files) {
      if (file.patch === undefined) continue;
      const diff = `\`\`\`diff\n# ${file.filename}\n${file.patch}\n\`\`\``;
      if (totalLength + diff.length > maxDiffLength * pr.files.length) {
        diffs.push(`# ${file.filename}\n(diff truncated)`);
      } else {
        diffs.push(diff);
        totalLength += diff.length;
      }
    }

    return diffs.join('\n\n');
  }

  /**
   * Parses expert result into structured review.
   */
  private parseExpertResult(
    expertId: string,
    category: ReviewCategory,
    result: TaskResult,
    durationMs: number
  ): ExpertReviewResult {
    const output = result.output as Record<string, unknown> | undefined;

    if (output === undefined) {
      return createFailedReview(expertId, category, durationMs, 'No output');
    }

    const findings = parseFindings(output, expertId, this.config.minSeverity);
    const approved = determineApproval(findings);
    // Default confidence - ResultMetadata doesn't track per-result confidence
    const confidence = 0.7;

    return {
      expertId,
      expertType: category,
      approved,
      summary: extractSummary(output),
      findings,
      durationMs,
      confidence,
    };
  }

  /**
   * Aggregates individual expert reviews into final result.
   */
  private aggregateReviews(
    pr: PRMetadata,
    reviews: ExpertReviewResult[],
    startTime: number,
    trustAssessment: PRTrustAssessment
  ): PRReviewDraft {
    const allFindings = reviews.flatMap((r) => r.findings);
    const decision = determineDecision(reviews, allFindings);
    const consensusScore = calculateConsensus(reviews);

    return {
      prNumber: pr.number,
      repository: `${pr.owner}/${pr.repo}`,
      decision,
      summary: generateSummary(pr, reviews, decision),
      expertReviews: reviews,
      findingsBySeverity: countBySeverity(allFindings),
      findingsByCategory: countByCategory(allFindings),
      totalDurationMs: getTimeProvider().now() - startTime,
      expertCount: reviews.length,
      filesReviewed: pr.files.length,
      consensusScore,
      debateRounds: 1,
      timestamp: getTimeProvider().nowIso(),
      trustAssessment,
    };
  }

  /**
   * Posts review to GitHub after policy gate validation.
   * The policy gate audits the action but only blocks on Rule of Two
   * violations — the review itself is our internal analysis, not content
   * from the untrusted PR author.
   * (Source: Issue #828 — Wire policy gate into production pipeline)
   */
  private async postReviewToGitHub(
    provider: FullCapableProvider,
    pr: { owner: string; repo: string; prNumber: number },
    result: PRReviewDraft,
    gateDecision: ReputationGateDecision
  ): Promise<ReviewPostOutcome> {
    const policyResult = this.auditReviewAction(gateDecision.enforcedTier);
    if (policyResult.hasRuleOfTwoViolation) {
      logger.warn('Rule of Two: review posting blocked', {
        prNumber: pr.prNumber,
        violations: policyResult.violations,
      });
      return {
        status: 'skipped',
        reason: `Rule of Two: ${policyResult.violations.map((v) => v.rule).join(', ')}`,
      };
    }
    if (policyResult.violations.length > 0) {
      logger.info('Policy gate warnings for review posting', {
        prNumber: pr.prNumber,
        violations: policyResult.violations,
      });
    }

    const { formatReviewComment } = await import('./pr-reviewer-helpers.js');
    const body = formatReviewComment(result);
    const postResult = await provider.createReview(pr.prNumber, body, result.decision);
    if (!postResult.ok) {
      logger.error('Failed to post review', postResult.error);
      // #4354: this used to end here. The rejection was logged and dropped, the
      // review resolved ok, and the CLI printed "Review posted to GitHub." over
      // a review GitHub had refused to create (HTTP 422 when the reviewer is the
      // PR author, for instance).
      return { status: 'failed', error: postResult.error.message };
    }
    return { status: 'posted' };
  }

  /**
   * Audits review posting against the policy gate. Gates on the reputation-
   * reconciled `enforcedTier` (#3123) rather than the raw classifier tier.
   */
  private auditReviewAction(enforcedTier: ClassifyResult['trustTier']): {
    hasRuleOfTwoViolation: boolean;
    violations: readonly { rule: string; message: string }[];
  } {
    const context: ActionContext = {
      inputTrustTier: enforcedTier,
      hasWriteAccess: true,
      hasSecretAccess: true,
    };
    const decision = evaluatePolicy(
      {
        type: 'DraftReply',
        body: 'PR review comment',
        requiresApproval: true,
        sources: [
          {
            type: 'repoFile',
            path: 'packages/nexus-agents/src/dogfooding/pr-reviewer.ts',
          },
        ],
      },
      context
    );
    return {
      hasRuleOfTwoViolation: decision.violations.some((v) => v.rule === 'RULE_OF_TWO'),
      violations: decision.violations,
    };
  }

  /**
   * Fetches PR data from the SCM provider and maps to dogfooding types.
   */
  private async fetchPRData(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Result<PRFetchData, Error>> {
    const provider = createFullGitHubProvider(`${owner}/${repo}`);

    const detailResult = await provider.getPullRequestDetail(prNumber);
    if (!detailResult.ok) return err(detailResult.error);

    const detail = detailResult.value;
    // #3133: best-effort real account age for the new_account reputation signal.
    // Skip the lookup entirely when reputation is disabled — the value would be
    // discarded by assessPRReputation's early-return anyway.
    const accountAgeDays = this.config.enableReputation
      ? await fetchAccountAgeDays(provider, detail.author)
      : undefined;
    const metadata: PRMetadata = {
      number: detail.number,
      title: detail.title,
      body: detail.body,
      author: detail.author,
      authorAssociation: detail.authorAssociation,
      base: detail.base,
      head: detail.head,
      headSha: detail.headSha,
      owner,
      repo,
      url: detail.url,
      draft: detail.draft,
      labels: [...detail.labels],
      files: detail.files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(f.patch !== undefined ? { patch: f.patch } : {}),
        ...(f.previousFilename !== undefined ? { previousFilename: f.previousFilename } : {}),
      })),
      additions: detail.additions,
      deletions: detail.deletions,
    };

    return ok({
      metadata,
      provider,
      ...(accountAgeDays !== undefined ? { accountAgeDays } : {}),
    });
  }

  /**
   * Gets the SwarmObserver for debugging.
   */
  getObserver(): SwarmObserver {
    return this.observer;
  }
}

/**
 * Creates a PR reviewer instance.
 */
export function createPRReviewer(
  config?: Partial<PRReviewConfig>,
  adapter?: IModelAdapter
): PRReviewer {
  return new PRReviewer(config, adapter);
}
