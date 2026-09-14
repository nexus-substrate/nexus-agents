/**
 * nexus-agents/mcp - Improvement Review: GitHub issue filing
 *
 * The filing step of `improvement_review` (#2402): gated on `fileIssues`,
 * rate-limited, deduped against open issues, command-injection-safe. This is
 * the ONLY module of the improvement-review family that shells out to `gh` —
 * `improvement-review.ts` keeps signal detection and never spawns a process.
 *
 * Moved verbatim out of `improvement-review.ts` (#6148, row 2). Only what that
 * file consumes is exported: the `gh` seam, the two response types and the
 * `maybeFileIssues` entry point; everything else is reached through it.
 *
 * @module mcp/tools/improvement-review-issue-filing
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getErrorMessage, type ILogger } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { classifySignalPriority, priorityLabel } from './remediation-priority.js';

const execFileAsync = promisify(execFile);

const MAX_ISSUES_PER_RUN = 5;

/**
 * Runs `gh` with the given argv — no shell, so title/body/label content cannot
 * inject. Injected so tests drive every `gh` call (label list, dedup search,
 * create, target lookup) through one seam (#6112).
 */
export type GhExec = (args: readonly string[]) => Promise<{ readonly stdout: string }>;

export const defaultGhExec: GhExec = async (args) => execFileAsync('gh', [...args]);

/** Where the filed issues went, and how that target was chosen (#6112). */
export interface IssueTarget {
  /** `owner/repo`, or null when neither the caller nor the cwd remote named one. */
  readonly repo: string | null;
  /**
   * `input` — the caller passed `targetRepo`; `cwd-remote` — resolved via
   * `gh repo view` from the working directory; `unresolved` — the lookup
   * failed, so `gh` was left to its own cwd resolution (no `--repo` flag);
   * `not-filing` — `fileIssues` was false, nothing was resolved.
   */
  readonly source: 'input' | 'cwd-remote' | 'unresolved' | 'not-filing';
}

/** One filed issue plus what happened to its requested labels (#6112). */
export interface FiledIssue {
  readonly signalKey: string;
  readonly issueUrl: string;
  /** Requested labels the target repo does not have; explicit `[]` when none. */
  readonly labelsDropped: readonly string[];
  /**
   * `ok` — `gh label list` answered and the filter above is real;
   * `unavailable` — the list failed, so the issue was filed with NO labels and
   * every requested label is in `labelsDropped`;
   * `truncated` — the list filled its page ({@link LABEL_LIST_LIMIT}), so a
   * label past it cannot be told from a missing one: no filtering was done,
   * every requested label was passed and `labelsDropped` is `[]`.
   * The lookup never blocks the signal.
   */
  readonly labelCheck: 'ok' | 'unavailable' | 'truncated';
}

/**
 * Page size for `gh label list`. A repo with at least this many labels fills
 * the page, and the check reports `truncated` rather than treating every label
 * past the page as nonexistent (a 200-label page silently stripped them).
 */
const LABEL_LIST_LIMIT = 1000;

/** What `gh label list` told us about the target repo's labels. */
type RepoLabels =
  | { readonly status: 'ok'; readonly names: ReadonlySet<string> }
  | { readonly status: 'unavailable' }
  | { readonly status: 'truncated' };

interface IssueFilingDeps {
  readonly logger: ILogger;
  readonly ghExec: GhExec;
  /** `owner/repo` named by the caller. Absent → resolved from the cwd remote. */
  readonly targetRepo?: string;
}

const NOT_FILING: IssueTarget = { repo: null, source: 'not-filing' };

/** The filing step of a review run: a no-op with an explicit `not-filing` target when off. */
export async function maybeFileIssues(
  signals: readonly ImprovementSignal[],
  opts: Omit<IssueFilingDeps, 'targetRepo'> & {
    readonly fileIssues: boolean;
    readonly targetRepo: string | undefined;
  }
): Promise<Awaited<ReturnType<typeof fileSignalsAsIssues>>> {
  if (!opts.fileIssues) return { issuesFiled: [], issuesSkipped: [], issueTarget: NOT_FILING };
  return fileSignalsAsIssues(signals, {
    logger: opts.logger,
    ghExec: opts.ghExec,
    ...(opts.targetRepo === undefined ? {} : { targetRepo: opts.targetRepo }),
  });
}

