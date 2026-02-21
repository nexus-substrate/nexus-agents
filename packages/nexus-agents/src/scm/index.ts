/**
 * nexus-agents/scm - Centralized SCM Provider Module
 *
 * Single source of truth for all Source Control Management operations.
 * Replaces the previous dual-path GitHub clients:
 * - dogfooding/github-client.ts (REST API via fetch)
 * - workflows/self-development/github-client.ts (gh CLI wrapper)
 *
 * @module scm
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

// Types
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
} from './types.js';
export { ScmError } from './types.js';

// Token resolution
export { resolveToken, hasToken, getTokenEnvVars } from './token-resolver.js';

// Provider implementations
export { GitHubProvider } from './github-provider.js';

// Factory
export { createScmProvider, createGitHubProvider } from './factory.js';
export type { CreateScmProviderConfig } from './factory.js';
