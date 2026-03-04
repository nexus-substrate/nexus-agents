/**
 * nexus-agents/dogfooding - GitHub API Client
 *
 * Minimal GitHub REST API client for PR review operations.
 * Uses native fetch API (Node.js 22+).
 *
 * @module dogfooding/github-client
 * (Source: Issue #161, Alignment Roadmap Phase 3)
 * (Source: GitHub REST API v2022-11-28)
 */

import { execFileSync } from 'node:child_process';
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { PRMetadata, PRFileChange, ReviewDecision } from './pr-review-types.js';
import type { IssueMetadata, IssueComment } from './issue-triage-types.js';

const logger = createLogger({ component: 'GitHubClient' });

// ============================================================================
// Safe extraction helpers for untyped API responses
// ============================================================================

/** Safely extract a string from an unknown value. */
function str(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

/** Safely extract a number from an unknown value. */
function num(val: unknown, fallback = 0): number {
  return typeof val === 'number' ? val : fallback;
}

/** Safely extract a boolean from an unknown value. */
function bool(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

/** Safely extract .login from a nested user-like object. */
function login(val: unknown): string {
  if (typeof val === 'object' && val !== null && 'login' in val) {
    const rec = val as Record<string, unknown>;
    return str(rec.login);
  }
  return '';
}

/** Safely extract .ref from a branch-like object. */
function ref(val: unknown): string {
  if (typeof val === 'object' && val !== null && 'ref' in val) {
    const rec = val as Record<string, unknown>;
    return str(rec.ref);
  }
  return '';
}

/** Safely extract .sha from a branch-like object. */
function sha(val: unknown): string {
  if (typeof val === 'object' && val !== null && 'sha' in val) {
    const rec = val as Record<string, unknown>;
    return str(rec.sha);
  }
  return '';
}

/** Safely extract label names from an array of label objects. */
function labelNames(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => str(item.name))
    .filter((name) => name.length > 0);
}

/**
 * GitHub API error.
 */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * GitHub API client configuration.
 */
export interface GitHubClientConfig {
  /** GitHub token for authentication */
  readonly token: string;
  /** API base URL (for GitHub Enterprise) */
  readonly baseUrl?: string;
  /** Request timeout in ms */
  readonly timeoutMs?: number;
}

/**
 * Default GitHub API configuration.
 */
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.github.com',
  timeoutMs: 30000,
};

/**
 * GitHub API version header.
 */
const API_VERSION = '2022-11-28';

/**
 * GitHub REST API client for PR operations.
 */
export class GitHubClient {
  private readonly config: Required<Omit<GitHubClientConfig, 'token'>> & { token: string };

  constructor(config: GitHubClientConfig) {
    this.config = {
      token: config.token,
      baseUrl: config.baseUrl ?? DEFAULT_CONFIG.baseUrl,
      timeoutMs: config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    };
  }

