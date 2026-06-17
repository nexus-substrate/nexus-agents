#!/usr/bin/env npx tsx
/**
 * curate-pr-review-harvest.ts — the gh-fetch I/O layer of the pr_review
 * eval-set curation pipeline (#3847).
 *
 * Harvests merged PRs from the org (default nexus-substrate/nexus-agents) via
 * `gh`, extracts the OBJECTIVE signals (changed source files, review decision,
 * and whether a LATER fix/revert PR touched the same source files), then hands
 * each PR's signals to the PURE labeling logic (curate-pr-review-labeling.ts)
 * for a rubric-derived proposal. The proposals are written to a candidates file
 * WITH FULL PROVENANCE (source PR URL, the signals used, the proposed label, a
 * confidence + justification) for human adjudication.
 *
 * This file is deliberately thin and untested-by-unit (it is pure I/O over the
 * `gh` CLI, like build-model-registry.ts); all rubric decisions live in the
 * tested labeling module. It does NOT overwrite the validated dataset
 * (testing/datasets/pr-review-sample.json) — it writes a SEPARATE candidates
 * file. It never fabricates: a PR with no objective fix signal is proposed
 * `clean`, an ambiguous fix signal is proposed `borderline` + needsAdjudication.
 *
 * Usage:
 *   npx tsx scripts/curate-pr-review-harvest.ts harvest [--limit N] [--out PATH]
 *
 * @module scripts/curate-pr-review-harvest
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

/* eslint-disable no-console -- CLI script that prints progress */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  proposeLabel,
  provenanceSourceFor,
  type FollowUpFix,
  type PrSignals,
  type ProposedLabel,
} from './curate-pr-review-labeling.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'testing/datasets/pr-review-candidates-pilot.json');
const REPO = 'nexus-substrate/nexus-agents';

// ============================================================================
// gh fetch (the only I/O)
// ============================================================================

interface RawPr {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly files: ReadonlyArray<{ readonly path: string }>;
  readonly reviewDecision?: string;
}

/** A merged-PR page from `gh pr list --json …`. Throws on gh failure. */
function fetchMergedPrs(limit: number): readonly RawPr[] {
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
      'number,title,body,url,files,reviewDecision',
    ],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out) as readonly RawPr[];
}

// ============================================================================
// Signal extraction (objective — no labels)
// ============================================================================

const isSourceFile = (p: string): boolean =>
  p.startsWith('packages/nexus-agents/src/') && !p.endsWith('.test.ts');

function sourceFilesOf(pr: RawPr): readonly string[] {
  return pr.files.map((f) => f.path).filter(isSourceFile);
}

