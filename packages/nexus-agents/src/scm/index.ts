/**
 * nexus-agents/scm - Centralized SCM Provider Module
 *
 * Single source of truth for all Source Control Management operations.
 * Replaced the prior dual-path GitHub clients in two steps:
 * - workflows/self-development/github-client.ts (deleted in #2402)
 * - dogfooding/github-client.ts (deleted in #2553, URL parsers lifted here)
 *
 * @module scm
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

// Core types
export type {
  ScmPlatform,
  TokenStrategy,
  ScmToken,
  TokenResolverConfig,
  ScmIssue,
  ScmPullRequest,
  ScmComment,
  CreatePROptions,
  MergePROptions,
  PRStatus,
  IssueFilters,
  IScmProvider,
  // Extended entity types (trait support)
  ScmFileChange,
  ScmPullRequestDetail,
  ScmIssueDetail,
  ScmCommentDetail,
  ScmReviewDecision,
  ScmUserMetadata,
  // Trait interfaces (ISP)
  IScmReviewer,
  IScmUserInfo,
  // Convenience composite types
  ReviewCapableProvider,
  FullCapableProvider,
} from './types.js';
export { ScmError } from './types.js';

// Token resolution
export { resolveToken, hasToken, getTokenEnvVars } from './token-resolver.js';

// Provider implementations
export { GitHubProvider } from './github-provider.js';

// Trait implementations
export {
  GitHubReviewer,
  GitHubUserInfo,
  createFullGitHubProvider,
} from './github-provider-traits.js';

// Factory
export { createScmProvider, createGitHubProvider } from './factory.js';
export type { CreateScmProviderConfig } from './factory.js';

// URL parsers (#2553 — lifted from dogfooding/github-client when the
// dual GitHub-client surface consolidated into scm/).
export { parsePRUrl, parseIssueUrl } from './url-parsers.js';
