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
import type { FullCapableProvider } from '../scm/types.js';
import { FINDING_SEVERITY_LEVELS } from '../security/sarif-types.js';

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
export type ReviewSeverity = (typeof FINDING_SEVERITY_LEVELS)[number];

/**
 * Review category for organizing findings.
 */
export type ReviewCategory =
  'security' | 'performance' | 'code_quality' | 'testing' | 'documentation' | 'architecture';

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
  /**
   * The expert never produced a verdict — its adapter failed or returned
   * nothing (#5012).
   *
   * `approved` cannot express this. A failed expert used to be recorded as
   * `approved: true` ("don't block on failures"), so a review in which every
   * expert failed resolved to `approve` at 100% consensus and was posted to
   * GitHub as a real APPROVE. Absence of a review is not approval — a consumer
   * must be able to tell them apart, and `confidence: 0` was already present
   * and already ignored.
   */
  readonly errored?: boolean;
}

/**
 * Aggregated review decision after multi-agent debate.
 */
export type ReviewDecision = 'approve' | 'request_changes' | 'comment';

/**
 * Complete PR review result from multi-agent collaboration.
 */
/**
 * Trust + reputation assessment of the PR author, surfaced for observability
 * (#3123, epic #3118 Phase 5). Mirrors `issue_triage`'s assessment.
 */
export interface PRTrustAssessment {
  /** Classifier trust tier (1-4) from author association. */
  readonly trustTier: string;
  /** Author's GitHub role. */
  readonly userRole: string;
  /** Whether the author is on the maintainer allowlist. */
  readonly isAllowlisted: boolean;
  /** Reputation score (0-100) when reputation is enabled. */
  readonly reputationScore?: number | undefined;
  /** Suspicious signals detected (e.g. `new_account`, `injection_patterns_detected`). */
  readonly suspiciousSignals: readonly string[];
  /** Whether the author is flagged as suspicious. */
  readonly isSuspicious: boolean;
  /** Tier the policy gate ACTUALLY enforced (== trustTier under audit/off). */
  readonly enforcedTrustTier?: string | undefined;
  /** Tier reputation reconciliation computed — what enforce mode WOULD gate on. */
  readonly reputationReconciledTier?: string | undefined;
  /** Reputation-gating rollout mode applied: `off` | `audit` | `enforce`. */
  readonly gatingMode?: string | undefined;
}

/**
 * Result of fetching PR data plus best-effort author signals (#3133).
 */
export interface PRFetchData {
  readonly metadata: PRMetadata;
  readonly provider: FullCapableProvider;
  /** Author's real account age in days, when the lookup succeeded (#3133). */
  readonly accountAgeDays?: number;
}

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
  /**
   * Number of changed files the review covered (#4350).
   *
   * The demo command's progress line printed `expertReviews.length` under a
   * "files" label, so a 7-file PR reported "3 files" — the expert count. The
   * fetch was always correct; the result simply carried no file count to print.
   */
  readonly filesReviewed: number;
  /** Consensus score (0-1) */
  readonly consensusScore: number;
  /** Debate rounds completed */
  readonly debateRounds: number;
  /** Timestamp of review */
  readonly timestamp: string;
  /** Author trust + reputation assessment (#3123). */
  readonly trustAssessment: PRTrustAssessment;
  /**
   * What actually happened when the review was posted to GitHub (#4354).
   *
   * The review previously reported success whether or not the post landed: a
   * `createReview` rejection was logged and discarded, and a Rule-of-Two block
   * returned early, both leaving the CLI to print "Review posted to GitHub."
   * over a review that does not exist. Callers must consult this rather than
   * inferring a successful post from a successful review.
   */
  readonly postOutcome: ReviewPostOutcome;
}

/**
 * A completed review before the posting step has run (#4354).
 *
 * Everything the reviewer aggregates is known before the post is attempted; the
 * outcome is stamped on afterwards. Keeping the two apart in the types is what
 * stops `postOutcome` from being defaulted to a hopeful value.
 */
export type PRReviewDraft = Omit<PRReviewResult, 'postOutcome'>;

/** Terminal state of the GitHub review-posting step (#4354). */
export type ReviewPostOutcome =
  /** The review was created on GitHub. */
  | { readonly status: 'posted' }
  /** Posting was deliberately not attempted (dry-run, or a policy gate blocked it). */
  | { readonly status: 'skipped'; readonly reason: string }
  /** Posting was attempted and GitHub rejected it. */
  | { readonly status: 'failed'; readonly error: string };

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
  /** Whether to assess author reputation and gate on it (#3123). */
  readonly enableReputation: boolean;
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
  enableReputation: true,
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
  minSeverity: z.enum(FINDING_SEVERITY_LEVELS).default('low'),
  enableInlineComments: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  enableReputation: z.boolean().default(true),
  githubToken: z.string().optional(),
  modelConfig: z
    .object({
      temperature: z.number().min(0).max(2).default(0.3),
      maxTokens: z.number().int().positive().default(8192),
    })
    .optional(),
});

/**
 * Severity order for comparison. INVERTED vs sarif-types' SEVERITY_ORDER by
 * design (higher = more severe here, for descending sort); only the KEY SET is
 * shared. Derived from the canonical {@link FINDING_SEVERITY_LEVELS} so the keys
 * can't drift (#3570): critical→5 … info→1.
 */
export const SEVERITY_ORDER: Record<ReviewSeverity, number> = Object.fromEntries(
  FINDING_SEVERITY_LEVELS.map((level, index) => [level, FINDING_SEVERITY_LEVELS.length - index])
) as Record<ReviewSeverity, number>;

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
