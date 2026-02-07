/**
 * nexus-agents/dogfooding - PR Review Types
 *
 * Type definitions for automated pull request review using
 * multi-agent collaboration.
 *
 * @module dogfooding/pr-review-types
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

import { z } from 'zod';

/**
 * Pull request file change information.
 */
export interface PRFileChange {
  /** File path */
  readonly filename: string;
  /** Change status */
  readonly status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied';
  /** Number of additions */
  readonly additions: number;
  /** Number of deletions */
  readonly deletions: number;
  /** File patch/diff content */
  readonly patch?: string | undefined;
  /** Previous filename if renamed */
  readonly previousFilename?: string | undefined;
}

/**
 * Pull request metadata from GitHub API.
 */
export interface PRMetadata {
  /** PR number */
  readonly number: number;
  /** PR title */
  readonly title: string;
  /** PR description/body */
  readonly body: string;
  /** Author username */
  readonly author: string;
  /** GitHub API author_association (e.g., 'OWNER', 'COLLABORATOR', 'NONE') */
  readonly authorAssociation: string;
  /** Base branch */
  readonly base: string;
  /** Head branch */
  readonly head: string;
  /** Repository owner */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** PR URL */
  readonly url: string;
  /** Whether PR is draft */
  readonly draft: boolean;
  /** PR labels */
  readonly labels: readonly string[];
  /** Changed files */
  readonly files: readonly PRFileChange[];
  /** Total additions */
  readonly additions: number;
  /** Total deletions */
  readonly deletions: number;
  /** Commit SHA of head */
  readonly headSha: string;
}

/**
 * Review severity levels.
 */
export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Review category for organizing findings.
 */
export type ReviewCategory =
  | 'security'
  | 'performance'
  | 'code_quality'
  | 'testing'
  | 'documentation'
  | 'architecture';

/**
 * Individual review finding from an expert.
 */
export interface ReviewFinding {
  /** Unique finding ID */
  readonly id: string;
  /** Category of finding */
  readonly category: ReviewCategory;
  /** Severity level */
  readonly severity: ReviewSeverity;
  /** Finding title */
  readonly title: string;
  /** Detailed description */
  readonly description: string;
  /** Affected file (if applicable) */
  readonly file?: string | undefined;
  /** Line number (if applicable) */
  readonly line?: number | undefined;
  /** Suggested fix */
  readonly suggestion?: string | undefined;
  /** Expert that found this issue */
  readonly expertId: string;
  /** Confidence score (0-1) */
  readonly confidence: number;
}

/**
 * Review result from a single expert agent.
 */
export interface ExpertReviewResult {
  /** Expert ID */
  readonly expertId: string;
  /** Expert role/type */
  readonly expertType: string;
  /** Overall approval */
  readonly approved: boolean;
  /** Review summary */
  readonly summary: string;
  /** Individual findings */
  readonly findings: readonly ReviewFinding[];
  /** Execution time in ms */
  readonly durationMs: number;
  /** Confidence in review (0-1) */
  readonly confidence: number;
}

/**
 * Aggregated review decision after multi-agent debate.
 */
export type ReviewDecision = 'approve' | 'request_changes' | 'comment';

/**
 * Complete PR review result from multi-agent collaboration.
 */
export interface PRReviewResult {
  /** Pull request number */
  readonly prNumber: number;
  /** Repository full name (owner/repo) */
  readonly repository: string;
  /** Overall decision */
  readonly decision: ReviewDecision;
  /** Executive summary */
  readonly summary: string;
  /** Individual expert reviews */
  readonly expertReviews: readonly ExpertReviewResult[];
  /** Aggregated findings by severity */
  readonly findingsBySeverity: Readonly<Record<ReviewSeverity, number>>;
  /** Aggregated findings by category */
  readonly findingsByCategory: Readonly<Record<ReviewCategory, number>>;
  /** Total execution time in ms */
  readonly totalDurationMs: number;
  /** Number of experts that participated */
  readonly expertCount: number;
  /** Consensus score (0-1) */
  readonly consensusScore: number;
  /** Debate rounds completed */
  readonly debateRounds: number;
  /** Timestamp of review */
  readonly timestamp: string;
}

/**
 * Configuration for PR review.
 */
export interface PRReviewConfig {
  /** Experts to include in review */
  readonly experts: readonly ReviewCategory[];
  /** Maximum debate rounds */
  readonly maxDebateRounds: number;
  /** Consensus threshold (0-1) */
  readonly consensusThreshold: number;
  /** Minimum severity to report */
  readonly minSeverity: ReviewSeverity;
  /** Whether to post inline comments */
  readonly enableInlineComments: boolean;
  /** Whether to run in dry-run mode (no GitHub posting) */
  readonly dryRun: boolean;
  /** GitHub token for API access */
  readonly githubToken?: string | undefined;
  /** Model adapter configuration */
  readonly modelConfig?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
  };
}

/**
 * Default PR review configuration.
 */
export const DEFAULT_PR_REVIEW_CONFIG: PRReviewConfig = {
  experts: ['security', 'code_quality', 'testing'],
  maxDebateRounds: 3,
  consensusThreshold: 0.7,
  minSeverity: 'low',
  enableInlineComments: true,
  dryRun: false,
  modelConfig: {
    temperature: 0.3,
    maxTokens: 8192,
  },
};

/**
 * Zod schema for PR review configuration.
 */
export const PRReviewConfigSchema = z.object({
  experts: z
    .array(
      z.enum([
        'security',
        'performance',
        'code_quality',
        'testing',
        'documentation',
        'architecture',
      ])
    )
    .default(['security', 'code_quality', 'testing']),
  maxDebateRounds: z.number().int().min(1).max(10).default(3),
  consensusThreshold: z.number().min(0).max(1).default(0.7),
  minSeverity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('low'),
  enableInlineComments: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  githubToken: z.string().optional(),
  modelConfig: z
    .object({
      temperature: z.number().min(0).max(2).default(0.3),
      maxTokens: z.number().int().positive().default(8192),
    })
    .optional(),
});

/**
 * Severity order for comparison.
 */
export const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Category display names.
 */
export const CATEGORY_DISPLAY_NAMES: Record<ReviewCategory, string> = {
  security: 'Security',
  performance: 'Performance',
  code_quality: 'Code Quality',
  testing: 'Testing',
  documentation: 'Documentation',
  architecture: 'Architecture',
};

/**
 * Severity emoji for GitHub comments.
 */
export const SEVERITY_EMOJI: Record<ReviewSeverity, string> = {
  critical: ':rotating_light:',
  high: ':warning:',
  medium: ':yellow_circle:',
  low: ':large_blue_circle:',
  info: ':information_source:',
};

/**
 * Decision emoji for GitHub comments.
 */
export const DECISION_EMOJI: Record<ReviewDecision, string> = {
  approve: ':white_check_mark:',
  request_changes: ':x:',
  comment: ':speech_balloon:',
};
