/**
 * mine-pr-review-candidates.ts — the gh-fetch I/O layer of the pr_review
 * candidate-MINING curation pipeline (#3847).
 *
 * Mines recently-merged PRs from nexus-substrate/nexus-agents via `gh` and emits
 * CANDIDATE pr_review eval cases to testing/datasets/pr-review-candidates.json
 * for the OWNER to adjudicate per the rubric. It runs LOCALLY with the owner's
 * `gh` auth (the owner runs it; CI does not — see the test, which uses fixtures).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO-FABRICATION GUARANTEE (owner-mandated, non-negotiable)
 * ───────────────────────────────────────────────────────────────────────────
 * This pipeline produces CANDIDATES + weak labels ONLY. It does NOT fabricate
 * adjudicated eval data — the whole point of the eval is REAL owner-adjudicated
 * cases. Concretely:
 *   - Every emitted case is `adjudicated: false` with a neutral placeholder
 *     `class: "borderline"`, empty knownBugs, and an UNADJUDICATED rationale.
 *   - The only signal the miner assigns is `weakLabel`
 *     (likely-buggy | likely-clean | unknown) — a TRIAGE HINT to order the
 *     owner's adjudication queue, NOT a verdict.
 *   - The diff is a bounded slice of the REAL `gh pr diff` output; never invented.
 *
 * Idempotent + safe: re-running dedups against BOTH the curated dataset
 * (testing/datasets/pr-review-sample.json) and the already-emitted candidates
 * file, and NEVER overwrites a candidate the owner has marked `adjudicated:true`.
 *
 * All rubric / labeling / assembly logic is pure + unit-tested in
 * mine-pr-review-candidates-core.ts and mine-pr-review-candidates-assemble.ts
 * (mirrors the curate-pr-review-harvest / -labeling split). This file is the
 * thin, untested-by-unit `gh` edge (like build-model-registry.ts).
 *
 * Usage (owner runs locally with gh auth):
 *   npm run eval:mine-candidates -- [--limit N] [--diff-cap CHARS] [--out PATH]
 *     [--search "<gh search query>"] [--min-age-days N]
 *   pnpm exec tsx scripts/mine-pr-review-candidates.ts [--limit N] …
 *
 *   --limit N          Max NEW candidates to mine this run (default 50).
 *   --diff-cap CHARS   Cap on each candidate's diff excerpt (default 6000).
 *   --out PATH         Candidates file to write/merge into.
 *   --search QUERY     Passthrough to `gh pr list --search QUERY`, used
 *                       INSTEAD of `--state merged` (gh rejects combining
 *                       them) — fold `is:merged` into QUERY yourself, e.g.
 *                       `--search "is:merged merged:<2026-06-06"`, to target
 *                       an older window than the default "most recent" page.
 *   --min-age-days N   Keep only PRs merged >= N days ago (default 0 = off).
 *                       Enlarges the raw `gh pr list --limit` and re-fetches
 *                       (capped) until N qualifying PRs are collected or the
 *                       PR history is exhausted. Needed because the weak-label
 *                       heuristic's `likely-clean` signal requires PRs to have
 *                       cleared the 42-day (CLEAN_TENURE_DAYS) no-fix window —
 *                       the default most-recent window alone can only ever
 *                       emit `unknown` on an active repo.
 *
 * @module scripts/mine-pr-review-candidates
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

/* eslint-disable no-console -- CLI script that prints progress */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_DIFF_CHAR_CAP,
  MAX_FETCH_LIMIT,
  assembleDiffFromFiles,
  buildPrListArgs,
  filterByMinAge,
  growFetchLimit,
  type DedupIndex,
  type FileDiffEntry,
  type MergedPr,
  type MergedPrWithDiff,
} from './mine-pr-review-candidates-core.js';
import {
  buildCandidatesFile,
  mergeCandidates,
  mineCandidates,
  type CandidateCase,
  type CandidatesFile,
} from './mine-pr-review-candidates-assemble.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const REPO = 'nexus-substrate/nexus-agents';
const DATASET_PATH = path.join(REPO_ROOT, 'testing/datasets/pr-review-sample.json');
const RUBRIC_PATH = path.join(REPO_ROOT, 'docs/research/pr-review-eval-labeling-rubric.md');
const DEFAULT_OUT = path.join(REPO_ROOT, 'testing/datasets/pr-review-candidates.json');

// ============================================================================
// gh fetch (the only I/O)
// ============================================================================

interface RawListPr {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly mergedAt: string;
  readonly author: { readonly login: string } | null;
  readonly files: ReadonlyArray<{ readonly path: string }>;
  readonly reviewDecision?: string;
}

