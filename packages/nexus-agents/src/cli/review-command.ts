/**
 * nexus-agents/cli - Review Command
 *
 * CLI command handler for PR review dogfooding.
 *
 * @module cli/review-command
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import { createLogger, formatPercentage } from '../core/index.js';
import { createPRReviewer, formatReviewComment } from '../dogfooding/index.js';
import type { PRReviewResult, ReviewSeverity, ReviewPostOutcome } from '../dogfooding/index.js';
import { capitalize } from '../utils/text-utils.js';

const logger = createLogger({ component: 'ReviewCommand' });

/**
 * Options for the review command.
 */
export interface ReviewCommandOptions {
  /** PR URL or reference (owner/repo#number) */
  prUrl: string;
  /** Run without posting to GitHub */
  dryRun: boolean;
  /** Enable verbose output */
  verbose: boolean;
}

/**
 * Executes the review command.
 */
export async function reviewCommand(options: ReviewCommandOptions): Promise<number> {
  const { prUrl, dryRun, verbose } = options;

  if (verbose) {
    logger.info('Starting PR review', { prUrl, dryRun });
  }

  printHeader(prUrl, dryRun);

  const reviewer = createPRReviewer({ dryRun });
  const result = await reviewer.reviewPR(prUrl);

  if (!result.ok) {
    process.stderr.write(`Error: ${result.error.message}\n`);
    return 1;
  }

  printReviewResult(result.value, verbose, dryRun);
  // #4354: a review that ran but failed to post is not a success. The command
  // used to print "Review posted to GitHub." and exit 0 over an HTTP 422, so a
  // script gating on the exit code saw a review that never existed.
  return result.value.postOutcome.status === 'failed' ? 1 : 0;
}

function printHeader(prUrl: string, dryRun: boolean): void {
  process.stdout.write(`\nReviewing: ${prUrl}\n`);
  if (dryRun) {
    process.stdout.write('(dry-run mode - will not post to GitHub)\n');
  }
  process.stdout.write('\n');
}

function printReviewResult(review: PRReviewResult, verbose: boolean, dryRun: boolean): void {
  printSummary(review);
  printFindings(review);

  if (verbose) {
    printExpertDetails(review);
    if (dryRun) {
      printGitHubPreview(review);
    }
  }

  printPostOutcome(review.postOutcome);
}

/**
 * Report what actually happened to the review, rather than assuming a
 * non-dry-run means it landed (#4354).
 */
function printPostOutcome(outcome: ReviewPostOutcome): void {
  switch (outcome.status) {
    case 'posted':
      process.stdout.write('Review posted to GitHub.\n');
      return;
    case 'skipped':
      // dry-run already says so in the header; a policy block does not.
      if (outcome.reason !== 'dry-run') {
        process.stdout.write(`Review NOT posted to GitHub: ${outcome.reason}\n`);
      }
      return;
    case 'failed':
      process.stderr.write(`Review NOT posted to GitHub: ${outcome.error}\n`);
      return;
  }
}

function printSummary(review: PRReviewResult): void {
  process.stdout.write(`Decision: ${review.decision.replaceAll('_', ' ').toUpperCase()}\n`);
  process.stdout.write(`Experts: ${String(review.expertCount)}\n`);
  process.stdout.write(`Consensus: ${formatPercentage(review.consensusScore)}\n`);
  process.stdout.write(`Duration: ${String(review.totalDurationMs)}ms\n\n`);
}

function printFindings(review: PRReviewResult): void {
  const { findingsBySeverity } = review;
  const total = Object.values(findingsBySeverity).reduce((a, b) => a + b, 0);

  if (total === 0) {
    process.stdout.write('No issues found.\n\n');
    return;
  }

  process.stdout.write(`Findings: ${String(total)} total\n`);
  const severities: ReviewSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  for (const sev of severities) {
    if (findingsBySeverity[sev] > 0) {
      process.stdout.write(`  - ${capitalize(sev)}: ${String(findingsBySeverity[sev])}\n`);
    }
  }
  process.stdout.write('\n');
}

function printExpertDetails(review: PRReviewResult): void {
  for (const expertReview of review.expertReviews) {
    process.stdout.write(`--- ${expertReview.expertType} Expert ---\n`);
    process.stdout.write(`${expertReview.summary}\n`);
    for (const finding of expertReview.findings) {
      const loc =
        finding.file !== undefined
          ? `    File: ${finding.file}${finding.line !== undefined ? `:${String(finding.line)}` : ''}\n`
          : '';
      process.stdout.write(`  [${finding.severity.toUpperCase()}] ${finding.title}\n`);
      process.stdout.write(loc);
      process.stdout.write(`    ${finding.description}\n`);
    }
    process.stdout.write('\n');
  }
}

function printGitHubPreview(review: PRReviewResult): void {
  process.stdout.write('=== GitHub Comment Preview ===\n');
  process.stdout.write(formatReviewComment(review));
  process.stdout.write('\n');
}
