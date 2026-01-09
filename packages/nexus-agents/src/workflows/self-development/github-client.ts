/**
 * GitHub Client Implementation
 *
 * Uses the `gh` CLI for GitHub operations. Provides issue and PR management
 * for the self-development workflow.
 *
 * @module workflows/self-development/github-client
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../../core/index.js';
import { ok, err, createLogger } from '../../core/index.js';
import type { IGitHubClient, GitHubIssue, GitHubPR, CreatePROptions } from './interfaces.js';

const execFileAsync = promisify(execFile);
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

/** Issue data from gh CLI JSON output. */
interface GhIssueJson {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  author: { login: string };
  createdAt: string;
}

/** PR data from gh CLI JSON output. */
interface GhPrJson {
  number: number;
  url: string;
}

/**
 * Execute a gh CLI command and return the result.
 */
async function execGh(args: readonly string[], repo: string): Promise<Result<string, GitHubError>> {
  const fullArgs = [...args, '--repo', repo];

  try {
    const { stdout } = await execFileAsync('gh', fullArgs, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });
    return ok(stdout.trim());
  } catch (error) {
    const execError = error as { message: string; stderr?: string };
    return err(
      new GitHubError(
        `gh command failed: ${execError.message}`,
        `gh ${fullArgs.join(' ')}`,
        execError.stderr
      )
    );
  }
}

/**
 * GitHub client using gh CLI.
 *
 * Requires: gh CLI installed and authenticated
 */
export class GhCliGitHubClient implements IGitHubClient {
  constructor(private readonly repo: string) {}

  async listIssues(labels?: string[]): Promise<GitHubIssue[]> {
    const args = ['issue', 'list', '--json', 'number,title,body,labels,author,createdAt'];

    if (labels !== undefined && labels.length > 0) {
      args.push('--label', labels.join(','));
    }

    // Limit to 50 issues by default
    args.push('--limit', '50');

    logger.debug('Listing issues', { repo: this.repo, labels });
    const result = await execGh(args, this.repo);

    if (!result.ok) {
      logger.error('Failed to list issues', result.error);
      return [];
    }

    try {
      const issues = JSON.parse(result.value) as GhIssueJson[];
      return issues.map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? '',
        labels: i.labels.map((l) => l.name),
        author: i.author.login,
        createdAt: i.createdAt,
      }));
    } catch (parseError) {
      logger.error(
        'Failed to parse issues JSON',
        parseError instanceof Error ? parseError : undefined
      );
      return [];
    }
  }

  async getIssue(number: number): Promise<GitHubIssue> {
    const args = [
      'issue',
      'view',
      String(number),
      '--json',
      'number,title,body,labels,author,createdAt',
    ];

    logger.debug('Getting issue', { repo: this.repo, number });
    const result = await execGh(args, this.repo);

    if (!result.ok) {
      throw new GitHubError(
        `Failed to get issue #${String(number)}`,
        result.error.command,
        result.error.stderr
      );
    }

    const issue = JSON.parse(result.value) as GhIssueJson;
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      labels: issue.labels.map((l) => l.name),
      author: issue.author.login,
      createdAt: issue.createdAt,
    };
  }

  async createPR(options: CreatePROptions): Promise<GitHubPR> {
    const args = [
      'pr',
      'create',
      '--title',
      options.title,
      '--body',
      options.body,
      '--head',
      options.head,
      '--base',
      options.base,
      '--json',
      'number,url',
    ];

    logger.info('Creating PR', { repo: this.repo, title: options.title });
    const result = await execGh(args, this.repo);

    if (!result.ok) {
      throw new GitHubError('Failed to create PR', result.error.command, result.error.stderr);
    }

    const pr = JSON.parse(result.value) as GhPrJson;
    return {
      number: pr.number,
      url: pr.url,
    };
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    const args = ['issue', 'comment', String(issueNumber), '--body', body];

    logger.debug('Adding comment', { repo: this.repo, issueNumber });
    const result = await execGh(args, this.repo);

    if (!result.ok) {
      throw new GitHubError(
        `Failed to add comment to #${String(issueNumber)}`,
        result.error.command,
        result.error.stderr
      );
    }
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    const args = ['issue', 'edit', String(issueNumber), '--add-label', labels.join(',')];

    logger.debug('Adding labels', { repo: this.repo, issueNumber, labels });
    const result = await execGh(args, this.repo);

    if (!result.ok) {
      throw new GitHubError(
        `Failed to add labels to #${String(issueNumber)}`,
        result.error.command,
        result.error.stderr
      );
    }
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