/** One raw page of `gh pr list --json …`. Throws on gh failure. */
function fetchMergedPrsPage(limit: number, search: string | null): readonly RawListPr[] {
  const out = execFileSync('gh', [...buildPrListArgs({ repo: REPO, limit, search })], {
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(out) as readonly RawListPr[];
}

/**
 * Fetch up to `targetLimit` merged PRs satisfying `--min-age-days` (0 = no
 * filter, the pre-#4316 behavior: just the most-recent `targetLimit` page).
 * When `minAgeDays > 0`, the raw `gh pr list --limit` is enlarged (via
 * `growFetchLimit`) and re-fetched until enough age-qualifying PRs are
 * collected, `gh` itself runs out of history (returns fewer rows than asked),
 * or `MAX_FETCH_LIMIT` is hit — whichever comes first.
 */
function fetchMergedPrs(
  targetLimit: number,
  minAgeDays: number,
  search: string | null,
  now: Date
): readonly RawListPr[] {
  let rawLimit = minAgeDays > 0 ? Math.min(targetLimit * 2, MAX_FETCH_LIMIT) : targetLimit;
  for (;;) {
    const raw = fetchMergedPrsPage(rawLimit, search);
    const qualifying = filterByMinAge(raw, minAgeDays, now);
    const exhausted = raw.length < rawLimit || rawLimit >= MAX_FETCH_LIMIT;
    if (qualifying.length >= targetLimit || exhausted) {
      return qualifying.slice(0, targetLimit);
    }
    rawLimit = growFetchLimit(rawLimit, targetLimit);
  }
}

/** One page of `gh api repos/<owner>/<repo>/pulls/<n>/files` (manually paginated). */
function fetchPrFilesViaApi(number: number): readonly FileDiffEntry[] {
  const files: FileDiffEntry[] = [];
  const perPage = 100;
  // Hard cap of 10 pages (1000 files) — generous above the 300-file 406
  // threshold this fallback exists for, while bounding worst-case gh calls.
  for (let page = 1; page <= 10; page += 1) {
    const out = execFileSync(
      'gh',
      [
        'api',
        `repos/${REPO}/pulls/${String(number)}/files?per_page=${String(perPage)}&page=${String(page)}`,
      ],
      { encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 }
    );
    const pageFiles = JSON.parse(out) as readonly FileDiffEntry[];
    files.push(...pageFiles);
    if (pageFiles.length < perPage) break;
  }
  return files;
}

/** True when a `gh pr diff` failure message indicates the "diff too large" HTTP 406. */
function isDiffTooLarge(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('406') || m.includes('too_large') || m.includes('too large');
}

interface DiffFetchResult {
  readonly diff: string;
  /** Non-null when no usable diff was obtained — the PR must not be silently dropped. */
  readonly skipReason: string | null;
}

/**
 * Fetch the real unified diff for one PR. On a plain `gh pr diff` failure,
 * falls back to the files API (see `fetchPrFilesViaApi` + `assembleDiffFromFiles`)
 * ONLY for the HTTP 406 "diff too large" (>300 files) case — that's the one
 * documented gh limitation this fallback exists for. Any other failure, or a
 * 406 whose fallback yields no usable patch content, returns an empty diff
 * with a clear `skipReason` so the caller can record the PR as skipped rather
 * than silently dropping it.
 */
function fetchPrDiff(number: number, diffCap: number): DiffFetchResult {
  try {
    const diff = execFileSync('gh', ['pr', 'diff', String(number), '--repo', REPO], {
      encoding: 'utf-8',
      maxBuffer: 128 * 1024 * 1024,
    });
    return { diff, skipReason: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isDiffTooLarge(message)) {
      return {
        diff: '',
        skipReason: `PR #${String(number)}: gh pr diff failed (${message.split('\n')[0] ?? message})`,
      };
    }
    try {
      const files = fetchPrFilesViaApi(number);
      const assembled = assembleDiffFromFiles(files, diffCap);
      if (assembled.length > 0) return { diff: assembled, skipReason: null };
      return {
        diff: '',
        skipReason: `PR #${String(number)}: gh pr diff returned HTTP 406 (too large, >300 files) and the files-API fallback yielded no usable patch content`,
      };
    } catch (fallbackErr) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      return {
        diff: '',
        skipReason: `PR #${String(number)}: gh pr diff returned HTTP 406 (too large) and the files-API fallback failed (${fallbackMessage.split('\n')[0] ?? fallbackMessage})`,
      };
    }
  }
}

function toMergedPr(raw: RawListPr): MergedPr {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    url: raw.url,
    author: raw.author?.login ?? '',
    mergedAt: raw.mergedAt,
    files: raw.files.map((f) => f.path),
    reviewDecision: raw.reviewDecision ?? null,
  };
}

// ============================================================================
// Dedup index + prior candidates (read-only file I/O)
// ============================================================================

