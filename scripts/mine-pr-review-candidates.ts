#!/usr/bin/env npx tsx
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
 *   npx tsx scripts/mine-pr-review-candidates.ts [--limit N] …
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
  type DedupIndex,
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

/** A page of merged PRs from `gh pr list --json …`. Throws on gh failure. */
function fetchMergedPrs(limit: number): readonly RawListPr[] {
  const out = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'merged',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,url,mergedAt,author,files,reviewDecision',
    ],
    { encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 }
  );
  return JSON.parse(out) as readonly RawListPr[];
}

/** Fetch the real unified diff for one PR. Empty string on any gh failure. */
function fetchPrDiff(number: number): string {
  try {
    return execFileSync('gh', ['pr', 'diff', String(number), '--repo', REPO], {
      encoding: 'utf-8',
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch {
    return '';
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
}

function parseArgs(argv: readonly string[]): Args {
  let limit = 50;
  let diffCap = DEFAULT_DIFF_CHAR_CAP;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--limit') limit = Number(next);
    if (argv[i] === '--diff-cap') diffCap = Number(next);
    if (argv[i] === '--out') out = next;
  }
  return { limit, diffCap, out };
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
  console.log(`Mining up to ${String(args.limit)} merged PRs from ${REPO} …`);
  const { numbers: datasetNumbers, rubricVersion } = loadDatasetNumbers();
  const prior = loadPriorCandidates(args.out);
  const dedup: DedupIndex = {
    datasetNumbers,
    existingCandidateNumbers: new Set(prior.map((c) => c.number)),
  };

  const list = fetchMergedPrs(args.limit);
  // Attach the real diff only to PRs that will actually be assembled — but pass
  // the whole page (with diffs lazily empty for ineligible PRs) for follow-up
  // detection. We fetch diffs only for not-yet-known, non-bot, source-touching
  // PRs to keep the gh round-trips bounded.
  const page: readonly MergedPrWithDiff[] = list.map((raw) => {
    const base = toMergedPr(raw);
    const known =
      dedup.datasetNumbers.has(base.number) || dedup.existingCandidateNumbers.has(base.number);
    const diff = known ? '' : fetchPrDiff(base.number);
    return { ...base, diff };
  });

  const now = new Date();
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
