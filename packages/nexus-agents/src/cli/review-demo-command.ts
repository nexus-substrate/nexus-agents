/**
 * nexus-agents/cli - Review Demo Command
 *
 * Enhanced PR review command with wizard and better UX.
 * Target: <5 minute time to value.
 *
 * @module cli/review-demo-command
 * (Source: Issue #258 - PR Review Demo Workflow)
 */

import { getTimeProvider, formatPercentage, getErrorMessage } from '../core/index.js';
import type { IModelAdapter } from '../core/index.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';
import { createPRReviewer, formatReviewComment } from '../dogfooding/index.js';
import type { PRReviewResult, ReviewSeverity, ReviewPostOutcome } from '../dogfooding/index.js';
import type { ReviewDemoOptions, ProgressStep } from './review-demo-types.js';
import {
  checkSetupStatus,
  runPreflightChecks,
  formatSetupStatus,
  formatPreflightResults,
  formatProgressStep,
  createProgressSteps,
  updateProgress,
  getSetupInstructions,
} from './review-demo-helpers.js';
import { capitalize } from '../utils/text-utils.js';

/**
 * Executes the review demo command with enhanced UX.
 */
export async function reviewDemoCommand(options: ReviewDemoOptions): Promise<number> {
  const { prUrl, setup, dryRun, verbose, skipChecks } = options;

  // Handle setup wizard
  if (setup) {
    return runSetupWizard();
  }

  // Validate we have a PR URL
  if (prUrl.length === 0) {
    printQuickStart();
    return 1;
  }

  // Run pre-flight checks unless skipped
  if (!skipChecks) {
    const preflight = await runPreflightChecks(prUrl);
    if (!preflight.passed) {
      process.stdout.write('\n');
      process.stdout.write(formatPreflightResults(preflight));
      process.stdout.write('\n');
      process.stdout.write('Run "nexus-agents review --setup" for configuration help.\n');
      return 1;
    }

    if (verbose) {
      process.stdout.write(formatPreflightResults(preflight));
      process.stdout.write('\n');
    }
  }

  // Run the review with progress tracking
  return runReviewWithProgress(prUrl, dryRun, verbose);
}

/**
 * Runs the setup wizard.
 */
async function runSetupWizard(): Promise<number> {
  process.stdout.write(getSetupInstructions());
  process.stdout.write('\n\n');

  const status = await checkSetupStatus();
  process.stdout.write(formatSetupStatus(status));
  process.stdout.write('\n');

  if (status.tokenValid) {
    process.stdout.write("\nYou're all set! Try:\n");
    process.stdout.write('  nexus-agents review <pr-url> --dry-run\n');
    return 0;
  }

  return 1;
}

/**
 * Prints quick start help.
 */
function printQuickStart(): void {
  process.stdout.write(`
nexus-agents review - AI-powered PR review

QUICK START:
  nexus-agents review https://github.com/owner/repo/pull/123
  nexus-agents review owner/repo#123 --dry-run

OPTIONS:
  --setup       Run setup wizard
  --dry-run     Review without posting to GitHub
  --verbose     Show detailed progress
  --skip-checks Skip pre-flight validation

EXAMPLES:
  # First time? Run the setup wizard:
  nexus-agents review --setup

  # Review a PR without posting:
  nexus-agents review https://github.com/facebook/react/pull/1 --dry-run

  # Review and post to GitHub:
  nexus-agents review owner/repo#123
`);
}

/**
 * Runs the review with progress tracking.
 */
async function runReviewWithProgress(
  prUrl: string,
  dryRun: boolean,
  verbose: boolean
): Promise<number> {
  let steps = createProgressSteps();
  const startTime = getTimeProvider().now();

  printHeader(prUrl, dryRun);

  // Step 0: Validate credentials (already done in preflight)
  steps = updateProgress(steps, 0, { status: 'completed', message: 'OK' });
  printProgress(steps, verbose);

  // Step 1: Fetching PR
  steps = updateProgress(steps, 1, { status: 'in_progress' });
  printProgress(steps, verbose);

  // #4350: the adapter is createPRReviewer's SECOND parameter and was never
  // passed here either, so every expert ran its heuristic branch while the
  // progress display reported a clean multi-agent review. Fail closed.
  const adapter = resolveAdapter();
  if (adapter === null) {
    steps = updateProgress(steps, 0, { status: 'failed', message: 'no model adapter' });
    printProgress(steps, verbose);
    return 1;
  }

  const reviewer = createPRReviewer({ dryRun }, adapter);
  const result = await reviewer.reviewPR(prUrl);

  if (!result.ok) {
    steps = updateProgress(steps, 1, { status: 'failed', message: result.error.message });
    printProgress(steps, verbose);
    process.stderr.write(`\nError: ${result.error.message}\n`);
    return 1;
  }

  // Update remaining steps based on result
  const durationMs = getTimeProvider().now() - startTime;
  steps = updateAllStepsCompleted(steps, result.value, durationMs);
  printProgress(steps, verbose);

  // Print result
  process.stdout.write('\n');
  printReviewResult(result.value, verbose, dryRun);
  // #4354: only claim success when the review actually landed.
  if (result.value.postOutcome.status === 'failed') {
    return 1;
  }
  printSuccessMessage(durationMs);

  return 0;
}

/**
 * Resolve the model adapter the experts will run on, or null after reporting why
 * the review cannot proceed (#4350). Mirrors `review-command.ts`.
 */