interface DatasetShape {
  readonly rubricVersion: string;
  readonly prs: ReadonlyArray<{ readonly number: string | number }>;
}

function loadDatasetNumbers(): { readonly numbers: Set<number>; readonly rubricVersion: string } {
  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8')) as DatasetShape;
  const numbers = new Set<number>();
  for (const pr of raw.prs) {
    if (typeof pr.number === 'number') numbers.add(pr.number);
  }
  return { numbers, rubricVersion: raw.rubricVersion };
}

function loadPriorCandidates(outPath: string): readonly CandidateCase[] {
  if (!fs.existsSync(outPath)) return [];
  const raw = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Partial<CandidatesFile>;
  return raw.candidates ?? [];
}

// ============================================================================
// CLI
// ============================================================================

interface Args {
  readonly limit: number;
  readonly diffCap: number;
  readonly out: string;
  /** `gh pr list --search` passthrough; `null` uses the default `--state merged`. */
  readonly search: string | null;
  /** Keep only PRs merged at least this many days ago (0 = off, default). */
  readonly minAgeDays: number;
}

function parseArgs(argv: readonly string[]): Args {
  let limit = 50;
  let diffCap = DEFAULT_DIFF_CHAR_CAP;
  let out = DEFAULT_OUT;
  let search: string | null = null;
  let minAgeDays = 0;
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--limit') limit = Number(next);
    if (argv[i] === '--diff-cap') diffCap = Number(next);
    if (argv[i] === '--out') out = next;
    if (argv[i] === '--search') search = next;
    if (argv[i] === '--min-age-days') minAgeDays = Number(next);
  }
  return { limit, diffCap, out, search, minAgeDays };
}

function summarize(candidates: readonly CandidateCase[]): string {
  const tally = { 'likely-buggy': 0, 'likely-clean': 0, unknown: 0 };
  for (const c of candidates) tally[c.weakLabel] += 1;
  return (
    `likely-buggy=${String(tally['likely-buggy'])} ` +
    `likely-clean=${String(tally['likely-clean'])} ` +
    `unknown=${String(tally.unknown)}`
  );
}

function run(args: Args): void {
  const now = new Date();
  console.log(
    `Mining up to ${String(args.limit)} merged PRs from ${REPO} ` +
      `(minAgeDays=${String(args.minAgeDays)}${args.search !== null ? `, search="${args.search}"` : ''}) …`
  );
  const { numbers: datasetNumbers, rubricVersion } = loadDatasetNumbers();
  const prior = loadPriorCandidates(args.out);
  const dedup: DedupIndex = {
    datasetNumbers,
    existingCandidateNumbers: new Set(prior.map((c) => c.number)),
  };

  const list = fetchMergedPrs(args.limit, args.minAgeDays, args.search, now);
  // Attach the real diff only to PRs that will actually be assembled — but pass
  // the whole page (with diffs lazily empty for ineligible PRs) for follow-up
  // detection. We fetch diffs only for not-yet-known, non-bot, source-touching
  // PRs to keep the gh round-trips bounded. A skip (no usable diff, even after
  // the 406 files-API fallback) is recorded and reported — never silently
  // dropped.
  const skips: string[] = [];
  const page: readonly MergedPrWithDiff[] = list.map((raw) => {
    const base = toMergedPr(raw);
    const known =
      dedup.datasetNumbers.has(base.number) || dedup.existingCandidateNumbers.has(base.number);
    if (known) return { ...base, diff: '' };
    const { diff, skipReason } = fetchPrDiff(base.number, args.diffCap);
    if (skipReason !== null) skips.push(skipReason);
    return { ...base, diff };
  });

  const mined = mineCandidates(page, dedup, {
    rubricVersion,
    now,
    diffCharCap: args.diffCap,
  });
  const all = mergeCandidates(prior, mined);

  console.log(
    `Mined ${String(mined.length)} NEW candidates ` +
      `(${String(prior.length)} prior preserved, total ${String(all.length)}); ${summarize(mined)}`
  );
  if (skips.length > 0) {
    console.log(`Skipped ${String(skips.length)} PR(s) with no usable diff:`);
    for (const reason of skips) console.log(`  - ${reason}`);
  }
  const file = buildCandidatesFile(all, rubricVersion, now);
  fs.writeFileSync(args.out, `${JSON.stringify(file, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${args.out}`);
  console.log(
    `Next: the OWNER adjudicates each candidate into buggy/clean/borderline per ` +
      `${path.relative(REPO_ROOT, RUBRIC_PATH)}, then promotes adjudicated cases into ` +
      `testing/datasets/pr-review-sample.json. The weakLabel is a triage hint, not a verdict.`
  );
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  run(parseArgs(process.argv.slice(2)));
}

export { parseArgs, toMergedPr, summarize };
