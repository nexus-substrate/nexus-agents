/**
 * Release Notes Types
 *
 * Type definitions for the release-notes CLI command.
 *
 * @module cli/release-notes-types
 * (Source: Issue #639 - Automated release notes generator)
 */

/**
 * Options for the release-notes command.
 */
export interface ReleaseNotesOptions {
  /** Starting reference (tag or commit). Defaults to last tag. */
  from?: string;
  /** Ending reference. Defaults to HEAD. */
  to?: string;
  /** Output format: changelog, json, or markdown. */
  format: 'changelog' | 'json' | 'markdown';
  /** Whether to run in dry-run mode (no consensus voting). */
  dryRun: boolean;
  /** Whether to show verbose output. */
  verbose: boolean;
}

/**
 * Categorized commit for release notes.
 */
export interface CategorizedCommit {
  /** Commit hash (short). */
  hash: string;
  /** Commit type (feat, fix, refactor, etc.). */
  type: string;
  /** Commit scope (optional). */
  scope?: string;
  /** Commit subject (message without type/scope). */
  subject: string;
  /** Full commit message. */
  message: string;
  /** Whether this is a breaking change. */
  breaking: boolean;
  /** Related issue numbers. */
  issues: string[];
}

/**
 * Release notes category with commits.
 */
export interface ReleaseNotesCategory {
  /** Category name (Added, Changed, Fixed, etc.). */
  name: string;
  /** Commits in this category. */
  commits: CategorizedCommit[];
}

/**
 * Consensus vote result for categorization.
 */
export interface CategorizationVote {
  /** Original category from conventional commit. */
  originalCategory: string;
  /** Consensus-determined category. */
  consensusCategory: string;
  /** Vote confidence (0-1). */
  confidence: number;
  /** Brief reasoning. */
  reasoning: string;
}

/**
 * Result of the release-notes command.
 */
export interface ReleaseNotesResult {
  /** Whether the command succeeded. */
  success: boolean;
  /** Generated release notes content. */
  content: string;
  /** Error message if failed. */
  error?: string;
  /** Version being released. */
  version: string;
  /** Starting reference. */
  fromRef: string;
  /** Ending reference. */
  toRef: string;
  /** Total commits analyzed. */
  commitCount: number;
  /** Categorized release notes. */
  categories: ReleaseNotesCategory[];
  /** Whether consensus voting was used. */
  usedConsensus: boolean;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * Commit type to Keep a Changelog category mapping.
 */
export const COMMIT_TYPE_TO_CATEGORY: Record<string, string> = {
  feat: 'Added',
  fix: 'Fixed',
  refactor: 'Changed',
  perf: 'Performance',
  docs: 'Documentation',
  test: 'Testing',
  chore: 'Maintenance',
  build: 'Build',
  ci: 'CI/CD',
  style: 'Style',
  revert: 'Reverted',
  security: 'Security',
};

/**
 * Keep a Changelog category display order.
 */
export const CATEGORY_ORDER = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Performance',
  'Documentation',
  'Testing',
  'Maintenance',
  'Build',
  'CI/CD',
  'Style',
  'Reverted',
];
