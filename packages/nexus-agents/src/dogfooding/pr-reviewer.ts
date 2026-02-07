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
import { createSecurityExpert } from '../agents/experts/security-expert.js';
import { createCodeExpert } from '../agents/experts/code-expert.js';
import { createTestingExpert } from '../agents/experts/testing-expert.js';
import { SwarmObserver } from '../observability/swarm-observer.js';
import type {
  PRMetadata,
  PRReviewConfig,
  PRReviewResult,
  ExpertReviewResult,
  ReviewCategory,
} from './pr-review-types.js';
import { DEFAULT_PR_REVIEW_CONFIG, CATEGORY_DISPLAY_NAMES } from './pr-review-types.js';
import { GitHubClient, parsePRUrl, createGitHubClientFromEnv } from './github-client.js';
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

  constructor(config?: Partial<PRReviewConfig>, adapter?: IModelAdapter) {
    this.config = { ...DEFAULT_PR_REVIEW_CONFIG, ...config };
    this.observer = new SwarmObserver();
    this.adapter = adapter ?? undefined;
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

    const clientResult = this.getGitHubClient();
    if (!clientResult.ok) return clientResult;

    const prResult = await clientResult.value.getPullRequest(owner, repo, prNumber);
    if (!prResult.ok) return err(prResult.error);

    // Classify PR author trust tier (Issue #828 — defense-in-depth)
    const trustResult = this.classifyPRAuthor(prResult.value);
    logger.info('PR author trust classified', {
      prNumber,
      author: prResult.value.author,
      trustTier: trustResult.trustTier,
      userRole: trustResult.userRole,
      isAllowlisted: trustResult.isAllowlisted,
    });

    const expertReviews = await this.runExpertReviews(prResult.value, traceId);
    const result = this.aggregateReviews(prResult.value, expertReviews, startTime);

    if (!this.config.dryRun) {
      await this.postReviewToGitHub(clientResult.value, parseResult.value, result, trustResult);
    }

    logger.info('PR review completed', {
      prNumber,
      decision: result.decision,
      findingsCount: sumFindings(result.findingsBySeverity),
      durationMs: result.totalDurationMs,
    });

    return ok(result);
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
    startTime: number
  ): PRReviewResult {
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
      consensusScore,
      debateRounds: 1,
      timestamp: getTimeProvider().nowIso(),
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
    client: GitHubClient,
    pr: { owner: string; repo: string; prNumber: number },
    result: PRReviewResult,
    trustResult: ClassifyResult
  ): Promise<void> {
    const policyResult = this.auditReviewAction(trustResult);
    if (policyResult.hasRuleOfTwoViolation) {
      logger.warn('Rule of Two: review posting blocked', {
        prNumber: pr.prNumber,
        violations: policyResult.violations,
      });
      return;
    }
    if (policyResult.violations.length > 0) {
      logger.info('Policy gate warnings for review posting', {
        prNumber: pr.prNumber,
        violations: policyResult.violations,
      });
    }

    const { formatReviewComment } = await import('./pr-reviewer-helpers.js');
    const body = formatReviewComment(result);
    const postResult = await client.createReview(
      pr.owner,
      pr.repo,
      pr.prNumber,
      body,
      result.decision
    );
    if (!postResult.ok) {
      logger.error('Failed to post review', postResult.error);
    }
  }

  /** Audits review posting against the policy gate for logging. */
  private auditReviewAction(trustResult: ClassifyResult): {
    hasRuleOfTwoViolation: boolean;
    violations: readonly { rule: string; message: string }[];
  } {
    const context: ActionContext = {
      inputTrustTier: trustResult.trustTier,
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
   * Gets or creates GitHub client.
   */
  private getGitHubClient(): Result<GitHubClient, Error> {
    if (this.config.githubToken !== undefined) {
      return ok(new GitHubClient({ token: this.config.githubToken }));
    }
    return createGitHubClientFromEnv();
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
