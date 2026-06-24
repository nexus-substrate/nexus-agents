/**
 * Auto-file suggested tasks as GitHub issues (#3382).
 *
 * Takes candidate `PipelineTask[]` produced by `checkForResearchTriggers` /
 * `checkForCapabilityGapTriggers` and files each as a GitHub issue — the
 * "Option B" auto-file path the Mission names (suggest-only → auto-file).
 *
 * SENSITIVE: this creates GitHub issues. It is bounded by HARD safeguards:
 * - **Rate limit** — at most `maxPerRun` issues per invocation (default small).
 * - **Dedup** — skips a task whose title already matches an open issue.
 * - **Label** — every filed issue gets a `machine-suggested` label so the
 *   automated origin is visible and filterable.
 * - **Scrub** — strips sensitive org/gov references from title + body.
 * - **Fail closed** — if the GitHub boundary is unavailable, files nothing.
 *
 * The GitHub boundary (`searchExisting`, `fileIssue`) is injectable so the
 * safeguard logic is fully unit-testable without touching `gh`.
 *
 * @module cli/auto-file-suggestions
 * (Source: Issue #3382 — auto-file research/gap suggestions)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger, getErrorMessage } from '../core/index.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { createResearchIssue } from './research-helpers-issues.js';
import type { PipelineTask } from '../pipeline/dev-pipeline.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'auto-file-suggestions' });

/** Label applied to every auto-filed issue so the automated origin is visible. */
export const MACHINE_SUGGESTED_LABEL = 'machine-suggested';

/** Conservative default — a sensitive write path should not flood. */
const DEFAULT_MAX_PER_RUN = 3;

/**
 * Env var holding operator-configured sensitive org/gov reference terms to scrub
 * from auto-filed issue text (comma/whitespace-separated). The terms are
 * deliberately NOT hardcoded here: this is a public repo, so an organization's
 * specific reference must live in that operator's own config, never in source
 * (opsec — a hardcoded denylist literal is itself a disclosure). Unset/empty ⇒
 * no scrubbing. Operators who auto-file from a sensitive context MUST set this.
 */
export const SENSITIVE_REFS_ENV = 'NEXUS_SENSITIVE_REFS';

/** Escape regex metacharacters in an operator-supplied term. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary, case-insensitive patterns from the configured terms (memoized off env). */
function loadSensitiveRefPatterns(env: NodeJS.ProcessEnv): readonly RegExp[] {
  const raw = env[SENSITIVE_REFS_ENV];
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, 'gi'));
}

/**
 * Replaces operator-configured sensitive references (see {@link SENSITIVE_REFS_ENV})
 * with a neutral placeholder. No-op when none are configured. The `env` param is
 * injectable for tests; production callers use `process.env`.
 */
export function scrubSensitiveRefs(text: string, env: NodeJS.ProcessEnv = process.env): string {
  return loadSensitiveRefPatterns(env).reduce(
    (acc, pattern) => acc.replace(pattern, 'the configured provider'),
    text
  );
}

/** Why a candidate was not filed. */
export type SkipReason = 'duplicate' | 'rate-limit' | 'gh-unavailable' | 'error';

/** Injectable GitHub boundary — defaults shell out to `gh`. */
export interface AutoFileDeps {
  /** Returns true if an open issue with a matching title already exists. */
  readonly searchExisting?: (title: string) => Promise<boolean>;
  /** Files one issue; returns the created URL. */
  readonly fileIssue?: (opts: {
    title: string;
    body: string;
    labels: readonly string[];
  }) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}

/** Options for an auto-file run. */
export interface AutoFileOptions extends AutoFileDeps {
  /** Max issues to file this run (default 3). */
  readonly maxPerRun?: number;
  /** Label applied to filed issues (default `machine-suggested`). */
  readonly label?: string;
  /** When true, run all safeguards but do NOT file — report what would be filed. */
  readonly dryRun?: boolean;
}

/** Result of an auto-file run. */
export interface AutoFileResult {
  readonly filed: ReadonlyArray<{ id: string; url: string }>;
  readonly skipped: ReadonlyArray<{ id: string; reason: SkipReason }>;
}

/** Default dedup: an open issue whose title matches exactly already exists. */
async function ghTitleExists(title: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    'gh',
    ['issue', 'list', '--state', 'open', '--search', `${title} in:title`, '--json', 'title'],
    { timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs }
  );
  const rows = JSON.parse(stdout) as Array<{ title: string }>;
  return rows.some((r) => r.title === title);
}

