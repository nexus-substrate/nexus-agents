/**
 * nexus-agents/dogfooding - PR Reviewer
 *
 * Multi-agent PR review orchestrator using collaboration protocols.
 *
 * @module dogfooding/pr-reviewer
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import type { Result, Task, TaskResult, IModelAdapter } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
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
    const startTime = Date.now();
    const traceId = SwarmObserver.generateTraceId();

    logger.info('Starting PR review', { prUrl, traceId });

    const parseResult = parsePRUrl(prUrl);
    if (!parseResult.ok) return parseResult;

    const { owner, repo, prNumber } = parseResult.value;

    const clientResult = this.getGitHubClient();
    if (!clientResult.ok) return clientResult;

    const prResult = await clientResult.value.getPullRequest(owner, repo, prNumber);
    if (!prResult.ok) return err(prResult.error);

    const expertReviews = await this.runExpertReviews(prResult.value, traceId);
    const result = this.aggregateReviews(prResult.value, expertReviews, startTime);

    if (!this.config.dryRun) {
      await this.postReviewToGitHub(clientResult.value, owner, repo, prNumber, result);
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
    const startTime = Date.now();
    const expertId = `${category}-expert`;

    logger.debug('Running expert review', { expertId, category });

    const expert = this.createExpert(category);
    const task = this.createReviewTask(pr, category);

    const result = await expert.execute(task);
    const durationMs = Date.now() - startTime;

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
   * Builds the task description for an expert.
   */
  private buildTaskDescription(pr: PRMetadata, category: ReviewCategory): string {
    const filesSummary = pr.files
      .map((f) => `- ${f.filename} (+${String(f.additions)}/-${String(f.deletions)})`)
      .join('\n');

    return `Review this pull request for ${CATEGORY_DISPLAY_NAMES[category]} concerns:

## PR: ${pr.title}

**Author:** ${pr.author}
**Branch:** ${pr.head} → ${pr.base}
**Changes:** +${String(pr.additions)} / -${String(pr.deletions)} lines

### Description
${pr.body || 'No description provided.'}

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
      totalDurationMs: Date.now() - startTime,
      expertCount: reviews.length,
      consensusScore,
      debateRounds: 1,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Posts review to GitHub.
   */
  private async postReviewToGitHub(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    result: PRReviewResult
  ): Promise<void> {
    const { formatReviewComment } = await import('./pr-reviewer-helpers.js');
    const body = formatReviewComment(result);
    const postResult = await client.createReview(owner, repo, prNumber, body, result.decision);
    if (!postResult.ok) {
      logger.error('Failed to post review', postResult.error);
    }
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
