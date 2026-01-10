/**
 * nexus-agents/dogfooding - Module Exports
 *
 * Self-referential tooling for nexus-agents to develop itself.
 *
 * @module dogfooding
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 */

// Types
export type {
  PRFileChange,
  PRMetadata,
  ReviewSeverity,
  ReviewCategory,
  ReviewFinding,
  ExpertReviewResult,
  ReviewDecision,
  PRReviewResult,
  PRReviewConfig,
} from './pr-review-types.js';

export {
  DEFAULT_PR_REVIEW_CONFIG,
  PRReviewConfigSchema,
  SEVERITY_ORDER,
  CATEGORY_DISPLAY_NAMES,
  SEVERITY_EMOJI,
  DECISION_EMOJI,
} from './pr-review-types.js';

// GitHub Client
export {
  GitHubClient,
  GitHubError,
  parsePRUrl,
  createGitHubClientFromEnv,
} from './github-client.js';
export type { GitHubClientConfig } from './github-client.js';

// PR Reviewer
export { PRReviewer, createPRReviewer, formatReviewComment } from './pr-reviewer.js';
