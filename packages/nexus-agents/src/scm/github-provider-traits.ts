/**
 * nexus-agents/scm - GitHub Provider Trait Implementations
 *
 * Implements IScmReviewer and IScmUserInfo trait interfaces for GitHub.
 * Uses `gh api` for REST API access to get detailed data.
 *
 * @module scm/github-provider-traits
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type {
  IScmReviewer,
  IScmUserInfo,
  ScmPullRequestDetail,
  ScmIssueDetail,
  ScmCommentDetail,
  ScmReviewDecision,
  ScmUserMetadata,
  ScmFileChange,
} from './types.js';
import { ScmError } from './types.js';
import { GitHubProvider } from './github-provider.js';

const logger = createLogger({ component: 'GitHubProviderTraits' });

// ============================================================================
// gh API JSON types (internal)
// ============================================================================

interface GhApiPrJson {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string };
  author_association: string;
  base: { ref: string };
  head: { ref: string; sha: string };
  draft: boolean;
  labels: Array<{ name: string }>;
  additions: number;
  deletions: number;
}

interface GhApiFileJson {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

interface GhApiIssueJson {
  number: number;
  title: string;
  body: string | null;
  user: { login: string };
  author_association: string;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
  created_at: string;
}

interface GhApiCommentJson {
  id: number;
  body: string;
  user: { login: string };
  author_association: string;
  created_at: string;
}

interface GhApiUserJson {
  login: string;
  name: string | null;
  company: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
}

// ============================================================================
// gh API executor
// ============================================================================

async function execGhApi(endpoint: string, method?: string): Promise<Result<string, ScmError>> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  const args = ['api', endpoint];
  if (method !== undefined) args.push('--method', method);

  try {
    const { stdout } = await exec('gh', args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    return ok(stdout.trim());
  } catch (error) {
    const execError = error as { message: string; stderr?: string };
    return err(
      new ScmError(`gh api failed: ${execError.message}`, 'github', undefined, {
        endpoint,
        stderr: execError.stderr,
      })
    );
  }
}

// ============================================================================
// Mappers
// ============================================================================

function mapFileChange(raw: GhApiFileJson): ScmFileChange {
  const statusMap: Record<string, ScmFileChange['status']> = {
    added: 'added',
    removed: 'removed',
    modified: 'modified',
    renamed: 'renamed',
    copied: 'copied',
  };
  return {
    filename: raw.filename,
    status: statusMap[raw.status] ?? 'modified',
    additions: raw.additions,
    deletions: raw.deletions,
    ...(raw.patch !== undefined ? { patch: raw.patch } : {}),
    ...(raw.previous_filename !== undefined ? { previousFilename: raw.previous_filename } : {}),
  };
}

// ============================================================================
// GitHubReviewer — implements IScmReviewer
// ============================================================================

/**
 * GitHub-specific reviewer that adds PR detail and review capabilities
 * to a GitHubProvider. Implements IScmReviewer trait.
 *
 * @example
 * ```typescript
 * const provider = createGitHubProvider('owner/repo');
 * const reviewer = new GitHubReviewer(provider);
 * const detail = await reviewer.getPullRequestDetail(42);
 * ```
 */
export class GitHubReviewer implements IScmReviewer {
  constructor(private readonly provider: GitHubProvider) {}

  async getPullRequestDetail(prNumber: number): Promise<Result<ScmPullRequestDetail, ScmError>> {
    const repo = this.provider.repo;
    logger.debug('Getting PR detail', { repo, prNumber });

    const prResult = await execGhApi(`repos/${repo}/pulls/${String(prNumber)}`);
    if (!prResult.ok) return prResult;

    const filesResult = await execGhApi(`repos/${repo}/pulls/${String(prNumber)}/files`);
    if (!filesResult.ok) return filesResult;

    try {
      const pr = JSON.parse(prResult.value) as GhApiPrJson;
      const files = JSON.parse(filesResult.value) as GhApiFileJson[];

      return ok({
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        author: pr.user.login,
        base: pr.base.ref,
        head: pr.head.ref,
        url: pr.html_url,
        draft: pr.draft,
        authorAssociation: pr.author_association,
        labels: pr.labels.map((l) => l.name),
        files: files.map(mapFileChange),
        additions: pr.additions,
        deletions: pr.deletions,
        headSha: pr.head.sha,
      });
    } catch {
      return err(new ScmError('Failed to parse PR detail JSON', 'github'));
    }
  }

