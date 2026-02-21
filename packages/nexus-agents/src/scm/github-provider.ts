/**
 * nexus-agents/scm - GitHub Provider
 *
 * Unified GitHub provider using gh CLI. Implements IScmProvider with
 * Result-based error handling. Consolidates the two previous GitHub
 * clients (dogfooding/github-client.ts and workflows/self-development/github-client.ts).
 *
 * @module scm/github-provider
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type {
  IScmProvider,
  ScmIssue,
  ScmPullRequest,
  ScmComment,
  CreatePROptions,
  MergePROptions,
  PRStatus,
  IssueFilters,
} from './types.js';
import { ScmError } from './types.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'GitHubProvider' });

/** Max buffer for gh CLI output (10MB). */
const MAX_BUFFER = 10 * 1024 * 1024;

/** gh CLI timeout in ms. */
const GH_TIMEOUT_MS = 30_000;

// ============================================================================
// gh CLI JSON types (internal)
// ============================================================================

interface GhIssueJson {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  author: { login: string };
  createdAt: string;
}

interface GhCommentJson {
  id: number;
  body: string;
  author: { login: string };
  createdAt: string;
}

interface GhPrJson {
  number: number;
  title: string;
  body: string | null;
  url: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
}

interface GhPrStatusJson {
  mergeable: string;
  statusCheckRollup: Array<{ state: string }> | null;
  reviewDecision: string | null;
}

// ============================================================================
// gh CLI executor
// ============================================================================

async function execGh(args: readonly string[], repo: string): Promise<Result<string, ScmError>> {
  const fullArgs = [...args, '--repo', repo];

  try {
    const { stdout } = await execFileAsync('gh', fullArgs, {
      maxBuffer: MAX_BUFFER,
      timeout: GH_TIMEOUT_MS,
    });
    return ok(stdout.trim());
  } catch (error) {
    const execError = error as { message: string; stderr?: string };
    return err(
      new ScmError(`gh command failed: ${execError.message}`, 'github', undefined, {
        command: `gh ${fullArgs.join(' ')}`,
        stderr: execError.stderr,
      })
    );
  }
}

// ============================================================================
// Mappers
// ============================================================================

function mapIssue(raw: GhIssueJson): ScmIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    labels: raw.labels.map((l) => l.name),
    author: raw.author.login,
    createdAt: raw.createdAt,
  };
}

function mapComment(raw: GhCommentJson): ScmComment {
  return {
    id: raw.id,
    body: raw.body,
    author: raw.author.login,
    createdAt: raw.createdAt,
  };
}

function mapPRStatus(raw: GhPrStatusJson): PRStatus {
  const mergeable = raw.mergeable === 'MERGEABLE';

  let checksStatus: 'pending' | 'success' | 'failure' = 'pending';
  if (raw.statusCheckRollup !== null && raw.statusCheckRollup.length > 0) {
    const hasFailure = raw.statusCheckRollup.some((c) => c.state === 'FAILURE');
    const allSuccess = raw.statusCheckRollup.every(
      (c) => c.state === 'SUCCESS' || c.state === 'NEUTRAL' || c.state === 'SKIPPED'
    );
    checksStatus = hasFailure ? 'failure' : allSuccess ? 'success' : 'pending';
  }

  let reviewStatus: 'approved' | 'pending' | 'changes_requested' = 'pending';
  if (raw.reviewDecision === 'APPROVED') reviewStatus = 'approved';
  else if (raw.reviewDecision === 'CHANGES_REQUESTED') reviewStatus = 'changes_requested';

  return { mergeable, checksStatus, reviewStatus };
}

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * GitHub provider using the gh CLI.
 *
 * Requires: gh CLI installed and authenticated.
 */
export class GitHubProvider implements IScmProvider {
  readonly platform = 'github' as const;

  constructor(readonly repo: string) {}

