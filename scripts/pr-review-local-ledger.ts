/**
 * pr-review-local ledger feeder (#4229, epic #4226 child B).
 *
 * Turns a completed local `pr_review` panel run into an authentic, diff-bound
 * governance record so the warn-first governor-review gate (#3831) can MATCH the
 * PR it is checking. Split out of `scripts/pr-review-local.ts` to keep the watcher
 * lean and the feeder independently unit-testable.
 *
 * THE LOAD-BEARING INVARIANT: the record's `reviewedDiffHash` must equal what the
 * gate recomputes for the same `base..head`. Guaranteed by hashing the SAME
 * canonical, ledger-excluded diff — {@link generateCanonicalReviewDiff} runs the
 * pinned {@link canonicalGitDiffArgs} (now `-- :(exclude)governance/pr-review-records.jsonl`)
 * and {@link persistReviewRecord} hashes it with the shared
 * `computeReviewedDiffHash`, byte-identical to `scripts/check-governor-review.ts`.
 * Excluding the ledger is what makes committing the record to the PR head hash-safe.
 *
 * @module scripts/pr-review-local-ledger
 */

/* eslint-disable no-console -- CLI-adjacent helper that prints progress */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { canonicalGitDiffArgs } from '../packages/nexus-agents/src/audit/reviewed-diff-hash.js';
import { PR_REVIEW_RECORDS_REL_PATH } from '../packages/nexus-agents/src/audit/pr-review-record-store.js';
import {
  persistReviewRecord,
  type PrReviewCounts,
  type PrReviewRecordOutcome,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-record-producer.js';
import {
  MAX_DIFF_LENGTH,
  type PrReviewAggregate,
  type PrReviewInput,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import { createLogger, type ILogger } from '../packages/nexus-agents/src/core/index.js';
import { ROOT } from './script-paths.js';

const execFileP = promisify(execFile);

const REPO_OWNER = 'nexus-substrate';
const REPO_NAME = 'nexus-agents';

/**
 * Minimal injectable exec seam for the `gh`/`git` subprocess calls so the feeder is
 * unit-testable without touching the network or a real PR. Matches the shape of
 * `promisify(execFile)`; production passes the real one.
 */
export interface GhGitExec {
  (
    command: string,
    args: readonly string[],
    options?: { readonly maxBuffer?: number; readonly cwd?: string }
  ): Promise<{ stdout: string; stderr: string }>;
}

/** PR metadata needed for both the review and the Option-C audit binding (#4229). */
export interface PrMeta {
  readonly title: string;
  readonly body: string;
  readonly baseRef: string;
  readonly headRef: string;
  /** 40-hex base commit SHA — the range base the gate recomputes the diff hash over. */
  readonly baseSha: string;
  /** 40-hex head commit SHA — the range head. */
  readonly headSha: string;
}

/**
 * Fetch PR metadata INCLUDING the base+head commit SHAs (#4229). The SHAs
 * (`.base.sha`/`.head.sha`) — not just the ref names — are what the governor gate
 * recomputes the reviewed-diff hash over, so a persisted record can only match if
 * it is bound to these exact commits.
 */
export async function fetchPrMeta(prNumber: number, exec: GhGitExec = execFileP): Promise<PrMeta> {
  const { stdout } = await exec('gh', [
    'api',
    `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`,
    '--jq',
    '{title, body, headRef: .head.ref, baseRef: .base.ref, baseSha: .base.sha, headSha: .head.sha}',
  ]);
  const m = JSON.parse(stdout) as {
    title?: string;
    body?: string;
    headRef?: string;
    baseRef?: string;
    baseSha?: string;
    headSha?: string;
  };
  return {
    title: m.title ?? '',
    body: m.body ?? '',
    headRef: m.headRef ?? '',
    baseRef: m.baseRef ?? '',
    baseSha: m.baseSha ?? '',
    headSha: m.headSha ?? '',
  };
}

/**
 * Fetch the PR diff via the GitHub API (`v3.diff`). FALLBACK path only: used to
 * review a PR whose base/head commits are not fetchable locally (so the canonical
 * git diff cannot be produced). A review from THIS diff is NOT hash-parity with the
 * gate, so it does NOT feed the ledger — the record is written only from the
 * canonical diff (see {@link generateCanonicalReviewDiff}).
 */
export async function fetchGhDiff(
  prNumber: number,
  exec: GhGitExec = execFileP
): Promise<{ diff: string; truncated: boolean }> {
  const { stdout: diffOut } = await exec(
    'gh',
    [
      'api',
      `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`,
      '-H',
      'Accept: application/vnd.github.v3.diff',
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  const truncated = diffOut.length > MAX_DIFF_LENGTH;
  const diff = truncated ? `${diffOut.slice(0, MAX_DIFF_LENGTH)}\n[...truncated]` : diffOut;
  return { diff, truncated };
}

/**
 * Best-effort: make the PR's base+head commits available locally so the canonical
 * `git diff base..head` can run. Fork PRs never push to `origin`, so we fetch the
 * PR head ref (`pull/N/head`) and the base sha. NEVER throws — a fetch failure just
 * means {@link generateCanonicalReviewDiff} will fail and record persistence is
 * skipped (the review still runs off the gh-diff fallback).
 */
export async function ensurePrCommitsLocal(
  prNumber: number,
  baseSha: string,
  exec: GhGitExec = execFileP,
  cwd: string = ROOT
): Promise<void> {
  try {
    await exec('git', ['fetch', '--quiet', 'origin', baseSha, `pull/${String(prNumber)}/head`], {
      cwd,
    });
  } catch {
    // ignore — canonical diff generation surfaces unavailability
  }
}

/**
 * Produce the CANONICAL reviewed diff for `base..head` (#4229) — the SAME pinned
 * {@link canonicalGitDiffArgs} invocation the governor gate recomputes with, now
 * with the pr-review ledger excluded. Hashing THIS output yields a value
 * byte-identical to the gate's recompute (the load-bearing invariant), so the
 * persisted record can match.
 */
export async function generateCanonicalReviewDiff(
  baseSha: string,
  headSha: string,
  exec: GhGitExec = execFileP,
  cwd: string = ROOT
): Promise<string> {
  const { stdout } = await exec('git', canonicalGitDiffArgs(baseSha, headSha), {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** Inputs for {@link feedLedgerFromReview}. */
export interface FeedLedgerParams {
  readonly prNumber: number;
  readonly baseSha: string;
  readonly headSha: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly aggregate: PrReviewAggregate;
  readonly counts: PrReviewCounts;
  readonly reviewCount: number;
  /**
   * The EXACT canonical diff the voters reviewed (from {@link generateCanonicalReviewDiff}).
   * When provided it is hashed verbatim — avoiding a re-diff race where a push
   * between the review and the record binds the record to bytes the voters never
   * saw. Omitted ⇒ the diff is (re)generated from `base..head`.
   */
  readonly canonicalDiff?: string | undefined;
  readonly exec?: GhGitExec | undefined;
  readonly cwd?: string | undefined;
  readonly logger?: ILogger | undefined;
}

/** Resolve the canonical diff bytes to hash: the passed-in one, or (re)generate. */
async function resolveCanonicalDiff(
  params: FeedLedgerParams,
  exec: GhGitExec,
  cwd: string
): Promise<{ diff: string } | { skip: PrReviewRecordOutcome }> {
  if (params.canonicalDiff !== undefined) return { diff: params.canonicalDiff };
  await ensurePrCommitsLocal(params.prNumber, params.baseSha, exec, cwd);
  try {
    return { diff: await generateCanonicalReviewDiff(params.baseSha, params.headSha, exec, cwd) };
  } catch (e) {
    return {
      skip: {
        persisted: false,
        reason: 'write-failed',
        detail:
          `No record written: could not produce the canonical git diff for ` +
          `${params.baseSha.slice(0, 12)}..${params.headSha.slice(0, 12)} ` +
          `(are both commits fetched?): ${(e as Error).message.slice(0, 160)}`,
      },
    };
  }
}

/**
 * Feed the governance ledger from a completed local review (#4229). Produces the
 * canonical, ledger-excluded diff for `base..head` and calls the shared
 * {@link persistReviewRecord} producer so the run's authentic verdict lands as a
 * diff-bound record the governor gate can MATCH.
 *
 * The producer's simulate/no-live-votes guards are NOT bypassed (this always passes
 * `simulate: false` and the real vote counts). Never throws — returns a structured
 * {@link PrReviewRecordOutcome} (a `write-failed` skip when the canonical diff is
 * unavailable, e.g. the base/head commits are not fetchable).
 */
export async function feedLedgerFromReview(
  params: FeedLedgerParams
): Promise<PrReviewRecordOutcome> {
  const logger = params.logger ?? createLogger({ component: 'pr-review-local' });
  const exec = params.exec ?? execFileP;
  const cwd = params.cwd ?? ROOT;
  if (params.baseSha === '' || params.headSha === '') {
    return {
      persisted: false,
      reason: 'binding-inputs-absent',
      detail: 'No record written: PR base/head SHA was not resolved (gh api .base.sha/.head.sha).',
    };
  }
  const resolved = await resolveCanonicalDiff(params, exec, cwd);
  if ('skip' in resolved) return resolved.skip;

  const input: PrReviewInput = {
    prTitle: params.title,
    prDiff: resolved.diff,
    prNumber: params.prNumber,
    baseSha: params.baseSha,
    simulate: false,
    errorPolicy: 'standard',
    dispatch: 'sync',
    ...(params.description !== undefined && params.description !== ''
      ? { prDescription: params.description }
      : {}),
  };
  return persistReviewRecord({
    input,
    aggregate: params.aggregate,
    counts: params.counts,
    reviewCount: params.reviewCount,
    logger,
  });
}

/** A completed local review, reduced to the fields the ledger record needs. */
export interface LocalReviewSummary {
  readonly prNumber: number;
  readonly baseSha: string;
  readonly headSha: string;
  readonly title: string;
  readonly description: string;
  readonly aggregate: PrReviewAggregate;
  readonly counts: PrReviewCounts;
  readonly reviewCount: number;
  /** Canonical (ledger-excluded) diff the voters reviewed; undefined ⇒ no record. */
  readonly canonicalDiff: string | undefined;
}

/**
 * Feed the ledger from a completed live review and PRINT the outcome (#4229). Wraps
 * {@link feedLedgerFromReview} for the CLI: best-effort — the caller's comment/label
 * already landed, so a persistence skip only logs. Matches the script's
 * non-committing side-effect model: it writes the record to the ledger and logs the
 * actionable next step (commit it onto the PR head — hash-safe now the ledger is
 * excluded from the reviewed diff) rather than pushing to an arbitrary head branch.
 */
export async function feedLedgerRecord(summary: LocalReviewSummary): Promise<void> {
  if (summary.canonicalDiff === undefined) {
    console.log(
      `  ledger: canonical diff unavailable (base/head not fetched) — no governance record written.`
    );
    return;
  }
  const outcome = await feedLedgerFromReview({
    prNumber: summary.prNumber,
    baseSha: summary.baseSha,
    headSha: summary.headSha,
    title: summary.title,
    description: summary.description,
    aggregate: summary.aggregate,
    canonicalDiff: summary.canonicalDiff,
    counts: summary.counts,
    reviewCount: summary.reviewCount,
  });
  if (outcome.persisted) {
    console.log(
      `  ledger: wrote pr-review record seq=${String(outcome.sequence)} ` +
        `(reviewedDiffHash=${outcome.reviewedDiffHash.slice(0, 12)}…) to ${PR_REVIEW_RECORDS_REL_PATH}.`
    );
    console.log(
      `  ledger: commit this record onto PR #${String(summary.prNumber)}'s head branch to satisfy the ` +
        `governor-review gate — the ledger is excluded from the reviewed diff, so committing it is hash-safe (#4229).`
    );
    // #4235: print an explicit `git commit -o` (--only) recipe. Committing ONLY the
    // ledger path — regardless of what else is staged — closes the residual window
    // where the uncommitted record could be swept into an unrelated commit by a later
    // `git add -A` on the wrong branch. The record is authentic + integrity-chained
    // either way, but this keeps the ledger clean.
    console.log(
      `  ledger: to commit only this record (avoids a stray \`git add -A\` sweeping it):\n` +
        `           git commit -o ${PR_REVIEW_RECORDS_REL_PATH} -m ` +
        `"chore(audit): pr-review record for #${String(summary.prNumber)} (seq ${String(outcome.sequence)})"`
    );
  } else {
    console.log(`  ledger: no record written (${outcome.reason}): ${outcome.detail}`);
  }
}
