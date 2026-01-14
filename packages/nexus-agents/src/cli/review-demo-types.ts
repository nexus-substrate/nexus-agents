/**
 * nexus-agents/cli - Review Demo Types
 *
 * Type definitions for the PR review demo workflow.
 *
 * @module cli/review-demo-types
 * (Source: Issue #258 - PR Review Demo Workflow)
 */

/**
 * Setup status for the review command.
 */
export interface SetupStatus {
  readonly hasGitHubToken: boolean;
  readonly hasGhCli: boolean;
  readonly tokenScopes: readonly string[];
  readonly tokenValid: boolean;
  readonly username?: string;
}

/**
 * Progress step for the review workflow.
 */
export interface ProgressStep {
  readonly name: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
  readonly message?: string;
  readonly durationMs?: number;
}

/**
 * Review demo options.
 */
export interface ReviewDemoOptions {
  /** PR URL or reference */
  readonly prUrl: string;
  /** Run setup wizard */
  readonly setup: boolean;
  /** Run without posting to GitHub */
  readonly dryRun: boolean;
  /** Enable verbose output */
  readonly verbose: boolean;
  /** Skip pre-flight checks */
  readonly skipChecks: boolean;
}

/**
 * Pre-flight check result.
 */
export interface PreflightResult {
  readonly passed: boolean;
  readonly checks: readonly PreflightCheck[];
}

/**
 * Individual pre-flight check.
 */
export interface PreflightCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly suggestion?: string;
}