  async getIssue(number: number): Promise<Result<ScmIssue, ScmError>> {
    const fields = 'number,title,body,labels,author,createdAt';
    const args = ['issue', 'view', String(number), '--json', fields];

    logger.debug('Getting issue', { repo: this.repo, number });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;

    try {
      return ok(mapIssue(JSON.parse(result.value) as GhIssueJson));
    } catch {
      return err(new ScmError('Failed to parse issue JSON', 'github'));
    }
  }

  async listIssues(filters?: IssueFilters): Promise<Result<readonly ScmIssue[], ScmError>> {
    const fields = 'number,title,body,labels,author,createdAt';
    const args = ['issue', 'list', '--json', fields];

    if (filters?.labels !== undefined && filters.labels.length > 0) {
      args.push('--label', filters.labels.join(','));
    }
    if (filters?.state !== undefined) {
      args.push('--state', filters.state);
    }
    args.push('--limit', String(filters?.limit ?? 50));

    logger.debug('Listing issues', { repo: this.repo, filters });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;

    try {
      const issues = JSON.parse(result.value) as GhIssueJson[];
      return ok(issues.map(mapIssue));
    } catch {
      return err(new ScmError('Failed to parse issues JSON', 'github'));
    }
  }

  async addLabels(issueNumber: number, labels: readonly string[]): Promise<Result<void, ScmError>> {
    const args = ['issue', 'edit', String(issueNumber), '--add-label', labels.join(',')];

    logger.debug('Adding labels', { repo: this.repo, issueNumber, labels });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;
    return ok(undefined);
  }

  async createPR(options: CreatePROptions): Promise<Result<ScmPullRequest, ScmError>> {
    const fields = 'number,title,body,url,author,baseRefName,headRefName';
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
      fields,
    ];

    logger.info('Creating PR', { repo: this.repo, title: options.title });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;

    try {
      const raw = JSON.parse(result.value) as GhPrJson;
      return ok({
        number: raw.number,
        title: raw.title,
        body: raw.body ?? '',
        author: raw.author.login,
        base: raw.baseRefName,
        head: raw.headRefName,
        url: raw.url,
      });
    } catch {
      return err(new ScmError('Failed to parse PR JSON', 'github'));
    }
  }

  async mergePR(prNumber: number, options?: MergePROptions): Promise<Result<void, ScmError>> {
    const method = options?.method ?? 'squash';
    const args = ['pr', 'merge', String(prNumber), `--${method}`];

    if (options?.commitTitle !== undefined) args.push('--subject', options.commitTitle);
    if (options?.commitMessage !== undefined) args.push('--body', options.commitMessage);
    if (options?.deleteBranch === true) args.push('--delete-branch');

    logger.info('Merging PR', { repo: this.repo, prNumber, method });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;
    return ok(undefined);
  }

  async getPRStatus(prNumber: number): Promise<Result<PRStatus, ScmError>> {
    const fields = 'mergeable,statusCheckRollup,reviewDecision';
    const args = ['pr', 'view', String(prNumber), '--json', fields];

    logger.debug('Getting PR status', { repo: this.repo, prNumber });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;

    try {
      return ok(mapPRStatus(JSON.parse(result.value) as GhPrStatusJson));
    } catch {
      return err(new ScmError('Failed to parse PR status JSON', 'github'));
    }
  }

  async addComment(issueNumber: number, body: string): Promise<Result<void, ScmError>> {
    const args = ['issue', 'comment', String(issueNumber), '--body', body];

    logger.debug('Adding comment', { repo: this.repo, issueNumber });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;
    return ok(undefined);
  }

  async listComments(issueNumber: number): Promise<Result<readonly ScmComment[], ScmError>> {
    const args = ['issue', 'view', String(issueNumber), '--json', 'comments', '--jq', '.comments'];

    logger.debug('Listing comments', { repo: this.repo, issueNumber });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;

    try {
      const comments = JSON.parse(result.value) as GhCommentJson[];
      return ok(comments.map(mapComment));
    } catch {
      return err(new ScmError('Failed to parse comments JSON', 'github'));
    }
  }
}