/** Default filer — delegates to the existing execFile-based createResearchIssue. */
async function ghFileIssue(opts: {
  title: string;
  body: string;
  labels: readonly string[];
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const result = await createResearchIssue({
    title: opts.title,
    body: opts.body,
    labels: opts.labels,
  });
  return result.ok
    ? { ok: true, url: result.value.url }
    : { ok: false, error: result.error.message };
}

interface ResolvedDeps {
  readonly label: string;
  readonly dryRun: boolean;
  readonly searchExisting: (title: string) => Promise<boolean>;
  readonly fileIssue: NonNullable<AutoFileDeps['fileIssue']>;
}

/** Outcome of attempting one task. `halt` = fail-closed; stop the run. */
type TaskOutcome =
  | { kind: 'filed'; url: string }
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'halt'; reason: SkipReason };

/** Dedup → scrub → (dry-run|file) one task. Never throws. */
async function fileOneTask(task: PipelineTask, deps: ResolvedDeps): Promise<TaskOutcome> {
  const title = scrubSensitiveRefs(task.title);
  const body = scrubSensitiveRefs(task.description);
  try {
    if (await deps.searchExisting(title)) return { kind: 'skip', reason: 'duplicate' };
    if (deps.dryRun) return { kind: 'filed', url: '(dry-run)' };
    const res = await deps.fileIssue({ title, body, labels: [deps.label] });
    if (res.ok) return { kind: 'filed', url: res.url };
    logger.warn('Auto-file failed; failing closed', { id: task.id, error: res.error });
    return { kind: 'halt', reason: 'gh-unavailable' };
  } catch (err) {
    logger.warn('Auto-file error', { id: task.id, error: getErrorMessage(err) });
    return { kind: 'skip', reason: 'error' };
  }
}

/**
 * Opsec: warn once per run when filing real issue text with scrubbing
 * unconfigured. With no {@link SENSITIVE_REFS_ENV} terms the scrubber is a no-op
 * (by design), so surface the silent-leak window before any issue is filed.
 */
function warnIfUnscrubbed(taskCount: number, dryRun: boolean): void {
  if (taskCount === 0 || dryRun) return;
  const refs = process.env[SENSITIVE_REFS_ENV];
  if (refs !== undefined && refs.trim() !== '') return;
  logger.warn(
    `Auto-filing issue text with no ${SENSITIVE_REFS_ENV} configured — issue titles/bodies ` +
      'are NOT scrubbed for org/gov references. Set it to your org terms if filing from a ' +
      'sensitive context.'
  );
}

/** Resolves options to concrete deps (defaults: conservative + real `gh`). */
function resolveDeps(options: AutoFileOptions): ResolvedDeps {
  return {
    label: options.label ?? MACHINE_SUGGESTED_LABEL,
    dryRun: options.dryRun === true,
    searchExisting: options.searchExisting ?? ghTitleExists,
    fileIssue: options.fileIssue ?? ghFileIssue,
  };
}

/**
 * Files candidate tasks as GitHub issues under the safeguards above. Never
 * throws — the GitHub boundary failing fails closed (skips, doesn't crash).
 */
export async function autoFileSuggestions(
  tasks: readonly PipelineTask[],
  options: AutoFileOptions = {}
): Promise<AutoFileResult> {
  const maxPerRun = options.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const deps = resolveDeps(options);
  const filed: Array<{ id: string; url: string }> = [];
  const skipped: Array<{ id: string; reason: SkipReason }> = [];

  warnIfUnscrubbed(tasks.length, deps.dryRun);

  for (const task of tasks) {
    if (filed.length >= maxPerRun) {
      skipped.push({ id: task.id, reason: 'rate-limit' });
      continue;
    }
    const outcome = await fileOneTask(task, deps);
    if (outcome.kind === 'filed') {
      filed.push({ id: task.id, url: outcome.url });
    } else {
      skipped.push({ id: task.id, reason: outcome.reason });
      if (outcome.kind === 'halt') break; // fail closed — stop the rest this run
    }
  }

  if (filed.length > 0) {
    logger.info('Auto-filed suggested tasks', { filed: filed.length, skipped: skipped.length });
  }
  return { filed, skipped };
}
