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
  PRReviewDraft,
  ReviewPostOutcome,
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

// Issue Triage Types (Issue #828)
export type {
  IssueMetadata,
  IssueComment,
  IssueCategory,
  IssueTriageConfig,
  IssueTriageResult,
  ProposedAction,
  TrustAssessment,
} from './issue-triage-types.js';

export {
  DEFAULT_ISSUE_TRIAGE_CONFIG,
  IssueTriageConfigSchema,
  CATEGORY_DISPLAY_NAMES as ISSUE_CATEGORY_DISPLAY_NAMES,
  CATEGORY_EMOJI,
} from './issue-triage-types.js';

// PR Reviewer
export { PRReviewer, createPRReviewer, formatReviewComment } from './pr-reviewer.js';
export { formatFileReviewCoverage } from './pr-review-stats.js';

// Issue Triage (Issue #828)
export { IssueTriage, createIssueTriage } from './issue-triage.js';
export {
  formatTriageComment,
  categorizeIssue,
  extractLabelsFromBody,
} from './issue-triage-helpers.js';
