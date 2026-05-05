/**
 * SCM (Source Control Management) exports — Centralized SCM provider module.
 * Replaces dual-path GitHub clients with unified IScmProvider interface.
 *
 * @module exports/scm
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */
export {
  // Core types
  type ScmPlatform,
  type TokenStrategy,
  type ScmToken,
  type TokenResolverConfig,
  type ScmIssue,
  type ScmPullRequest,
  type ScmComment,
  type CreatePROptions,
  type MergePROptions,
  type PRStatus as ScmPRStatus, // Renamed for disambiguation across the SCM surface
  type IssueFilters,
  type IScmProvider,
  // Extended entity types (trait support)
  type ScmFileChange,
  type ScmPullRequestDetail,
  type ScmIssueDetail,
  type ScmCommentDetail,
  type ScmReviewDecision,
  type ScmUserMetadata,
  // Trait interfaces (ISP)
  type IScmReviewer,
  type IScmUserInfo,
  // Convenience composite types
  type ReviewCapableProvider,
  type FullCapableProvider,
  // Error class
  ScmError,
} from '../scm/types.js';

// Token resolution
export { resolveToken, hasToken, getTokenEnvVars } from '../scm/token-resolver.js';

// Provider implementations
export { GitHubProvider } from '../scm/github-provider.js';

// Trait implementations
export {
  GitHubReviewer,
  GitHubUserInfo,
  createFullGitHubProvider,
} from '../scm/github-provider-traits.js';

// Factory
export {
  createScmProvider,
  createGitHubProvider,
  type CreateScmProviderConfig,
} from '../scm/factory.js';