/** Conventional-commit type prefix, lower-cased (`fix`, `revert`, `feat`, …). */
function commitType(title: string): string {
  const m = /^([a-z]+)[(:]/.exec(title.toLowerCase());
  return m?.[1] ?? '';
}

function referencedPrNumbers(body: string): readonly number[] {
  const hits = body.match(/#\d{3,4}/g) ?? [];
  return [...new Set(hits.map((s) => Number(s.slice(1))))];
}

/**
 * Find, for `prior`, every LATER `fix`/`revert` PR that references it and shares
 * at least one source file — the objective "shipped a defect, later corrected"
 * signal. Pure given the page; extracted here so the harvester stays declarative.
 */
function followUpFixesFor(prior: RawPr, all: readonly RawPr[]): readonly FollowUpFix[] {
  const priorSrc = new Set(sourceFilesOf(prior));
  if (priorSrc.size === 0) return [];
  const fixes: FollowUpFix[] = [];
  for (const cand of all) {
    if (cand.number <= prior.number) continue;
    const type = commitType(cand.title);
    if (type !== 'fix' && type !== 'revert') continue;
    if (!referencedPrNumbers(cand.body).includes(prior.number)) continue;
    const overlap = sourceFilesOf(cand).filter((f) => priorSrc.has(f));
    if (overlap.length > 0) {
      fixes.push({ fixPrNumber: cand.number, fixType: type, overlappingSourceFiles: overlap });
    }
  }
  return fixes;
}

function signalsFor(pr: RawPr, all: readonly RawPr[]): PrSignals {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    changedSourceFiles: sourceFilesOf(pr),
    followUpFixes: followUpFixesFor(pr, all),
    reviewDecision: pr.reviewDecision ?? null,
  };
}

// ============================================================================
// Candidate emission (full provenance)
// ============================================================================

function prUrl(pr: RawPr): string {
  return pr.url.length > 0 ? pr.url : `https://github.com/${REPO}/pull/${String(pr.number)}`;
}

interface PilotCandidate {
  readonly number: number;
  readonly title: string;
  readonly proposedClass: ProposedLabel['class'];
  readonly proposedSeverity: ProposedLabel['severity'];
  readonly needsAdjudication: boolean;
  readonly confidence: number;
  readonly provenance: {
    readonly source: ReturnType<typeof provenanceSourceFor>;
    readonly sourcePrUrl: string;
    readonly objectiveSignals: PrSignals;
    readonly justification: string;
  };
}

function toCandidate(pr: RawPr, all: readonly RawPr[]): PilotCandidate {
  const titles = new Map(all.map((p) => [p.number, p.title]));
  const signals = signalsFor(pr, all);
  const label = proposeLabel(signals, titles);
  return {
    number: pr.number,
    title: pr.title,
    proposedClass: label.class,
    proposedSeverity: label.severity,
    needsAdjudication: label.needsAdjudication,
    confidence: label.confidence,
    provenance: {
      source: provenanceSourceFor(label),
      sourcePrUrl: prUrl(pr),
      objectiveSignals: signals,
      justification: label.justification,
    },
  };
}

// ============================================================================
// CLI
// ============================================================================

interface Args {
  readonly limit: number;
  readonly out: string;
  /** Cap on `clean` proposals kept (keeps the pilot batch class-balanced). 0 = no cap. */
  readonly maxClean: number;
}

function parseArgs(argv: readonly string[]): Args {
  let limit = 60;
  let out = DEFAULT_OUT;
  let maxClean = 0;
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (next === undefined) continue;
    if (argv[i] === '--limit') limit = Number(next);
    if (argv[i] === '--out') out = next;
    if (argv[i] === '--max-clean') maxClean = Number(next);
  }
  return { limit, out, maxClean };
}

/**
 * Apply the clean-cap so the pilot batch is class-balanced. Keeps ALL buggy +
 * borderline proposals (they are the scarce, signal-bearing cases) and only
 * trims the clean tail — most-recent first — to `maxClean`. This is a
 * presentation cap, not a label change: dropped cleans had no objective fix
 * signal and remain clean if re-harvested without the cap.
 */
function applyCleanCap(candidates: readonly PilotCandidate[], maxClean: number): PilotCandidate[] {
  if (maxClean <= 0) return [...candidates];
  let kept = 0;
  return candidates.filter((c) => {
    if (c.proposedClass !== 'clean') return true;
    kept += 1;
    return kept <= maxClean;
  });
}

function harvest(args: Args): void {
  console.log(`Harvesting up to ${String(args.limit)} merged PRs from ${REPO} …`);
  const prs = fetchMergedPrs(args.limit);
  const all = prs
    .filter((pr) => sourceFilesOf(pr).length > 0)
    .filter((pr) => commitType(pr.title) !== 'fix' && commitType(pr.title) !== 'revert')
    .map((pr) => toCandidate(pr, prs));
  const candidates = applyCleanCap(all, args.maxClean);
  const balance = { buggy: 0, clean: 0, borderline: 0 };
  for (const c of candidates) balance[c.proposedClass] += 1;
  console.log(
    `Proposed ${String(candidates.length)} candidates: ` +
      `buggy=${String(balance.buggy)} clean=${String(balance.clean)} borderline=${String(balance.borderline)}; ` +
      `needsAdjudication=${String(candidates.filter((c) => c.needsAdjudication).length)}`
  );
  fs.writeFileSync(args.out, `${JSON.stringify(candidates, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${args.out}`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== 'harvest') {
    console.error('usage: curate-pr-review-harvest.ts harvest [--limit N] [--out PATH]');
    process.exit(1);
  }
  harvest(parseArgs(rest));
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  main();
}

export {
  followUpFixesFor,
  signalsFor,
  commitType,
  sourceFilesOf,
  toCandidate,
  type PilotCandidate,
};
