/**
 * nexus-agents/scm - GitHub Provider
 *
 * Unified GitHub provider using gh CLI. Implements IScmProvider with
 * Result-based error handling. Replaced the prior dual-path GitHub
 * clients (dogfooding/github-client.ts deleted in #2553;
 * workflows/self-development/github-client.ts deleted in #2402).
 *
 * @module scm/github-provider
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err, createLogger, getErrorMessage } from '../core/index.js';
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
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'GitHubProvider' });

/** Max buffer for gh CLI output (10MB). */
const MAX_BUFFER = 10 * 1024 * 1024;

/** gh CLI subprocess runaway-guard. Centralized to the canonical gh-command
 * timeout in the central authority (#3736); same 30s value. */
const GH_TIMEOUT_MS = CLI_SUBPROCESS_TIMEOUTS.ghCommandMs;

// ============================================================================
// gh CLI JSON schemas (internal — #2962 site 4)
//
// Each schema mirrors the `--json <fields>` projection the corresponding
// gh call asks for. They're applied via `safeParseGhJson` so a gh-schema
// drift (a renamed field, a missing nullable, a removed nested object)
// surfaces as a structured ScmError('schema mismatch') instead of the
// previous TypeError-rewrapped-as-"Failed to parse JSON" — pre-#2962, the
// JSON parsed fine and the mapper's `raw.labels.map` / `raw.author.login`
// deref blew up, so debuggers chased a parser bug that didn't exist.
// ============================================================================

const GhIssueJsonSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  labels: z.array(z.object({ name: z.string() })),
  author: z.object({ login: z.string() }),
  createdAt: z.string(),
});
type GhIssueJson = z.infer<typeof GhIssueJsonSchema>;

const GhCommentJsonSchema = z.object({
  id: z.number(),
  body: z.string(),
  author: z.object({ login: z.string() }),
  createdAt: z.string(),
});
type GhCommentJson = z.infer<typeof GhCommentJsonSchema>;

const GhPrJsonSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  url: z.string(),
  author: z.object({ login: z.string() }),
  baseRefName: z.string(),
  headRefName: z.string(),
});
// `createPR` consumes the parsed value inline; no GhPrJson alias needed.

const GhPrStatusJsonSchema = z.object({
  mergeable: z.string(),
  statusCheckRollup: z.array(z.object({ state: z.string() })).nullable(),
  reviewDecision: z.string().nullable(),
});
type GhPrStatusJson = z.infer<typeof GhPrStatusJsonSchema>;

/**
 * Parse + Zod-validate gh CLI output. Distinguishes:
 * - parse failure (gh returned non-JSON or empty) — \`label: Failed to parse JSON\`
 * - schema mismatch (gh returned valid JSON in an unexpected shape) — \`label: schema mismatch\`
 * Pre-#2962 both surfaced as the same misleading "Failed to parse" error.
 */
function safeParseGhJson<T>(
  rawJson: string,
  schema: z.ZodType<T>,
  label: string
): Result<T, ScmError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return err(
      new ScmError(
        `${label}: Failed to parse JSON: ${getErrorMessage(error)} — preview: ${rawJson.slice(0, 120)}`,
        'github'
      )
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return err(
      new ScmError(
        `${label}: schema mismatch — ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')} — preview: ${rawJson.slice(0, 120)}`,
        'github'
      )
    );
  }
  return ok(result.data);
}

// ============================================================================
// gh CLI executor
// ============================================================================

async function execGh(args: readonly string[], repo?: string): Promise<Result<string, ScmError>> {
  const fullArgs = repo === undefined ? [...args] : [...args, '--repo', repo];

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

    const parsed = safeParseGhJson(result.value, GhIssueJsonSchema, 'getIssue');
    if (!parsed.ok) return parsed;
    return ok(mapIssue(parsed.value));
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

    const parsed = safeParseGhJson(result.value, z.array(GhIssueJsonSchema), 'listIssues');
    if (!parsed.ok) return parsed;
    return ok(parsed.value.map(mapIssue));
  }

  async listRepositoryLabels(): Promise<Result<readonly string[], ScmError>> {
    const args = ['api', `repos/${this.repo}/labels`, '--paginate', '--jq', '.[].name'];

    logger.debug('Listing repository labels', { repo: this.repo });
    const result = await execGh(args);
    if (!result.ok) return result;
    return ok(result.value.length === 0 ? [] : result.value.split('\n'));
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

    const parsed = safeParseGhJson(result.value, GhPrJsonSchema, 'createPR');
    if (!parsed.ok) return parsed;
    const raw = parsed.value;
    return ok({
      number: raw.number,
      title: raw.title,
      body: raw.body ?? '',
      author: raw.author.login,
      base: raw.baseRefName,
      head: raw.headRefName,
      url: raw.url,
    });
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

    const parsed = safeParseGhJson(result.value, GhPrStatusJsonSchema, 'getPRStatus');
    if (!parsed.ok) return parsed;
    return ok(mapPRStatus(parsed.value));
  }

  async createIssue(
    title: string,
    body: string,
    labels?: readonly string[]
  ): Promise<Result<ScmIssue, ScmError>> {
    const args = ['issue', 'create', '--title', title, '--body', body];
    if (labels !== undefined && labels.length > 0) args.push('--label', labels.join(','));
    logger.debug('Creating issue', { repo: this.repo, title });
    const result = await execGh(args, this.repo);
    if (!result.ok) return result;
    const url = result.value.trim();
    const match = /\/(\d+)$/.exec(url);
    const number = match?.[1] !== undefined ? parseInt(match[1], 10) : 0;
    return ok({
      number,
      title,
      body,
      labels: labels !== undefined ? [...labels] : [],
      author: 'pipeline',
      createdAt: new Date().toISOString(),
    });
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

    const parsed = safeParseGhJson(result.value, z.array(GhCommentJsonSchema), 'listComments');
    if (!parsed.ok) return parsed;
    return ok(parsed.value.map(mapComment));
  }
}