/** `--repo <target>` when a target is known, else nothing (gh resolves from cwd). */
function repoArgs(target: IssueTarget): readonly string[] {
  return target.repo === null ? [] : ['--repo', target.repo];
}

/**
 * Resolve the repository the issues will be filed against. The caller's
 * `targetRepo` wins; otherwise `gh repo view` names the cwd remote. A failed
 * lookup is reported as `unresolved` rather than guessed — `gh` then falls
 * back to its own cwd resolution, exactly as it did before #6112.
 */
async function resolveIssueTarget(deps: IssueFilingDeps): Promise<IssueTarget> {
  if (deps.targetRepo !== undefined) return { repo: deps.targetRepo, source: 'input' };
  try {
    const { stdout } = await deps.ghExec(['repo', 'view', '--json', 'nameWithOwner']);
    const parsed = JSON.parse(stdout) as { nameWithOwner?: unknown };
    if (typeof parsed.nameWithOwner === 'string' && parsed.nameWithOwner.length > 0) {
      return { repo: parsed.nameWithOwner, source: 'cwd-remote' };
    }
    return { repo: null, source: 'unresolved' };
  } catch (caught) {
    deps.logger.warn('improvement_review: target repo lookup failed; gh will resolve from cwd', {
      error: getErrorMessage(caught),
    });
    return { repo: null, source: 'unresolved' };
  }
}

/**
 * The label names the target repo has, fetched once per run via
 * `gh label list --json name`. `unavailable` means the lookup failed — callers
 * file with no labels and say so instead of letting a missing label turn the
 * signal into an `issuesSkipped` error (#6112). `truncated` means the page
 * filled, so the list cannot prove any label absent — callers skip filtering.
 */
async function fetchRepoLabels(deps: IssueFilingDeps, target: IssueTarget): Promise<RepoLabels> {
  try {
    const { stdout } = await deps.ghExec([
      'label',
      'list',
      '--json',
      'name',
      '--limit',
      String(LABEL_LIST_LIMIT),
      ...repoArgs(target),
    ]);
    const parsed = JSON.parse(stdout) as readonly { name?: unknown }[];
    if (parsed.length >= LABEL_LIST_LIMIT) {
      deps.logger.warn('improvement_review: gh label list filled its page; filing unfiltered', {
        returned: parsed.length,
        limit: LABEL_LIST_LIMIT,
      });
      return { status: 'truncated' };
    }
    return {
      status: 'ok',
      names: new Set(parsed.flatMap((l) => (typeof l.name === 'string' ? [l.name] : []))),
    };
  } catch (caught) {
    deps.logger.warn('improvement_review: gh label list failed; filing without labels', {
      error: getErrorMessage(caught),
    });
    return { status: 'unavailable' };
  }
}

/**
 * Check whether an existing OPEN issue already covers this signal key.
 * Uses `gh issue list --search` with the signal key as a literal phrase.
 * The signal key appears in our filed-issue body so this dedup is reliable.
 */