function resolveAdapter(): IModelAdapter | null {
  try {
    // No logger threaded: this command has none, and the registry's is optional.
    return getGlobalRegistry().getDefault();
  } catch (error) {
    // Our guidance plus the registry's message only — never the adapter
    // configuration, which can carry credentials.
    process.stderr.write(
      `\nError: no model adapter is available, so the review would fall back to generic heuristics rather than reading this PR.\n` +
        `  ${getErrorMessage(error)}\n` +
        `  Run "nexus-agents doctor" to see which CLIs are detected and authenticated.\n`
    );
    return null;
  }
}

/**
 * Prints the header.
 */
function printHeader(prUrl: string, dryRun: boolean): void {
  process.stdout.write('\n');
  process.stdout.write('=== nexus-agents PR Review ===\n');
  process.stdout.write('\n');
  process.stdout.write(`Target: ${prUrl}\n`);
  if (dryRun) {
    process.stdout.write('Mode:   dry-run (will not post to GitHub)\n');
  }
  process.stdout.write('\n');
}

/**
 * Prints progress steps.
 */
function printProgress(steps: ProgressStep[], verbose: boolean): void {
  if (!verbose) {
    // Compact progress bar
    const completed = steps.filter((s) => s.status === 'completed').length;
    const failed = steps.filter((s) => s.status === 'failed').length;
    const total = steps.length;

    const bar = buildProgressBar(completed, total);
    const status = failed > 0 ? 'FAILED' : completed === total ? 'DONE' : 'RUNNING';

    process.stdout.write(`\rProgress: ${bar} ${status}  `);
    return;
  }

  // Verbose: show all steps
  process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
  process.stdout.write('=== nexus-agents PR Review ===\n\n');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step !== undefined) {
      process.stdout.write(formatProgressStep(step, i, steps.length));
      process.stdout.write('\n');
    }
  }
}

/**
 * Builds a progress bar string.
 */
function buildProgressBar(completed: number, total: number): string {
  const width = 20;
  const filled = total > 0 ? Math.round((completed / total) * width) : 0;
  const empty = width - filled;
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${String(completed)}/${String(total)}`;
}

/**
 * Updates all steps to completed based on review result.
 */
function updateAllStepsCompleted(
  steps: ProgressStep[],
  review: PRReviewResult,
  totalDurationMs: number
): ProgressStep[] {
  const expertCount = review.expertCount;
  const avgDuration = Math.round(totalDurationMs / (expertCount + 2));

  return steps.map((step, index) => ({
    ...step,
    status: 'completed' as const,
    durationMs: index === steps.length - 1 ? totalDurationMs : avgDuration,
    message: getStepMessage(index, review),
  }));
}

/**
 * Gets a message for a completed step.
 */
function getStepMessage(index: number, review: PRReviewResult): string {
  const msgMap: Record<number, string> = {
    0: 'OK',
    // #4350: this printed `expertReviews.length` — the EXPERT count — under a
    // "files" label, so a 7-file PR reported "3 files".
    1: `${String(review.filesReviewed)} files`,
    2: getExpertMessage(review, 'security'),
    3: getExpertMessage(review, 'code_quality'),
    4: getExpertMessage(review, 'testing'),
    5: `${String(sumFindings(review.findingsBySeverity))} findings`,
    6: review.decision.replaceAll('_', ' '),
  };
  return msgMap[index] ?? 'OK';
}

/**
 * Gets message for an expert review.
 */
function getExpertMessage(review: PRReviewResult, type: string): string {
  const expert = review.expertReviews.find((e) => e.expertType === type);
  if (expert === undefined) return 'skipped';
  return expert.approved ? 'passed' : 'issues found';
}

/**
 * Sums findings by severity.
 */
function sumFindings(bySeverity: Record<ReviewSeverity, number>): number {
  return Object.values(bySeverity).reduce((a, b) => a + b, 0);
}

/**
 * Prints the review result.
 */
function printReviewResult(review: PRReviewResult, verbose: boolean, dryRun: boolean): void {
  process.stdout.write('\n');
  printSummary(review);
  printFindings(review);

  if (verbose) {
    printExpertDetails(review);
    if (dryRun) {
      printGitHubPreview(review);
    }
  }

  // #4354: same false-success as `review` — a non-dry-run was assumed to mean
  // the post landed, so an HTTP 422 printed "Review posted to GitHub."
  printPostOutcome(review.postOutcome);
}

/** Report what actually happened to the review (#4354). */
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

/**
 * Prints the summary.
 */
function printSummary(review: PRReviewResult): void {
  process.stdout.write(`Decision: ${review.decision.replaceAll('_', ' ').toUpperCase()}\n`);
  process.stdout.write(`Experts:  ${String(review.expertCount)}\n`);
  process.stdout.write(`Consensus: ${formatPercentage(review.consensusScore)}\n`);
  process.stdout.write(`Duration: ${String(review.totalDurationMs)}ms\n\n`);
}

/**
 * Prints findings.
 */
function printFindings(review: PRReviewResult): void {
  const { findingsBySeverity } = review;
  const total = sumFindings(findingsBySeverity);

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

/**
 * Prints expert details.
 */
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

/**
 * Prints GitHub comment preview.
 */
function printGitHubPreview(review: PRReviewResult): void {
  process.stdout.write('=== GitHub Comment Preview ===\n');
  process.stdout.write(formatReviewComment(review));
  process.stdout.write('\n');
}

/**
 * Prints success message with timing.
 */
function printSuccessMessage(durationMs: number): void {
  const seconds = (durationMs / 1000).toFixed(1);
  process.stdout.write('\n');
  process.stdout.write(`Review completed in ${seconds}s\n`);

  if (durationMs < 300000) {
    process.stdout.write('Target met: <5 minute time to value\n');
  }
}
