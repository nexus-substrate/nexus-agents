/**
 * SCM (Source Control Management) exports — Centralized SCM provider module.
 * Replaces dual-path GitHub clients with unified IScmProvider interface.
 *
 * @module exports/scm
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */
export {
  // Types
  type ScmPlatform,
  type TokenStrategy,
  type ScmToken,
  type TokenResolverConfig,
  type ScmIssue,
  type ScmPullRequest,
  type ScmComment,
  type CreatePROptions,
  type MergePROptions,
  type PRStatus as ScmPRStatus, // Renamed: self-development/interfaces.ts exports PRStatus
  type IssueFilters,
  type IScmProvider,
  // Error class
  ScmError,
} from '../scm/types.js';

// Token resolution
export { resolveToken, hasToken, getTokenEnvVars } from '../scm/token-resolver.js';

// Provider implementations
export { GitHubProvider } from '../scm/github-provider.js';

// Factory
export {
  createScmProvider,
  createGitHubProvider,
  type CreateScmProviderConfig,
} from '../scm/factory.js';