async function existingIssueForSignal(
  signalKey: string,
  ghExec: GhExec,
  target: IssueTarget
): Promise<string | null> {
  try {
    // Strip double-quotes from the search term so a quote in the signalKey
    // (e.g. an oddly-named self-eval component path, #3224) can't break the
    // `"..." in:body` phrase query and silently defeat dedup → refiling.
    const searchTerm = signalKey.replace(/"/g, '');
    const { stdout } = await ghExec([
      'issue',
      'list',
      '--state',
      'open',
      '--search',
      `"${searchTerm}" in:body`,
      '--json',
      'number,url',
      '--limit',
      '5',
      ...repoArgs(target),
    ]);
    const parsed = JSON.parse(stdout) as readonly { url?: string }[];
    if (parsed.length > 0 && typeof parsed[0]?.url === 'string') {
      return parsed[0].url;
    }
    return null;
  } catch {
    // gh failure → conservatively treat as "no dup" but log upstream.
    return null;
  }
}

/**
 * Labels for an auto-filed signal issue (#3653): the p0–p4 priority (computed by
 * {@link classifySignalPriority} from TYPED signal fields — security is always p0,
 * fail-closed; never taken from untrusted input, so an issue cannot steer its own
 * tag) plus the signal category. The priority drives the consensus rigor the
 * auto-remediation path later requires for this issue.
 */
function issueLabelsForSignal(signal: ImprovementSignal): readonly string[] {
  return [priorityLabel(classifySignalPriority(signal)), signal.category];
}

/**
 * Split the requested labels into the ones to pass and the ones to drop. Only
 * an `ok` list filters; `unavailable` passes none and `truncated` passes all.
 */
function partitionLabels(
  requested: readonly string[],
  labels: RepoLabels
): Pick<FiledIssue, 'labelsDropped' | 'labelCheck'> & { readonly kept: readonly string[] } {
  switch (labels.status) {
    case 'unavailable':
      return { kept: [], labelsDropped: [...requested], labelCheck: 'unavailable' };
    case 'truncated':
      return { kept: [...requested], labelsDropped: [], labelCheck: 'truncated' };
    case 'ok':
      return {
        kept: requested.filter((l) => labels.names.has(l)),
        labelsDropped: requested.filter((l) => !labels.names.has(l)),
        labelCheck: 'ok',
      };
  }
}

/**
 * File an issue via `gh issue create` using execFile (no shell, no
 * command-injection risk on errorMessage / title / body content). Only the
 * labels in `kept` are passed; an empty `kept` files with no `--label` at all.
 */
async function fileIssueForSignal(
  signal: ImprovementSignal,
  kept: readonly string[],
  ghExec: GhExec,
  target: IssueTarget
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Embed the signal key in the body so dedup is reliable on subsequent runs.
  const body = `${signal.body}\n\n---\n\n_Signal key (do not edit): \`${signal.signalKey}\` · Generated by \`improvement_review\` (#2402) · Severity: ${signal.severity}_`;

  try {
    const { stdout } = await ghExec([
      'issue',
      'create',
      '--title',
      signal.title,
      '--body',
      body,
      ...(kept.length > 0 ? ['--label', kept.join(',')] : []),
      ...repoArgs(target),
    ]);
    const url = stdout.trim();
    if (!url.startsWith('https://')) {
      return { ok: false, error: `gh returned unexpected output: ${stdout.slice(0, 200)}` };
    }
    return { ok: true, url };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { ok: false, error: message };
  }
}

/**
 * File one issue per signal (rate-limited, deduped) against the resolved
 * target, with only the labels that repo has (#6112). The label list is
 * fetched lazily and at most once per run — a run whose signals are all dups
 * never asks for it.
 */
async function fileSignalsAsIssues(
  signals: readonly ImprovementSignal[],
  deps: IssueFilingDeps
): Promise<{
  issuesFiled: FiledIssue[];
  issuesSkipped: { signalKey: string; reason: string }[];
  issueTarget: IssueTarget;
}> {
  const issuesFiled: FiledIssue[] = [];
  const issuesSkipped: { signalKey: string; reason: string }[] = [];
  const target = await resolveIssueTarget(deps);
  let labelsOnce: Promise<RepoLabels> | undefined;
  const repoLabels = (): Promise<RepoLabels> => (labelsOnce ??= fetchRepoLabels(deps, target));

  for (const signal of signals) {
    if (issuesFiled.length >= MAX_ISSUES_PER_RUN) {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: 'rate-limit' });
      continue;
    }
    const existing = await existingIssueForSignal(signal.signalKey, deps.ghExec, target);
    if (existing !== null) {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: `dup:${existing}` });
      continue;
    }
    const { kept, labelsDropped, labelCheck } = partitionLabels(
      issueLabelsForSignal(signal),
      await repoLabels()
    );
    const result = await fileIssueForSignal(signal, kept, deps.ghExec, target);
    if (result.ok) {
      issuesFiled.push({
        signalKey: signal.signalKey,
        issueUrl: result.url,
        labelsDropped,
        labelCheck,
      });
      deps.logger.info('improvement signal filed', {
        signalKey: signal.signalKey,
        url: result.url,
        labelsDropped,
        labelCheck,
      });
    } else {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: `error:${result.error}` });
    }
  }

  return { issuesFiled, issuesSkipped, issueTarget: target };
}