  async createReview(
    prNumber: number,
    body: string,
    decision: ScmReviewDecision
  ): Promise<Result<void, ScmError>> {
    const repo = this.provider.repo;
    const eventMap: Record<ScmReviewDecision, string> = {
      approve: 'APPROVE',
      request_changes: 'REQUEST_CHANGES',
      comment: 'COMMENT',
    };

    logger.info('Creating review', { repo, prNumber, decision });

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    try {
      await exec(
        'gh',
        [
          'api',
          `repos/${repo}/pulls/${String(prNumber)}/reviews`,
          '--method',
          'POST',
          '-f',
          `body=${body}`,
          '-f',
          `event=${eventMap[decision]}`,
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 }
      );
      return ok(undefined);
    } catch (error) {
      const execError = error as { message: string };
      return err(new ScmError(`Failed to create review: ${execError.message}`, 'github'));
    }
  }

  async getIssueDetail(issueNumber: number): Promise<Result<ScmIssueDetail, ScmError>> {
    const repo = this.provider.repo;
    logger.debug('Getting issue detail', { repo, issueNumber });

    const result = await execGhApi(`repos/${repo}/issues/${String(issueNumber)}`);
    if (!result.ok) return result;

    try {
      const raw = JSON.parse(result.value) as GhApiIssueJson;
      return ok({
        number: raw.number,
        title: raw.title,
        body: raw.body ?? '',
        labels: raw.labels.map((l) => l.name),
        author: raw.user.login,
        createdAt: raw.created_at,
        authorAssociation: raw.author_association,
        state: raw.state,
        url: raw.html_url,
      });
    } catch {
      return err(new ScmError('Failed to parse issue detail JSON', 'github'));
    }
  }

  async listCommentDetails(
    issueNumber: number
  ): Promise<Result<readonly ScmCommentDetail[], ScmError>> {
    const repo = this.provider.repo;
    logger.debug('Listing comment details', { repo, issueNumber });

    const result = await execGhApi(`repos/${repo}/issues/${String(issueNumber)}/comments`);
    if (!result.ok) return result;

    try {
      const comments = JSON.parse(result.value) as GhApiCommentJson[];
      return ok(
        comments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.user.login,
          createdAt: c.created_at,
          authorAssociation: c.author_association,
        }))
      );
    } catch {
      return err(new ScmError('Failed to parse comment details JSON', 'github'));
    }
  }
}

// ============================================================================
// GitHubUserInfo — implements IScmUserInfo
// ============================================================================

/**
 * GitHub-specific user info provider. Implements IScmUserInfo trait.
 */
export class GitHubUserInfo implements IScmUserInfo {
  async fetchUserMetadata(username: string): Promise<Result<ScmUserMetadata, ScmError>> {
    logger.debug('Fetching user metadata', { username });

    const result = await execGhApi(`users/${username}`);
    if (!result.ok) return result;

    try {
      const raw = JSON.parse(result.value) as GhApiUserJson;
      return ok({
        login: raw.login,
        name: raw.name,
        company: raw.company,
        followers: raw.followers,
        following: raw.following,
        publicRepos: raw.public_repos,
        createdAt: raw.created_at,
      });
    } catch {
      return err(new ScmError('Failed to parse user metadata JSON', 'github'));
    }
  }
}

// ============================================================================
// Factory — compose provider with traits
// ============================================================================

/**
 * Creates a full-capability GitHub provider with all traits.
 *
 * Returns an object that implements IScmProvider & IScmReviewer & IScmUserInfo.
 * Consumers can narrow the type to only the traits they need.
 *
 * @example
 * ```typescript
 * const provider = createFullGitHubProvider('owner/repo');
 * // Use as ReviewCapableProvider
 * const detail = await provider.getPullRequestDetail(42);
 * // Use as IScmUserInfo
 * const user = await provider.fetchUserMetadata('octocat');
 * ```
 */
export function createFullGitHubProvider(
  repo: string
): GitHubProvider & IScmReviewer & IScmUserInfo {
  const base = new GitHubProvider(repo);
  const reviewer = new GitHubReviewer(base);
  const userInfo = new GitHubUserInfo();

  // Compose all trait methods onto the provider
  return Object.assign(base, {
    getPullRequestDetail: reviewer.getPullRequestDetail.bind(reviewer),
    createReview: reviewer.createReview.bind(reviewer),
    getIssueDetail: reviewer.getIssueDetail.bind(reviewer),
    listCommentDetails: reviewer.listCommentDetails.bind(reviewer),
    fetchUserMetadata: userInfo.fetchUserMetadata.bind(userInfo),
  });
}
