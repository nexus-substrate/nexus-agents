/**
 * nexus-agents/scm - SCM Provider Types
 *
 * Shared types for the centralized SCM (Source Control Management) module.
 * Supports GitHub (REST API + gh CLI) with extensibility for GitLab/Gitea.
 *
 * @module scm/types
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import type { Result } from '../core/index.js';

// ============================================================================
// Token Types
// ============================================================================

/** Supported SCM platforms. */
export type ScmPlatform = 'github' | 'gitlab' | 'gitea';

/** Token resolution strategy. */
export type TokenStrategy = 'env' | 'cli' | 'config';

/** Resolved SCM token with metadata. */
export interface ScmToken {
  /** The raw token value */
  readonly value: string;
  /** How the token was resolved */
  readonly strategy: TokenStrategy;
  /** SCM platform this token is for */
  readonly platform: ScmPlatform;
}

/** Token resolution configuration. */
export interface TokenResolverConfig {
  /** Explicit token (highest priority) */
  readonly token?: string;
  /** SCM platform to resolve for */
  readonly platform?: ScmPlatform;
  /** Custom env var name override */
  readonly envVar?: string;
}

// ============================================================================
// SCM Entity Types
// ============================================================================

/** SCM issue representation. */
export interface ScmIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly author: string;
  readonly createdAt: string;
}

/** SCM pull/merge request representation. */
export interface ScmPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly base: string;
  readonly head: string;
  readonly url: string;
}

/** SCM comment representation. */
export interface ScmComment {
  readonly id: number;
  readonly body: string;
  readonly author: string;
  readonly createdAt: string;
}

/** PR creation options. */
export interface CreatePROptions {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
}

/** PR merge options. */
export interface MergePROptions {
  readonly method?: 'merge' | 'squash' | 'rebase';
  readonly commitTitle?: string;
  readonly commitMessage?: string;
  readonly deleteBranch?: boolean;
}

/** PR status for merge eligibility. */
export interface PRStatus {
  readonly mergeable: boolean;
  readonly checksStatus: 'pending' | 'success' | 'failure';
  readonly reviewStatus: 'approved' | 'pending' | 'changes_requested';
}

/** Issue filter options. */
export interface IssueFilters {
  readonly labels?: readonly string[];
  readonly state?: 'open' | 'closed' | 'all';
  readonly limit?: number;
}

// ============================================================================
// SCM Error
// ============================================================================

/** Unified SCM error with platform-aware context. */
export class ScmError extends Error {
  constructor(
    message: string,
    readonly platform: ScmPlatform,
    readonly statusCode?: number,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ScmError';
  }
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Unified SCM provider interface.
 *
 * All methods return `Result<T, ScmError>` for consistent error handling
 * across GitHub REST API, gh CLI, and future GitLab/Gitea backends.
 */
export interface IScmProvider {
  /** Platform identifier. */
  readonly platform: ScmPlatform;

  /** Repository in owner/repo format. */
  readonly repo: string;

  // Issues
  getIssue(number: number): Promise<Result<ScmIssue, ScmError>>;
  listIssues(filters?: IssueFilters): Promise<Result<readonly ScmIssue[], ScmError>>;
  addLabels(issueNumber: number, labels: readonly string[]): Promise<Result<void, ScmError>>;

  // Pull Requests
  createPR(options: CreatePROptions): Promise<Result<ScmPullRequest, ScmError>>;
  mergePR(prNumber: number, options?: MergePROptions): Promise<Result<void, ScmError>>;
  getPRStatus(prNumber: number): Promise<Result<PRStatus, ScmError>>;

  // Comments
  addComment(issueNumber: number, body: string): Promise<Result<void, ScmError>>;
  listComments(issueNumber: number): Promise<Result<readonly ScmComment[], ScmError>>;
}