  /**
   * Fetches pull request metadata including file changes.
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Result<PRMetadata, GitHubError>> {
    const prResult = await this.fetchPRData(owner, repo, prNumber);
    if (!prResult.ok) return prResult;

    const filesResult = await this.fetchPRFiles(owner, repo, prNumber);
    if (!filesResult.ok) return filesResult;

    const pr = prResult.value;
    const files = filesResult.value;

    const metadata: PRMetadata = {
      number: num(pr.number),
      title: str(pr.title),
      body: str(pr.body),
      author: login(pr.user),
      authorAssociation: str(pr.author_association, 'NONE'),
      base: ref(pr.base),
      head: ref(pr.head),
      headSha: sha(pr.head),
      owner,
      repo,
      url: str(pr.html_url),
      draft: bool(pr.draft),
      labels: labelNames(pr.labels),
      files,
      additions: num(pr.additions),
      deletions: num(pr.deletions),
    };

    logger.info('Fetched PR metadata', {
      prNumber,
      fileCount: files.length,
      additions: metadata.additions,
      deletions: metadata.deletions,
    });

    return ok(metadata);
  }

  /**
   * Posts a review comment to a pull request.
   */
  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    event: ReviewDecision
  ): Promise<Result<{ id: number }, GitHubError>> {
    const ghEvent = mapDecisionToGitHubEvent(event);

    const result = await this.request<{ id: number }>(
      'POST',
      `/repos/${owner}/${repo}/pulls/${String(prNumber)}/reviews`,
      { body, event: ghEvent }
    );

    if (result.ok) {
      logger.info('Created PR review', { prNumber, event: ghEvent, reviewId: result.value.id });
    }

    return result;
  }

  /**
   * Posts a general comment on a pull request.
   */
  async createComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<Result<{ id: number }, GitHubError>> {
    const result = await this.request<{ id: number }>(
      'POST',
      `/repos/${owner}/${repo}/issues/${String(prNumber)}/comments`,
      { body }
    );

    if (result.ok) {
      logger.info('Created PR comment', { prNumber, commentId: result.value.id });
    }

    return result;
  }

  /**
   * Fetches issue metadata from GitHub API.
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Result<IssueMetadata, GitHubError>> {
    const result = await this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/issues/${String(issueNumber)}`
    );

    if (!result.ok) return result;

    const issue = result.value;
    const metadata: IssueMetadata = {
      number: num(issue.number),
      title: str(issue.title),
      body: str(issue.body),
      author: login(issue.user),
      authorAssociation: str(issue.author_association, 'NONE'),
      owner,
      repo,
      url: str(issue.html_url),
      state: str(issue.state),
      labels: labelNames(issue.labels),
      createdAt: str(issue.created_at),
    };

    logger.info('Fetched issue metadata', { issueNumber, state: metadata.state });
    return ok(metadata);
  }

  /**
   * Fetches comments on a GitHub issue.
   */
  async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Result<IssueComment[], GitHubError>> {
    const result = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments`
    );

    if (!result.ok) return result;

    const comments: IssueComment[] = result.value.map((c) => ({
      id: num(c.id),
      body: str(c.body),
      author: login(c.user),
      authorAssociation: str(c.author_association, 'NONE'),
      createdAt: str(c.created_at),
    }));

    logger.info('Fetched issue comments', { issueNumber, count: comments.length });
    return ok(comments);
  }

  /**
   * Adds labels to a GitHub issue.
   */
  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: readonly string[]
  ): Promise<Result<readonly string[], GitHubError>> {
    const result = await this.request<Array<{ name: string }>>(
      'POST',
      `/repos/${owner}/${repo}/issues/${String(issueNumber)}/labels`,
      { labels: [...labels] }
    );

    if (!result.ok) return result;

    const addedLabels = result.value.map((l) => l.name);
    logger.info('Added labels to issue', { issueNumber, labels: addedLabels });
    return ok(addedLabels);
  }

  /**
   * Fetches PR data from GitHub API.
   */
  private async fetchPRData(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Result<Record<string, unknown>, GitHubError>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${String(prNumber)}`
    );
  }

  /**
   * Fetches PR file changes from GitHub API.
   */
  private async fetchPRFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Result<PRFileChange[], GitHubError>> {
    const result = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${String(prNumber)}/files`
    );

    if (!result.ok) return result;

    const files: PRFileChange[] = result.value.map((f) => ({
      filename: str(f.filename),
      status: mapFileStatus(str(f.status)),
      additions: num(f.additions),
      deletions: num(f.deletions),
      ...(typeof f.patch === 'string' ? { patch: f.patch } : {}),
      ...(typeof f.previous_filename === 'string' ? { previousFilename: f.previous_filename } : {}),
    }));

    return ok(files);
  }

  /**
   * Makes a request to the GitHub API.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<Result<T, GitHubError>> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.timeoutMs);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'nexus-agents/1.0',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        signal: controller.signal,
      };

      if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('GitHub API error', new Error(errorBody), {
          status: response.status,
          path,
        });
        return err(
          new GitHubError(`GitHub API error: ${response.statusText}`, response.status, {
            path,
            body: errorBody,
          })
        );
      }

      const data = (await response.json()) as T;
      return ok(data);
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('GitHub request failed', error instanceof Error ? error : new Error(message));
      return err(new GitHubError(message, 0, { path }));
    }
  }
}

/**
 * Maps GitHub file status to our enum.
 */
function mapFileStatus(status: string): PRFileChange['status'] {
  switch (status) {
    case 'added':
      return 'added';
    case 'removed':
      return 'removed';
    case 'modified':
      return 'modified';
    case 'renamed':
      return 'renamed';
    case 'copied':
      return 'copied';
    default:
      return 'modified';
  }
}

/**
 * Maps our review decision to GitHub event type.
 */
function mapDecisionToGitHubEvent(decision: ReviewDecision): string {
  switch (decision) {
    case 'approve':
      return 'APPROVE';
    case 'request_changes':
      return 'REQUEST_CHANGES';
    case 'comment':
      return 'COMMENT';
  }
}

/**
 * Parses a PR URL into owner, repo, and number.
 */
export function parsePRUrl(url: string): Result<
  {
    owner: string;
    repo: string;
    prNumber: number;
  },
  Error
> {
  // Handle formats:
  // https://github.com/owner/repo/pull/123
  // owner/repo#123
  // owner/repo/pull/123

  const httpPattern = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const shortPattern = /^([^/]+)\/([^/#]+)(?:#|\/pull\/)(\d+)$/;

  const match = httpPattern.exec(url) ?? shortPattern.exec(url);

  if (match === null) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  const owner = match[1];
  const repo = match[2];
  const numberStr = match[3];

  if (owner === undefined || repo === undefined || numberStr === undefined) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  const prNumber = parseInt(numberStr, 10);

  if (isNaN(prNumber)) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  return ok({ owner, repo, prNumber });
}

/**
 * Parses an issue URL into owner, repo, and number.
 */
export function parseIssueUrl(url: string): Result<
  {
    owner: string;
    repo: string;
    issueNumber: number;
  },
  Error
> {
  // Handle formats:
  // https://github.com/owner/repo/issues/123
  // owner/repo#123

  const httpPattern = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
  const shortPattern = /^([^/]+)\/([^/#]+)#(\d+)$/;

  const match = httpPattern.exec(url) ?? shortPattern.exec(url);

  if (match === null) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  const owner = match[1];
  const repo = match[2];
  const numberStr = match[3];

  if (owner === undefined || repo === undefined || numberStr === undefined) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  const issueNumber = parseInt(numberStr, 10);

  if (isNaN(issueNumber)) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  return ok({ owner, repo, issueNumber });
}

/**
 * Try to resolve token from `gh auth token` CLI (synchronous).
 * Returns the token string or undefined if gh CLI is unavailable.
 */
function tryGhCliToken(): string | undefined {
  try {
    const stdout = execFileSync('gh', ['auth', 'token'], {
      timeout: 5_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates a GitHub client from environment variables.
 * Falls back to `gh auth token` CLI when env vars are not set (#1131).
 */
export function createGitHubClientFromEnv(): Result<GitHubClient, Error> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? tryGhCliToken();

  if (token === undefined) {
    return err(
      new Error(
        'GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN, or authenticate with `gh auth login`.'
      )
    );
  }

  return ok(
    new GitHubClient({
      token,
      baseUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
    })
  );
}
