/**
 * GitHub Client — SCM Provider Adapter
 *
 * Wraps the centralized SCM module (GitHubProvider) to implement
 * the IGitHubClient interface used by the self-development workflow.
 *
 * @module workflows/self-development/github-client
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 * (Source: Issue #1139 — Migrate to SCM module)
 */

import { createLogger } from '../../core/index.js';
import { GitHubProvider } from '../../scm/github-provider.js';
import { ScmError } from '../../scm/types.js';
import type {
  IGitHubClient,
  GitHubIssue,
  GitHubPR,
  CreatePROptions,
  MergePROptions,
  PRStatus,
} from './interfaces.js';

const logger = createLogger({ component: 'github-client' });

/** Error returned when GitHub operations fail. */
export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * Converts an ScmError to a GitHubError for backward compatibility.
 */
function toGitHubError(scmError: ScmError, command: string): GitHubError {
  const stderr = scmError.context?.['stderr'] as string | undefined;
  return new GitHubError(scmError.message, command, stderr);
}

/**
 * GitHub client that delegates to the centralized SCM module.
 *
 * Implements IGitHubClient by wrapping GitHubProvider (IScmProvider).
 * Result<T, ScmError> values are unwrapped: success returns the value,
 * failure throws a GitHubError.
 *
 * Requires: gh CLI installed and authenticated
 */
export class GhCliGitHubClient implements IGitHubClient {
  private readonly provider: GitHubProvider;

  constructor(private readonly repo: string) {
    this.provider = new GitHubProvider(repo);
  }

  async listIssues(labels?: string[]): Promise<GitHubIssue[]> {
    logger.debug('Listing issues', { repo: this.repo, labels });

    const result = await this.provider.listIssues({
      ...(labels !== undefined && labels.length > 0 ? { labels } : {}),
      limit: 50,
    });

    if (!result.ok) {
      logger.error('Failed to list issues', result.error);
      return [];
    }

    return result.value.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels: [...issue.labels],
      author: issue.author,
      createdAt: issue.createdAt,
    }));
  }

  async getIssue(number: number): Promise<GitHubIssue> {
    logger.debug('Getting issue', { repo: this.repo, number });

    const result = await this.provider.getIssue(number);

    if (!result.ok) {
      throw toGitHubError(result.error, `gh issue view ${String(number)}`);
    }

    return {
      number: result.value.number,
      title: result.value.title,
      body: result.value.body,
      labels: [...result.value.labels],
      author: result.value.author,
      createdAt: result.value.createdAt,
    };
  }

  async createPR(options: CreatePROptions): Promise<GitHubPR> {
    logger.info('Creating PR', { repo: this.repo, title: options.title });

    const result = await this.provider.createPR(options);

    if (!result.ok) {
      throw toGitHubError(result.error, 'gh pr create');
    }

    return {
      number: result.value.number,
      url: result.value.url,
    };
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    logger.debug('Adding comment', { repo: this.repo, issueNumber });

    const result = await this.provider.addComment(issueNumber, body);

    if (!result.ok) {
      throw toGitHubError(result.error, `gh issue comment ${String(issueNumber)}`);
    }
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    logger.debug('Adding labels', { repo: this.repo, issueNumber, labels });

    const result = await this.provider.addLabels(issueNumber, labels);

    if (!result.ok) {
      throw toGitHubError(result.error, `gh issue edit ${String(issueNumber)}`);
    }
  }

  async mergePR(prNumber: number, options?: MergePROptions): Promise<void> {
    const method = options?.method ?? 'squash';
    logger.info('Merging PR', { repo: this.repo, prNumber, method });

    const result = await this.provider.mergePR(prNumber, options);

    if (!result.ok) {
      throw toGitHubError(result.error, `gh pr merge ${String(prNumber)}`);
    }
  }

  async getPRStatus(prNumber: number): Promise<PRStatus> {
    logger.debug('Getting PR status', { repo: this.repo, prNumber });

    const result = await this.provider.getPRStatus(prNumber);

    if (!result.ok) {
      throw toGitHubError(result.error, `gh pr view ${String(prNumber)}`);
    }

    return result.value;
  }
}

/**
 * Create a GitHub client for the specified repository.
 *
 * @param repo - Repository in owner/repo format
 * @returns GitHub client instance
 */
export function createGitHubClient(repo: string): IGitHubClient {
  return new GhCliGitHubClient(repo);
}
