#!/usr/bin/env npx tsx
/**
 * pr_review batch harness (#2240).
 *
 * Reads a curated dataset of historical PRs, fetches each diff via `gh api`,
 * runs the same voter pipeline that the pr_review MCP tool uses, and writes
 * a per-PR result line to JSONL.
 *
 * Usage:
 *   npx tsx scripts/pr-review-batch.ts                      # uses default dataset, real voters
 *   npx tsx scripts/pr-review-batch.ts --simulate           # dry-run, no LLM calls
 *   npx tsx scripts/pr-review-batch.ts --prs 2185,2218,2225 # subset of PR numbers
 *   npx tsx scripts/pr-review-batch.ts --dataset path.json  # custom dataset
 *
 * Output:
 *   testing/results/pr-review-batch-<ISO-timestamp>.jsonl
 *   testing/results/pr-review-batch-<ISO-timestamp>.summary.json
 *
 * @module scripts/pr-review-batch
 */

/* eslint-disable no-console -- this is a CLI script that prints progress */

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectRealVotes } from '../packages/nexus-agents/src/cli/voter-agents.js';
import {
  PR_REVIEW_ROLES,
  buildPrReviewProposal,
  mapVoteDecisionToPrDecision,
  aggregatePrDecisions,
  MAX_DIFF_LENGTH,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import { parseFindings } from '../packages/nexus-agents/src/mcp/tools/pr-review-findings.js';
import {
  SampleDatasetSchema,
  type SampleDataset,
  type SamplePr,
  type BatchPrResult,
  type BatchSummary,
} from './pr-review-batch-types.js';

const execFileP = promisify(execFile);

const REPO_OWNER = 'williamzujkowski';
const REPO_NAME = 'nexus-agents';
const DEFAULT_DATASET = 'testing/datasets/pr-review-sample.json';
const RESULTS_DIR = 'testing/results';

// ============================================================================
// CLI argument parsing
// ============================================================================

interface CliArgs {
  readonly datasetPath: string;
  readonly simulate: boolean;
  readonly prsFilter: ReadonlySet<number> | undefined;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let datasetPath = DEFAULT_DATASET;
  let simulate = false;
  let prsFilter: Set<number> | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--simulate') {
      simulate = true;
    } else if (arg === '--dataset' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined) {
        datasetPath = next;
        i++;
      }
    } else if (arg === '--prs' && i + 1 < argv.length) {
      const list = argv[i + 1];
      if (list !== undefined && list !== '') {
        prsFilter = new Set(
          list
            .split(',')
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        );
        i++;
      }
    }
  }

  return { datasetPath, simulate, prsFilter };
}

// ============================================================================
// Diff fetching via gh CLI
// ============================================================================

async function fetchPrDiff(
  prNumber: number
): Promise<{ diff: string; truncated: boolean; baseRef: string; headRef: string }> {
  // Use gh api for the diff (preserves auth + handles large diffs).
  const { stdout } = await execFileP(
    'gh',
    [
      'api',
      `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`,
      '--jq',
      '.head.ref + " " + .base.ref',
    ],
    { maxBuffer: 1024 * 1024 }
  );
  const [headRef = '', baseRef = ''] = stdout.trim().split(' ');

  const { stdout: diffOut } = await execFileP(
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
  return { diff, truncated, baseRef, headRef };
}

async function fetchPrTitleAndDescription(
  prNumber: number
): Promise<{ title: string; description: string }> {
  const { stdout } = await execFileP(
    'gh',
    ['api', `repos/${REPO_OWNER}/${REPO_NAME}/pulls/${String(prNumber)}`, '--jq', '{title, body}'],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout) as { title?: string; body?: string };
  return { title: parsed.title ?? '', description: parsed.body ?? '' };
}

// ============================================================================
// Per-PR run
// ============================================================================

interface VoteResultLike {
  readonly role: string;
  readonly vote: {
    decision: 'approve' | 'reject' | 'abstain';
    confidence: number;
    reasoning: string;
  };
  readonly source: 'llm' | 'simulation' | 'error';
  readonly cli?: string | undefined;
  readonly processingTimeMs: number;
}

function summarizeVoter(r: VoteResultLike): BatchPrResult['voters'][number] {
  const findings = parseFindings(r.vote.reasoning);
  return {
    role: r.role,
    decision: mapVoteDecisionToPrDecision(r.vote.decision),
    confidence: r.vote.confidence,
    source: r.source,
    ...(r.cli !== undefined && { cli: r.cli }),
    verifiedFindingCount: findings.filter((f) => f.verified).length,
    unverifiedFindingCount: findings.filter((f) => !f.verified).length,
    findings: findings.slice(0, 5).map((f) => ({
      summary: f.summary,
      location: f.location,
      severity: f.severity,
      verified: f.verified,
    })),
  };
}

function buildErrorResult(pr: SamplePr, errMsg: string, durationMs: number): BatchPrResult {
  return {
    prNumber: pr.number,
    title: pr.title,
    knownBugCount: pr.knownBugs.length,
    diffSize: 0,
    diffTruncated: false,
    summary: 'abstain',
    approveCount: 0,
    requestChangesCount: 0,
    abstainCount: 0,
    errorCount: PR_REVIEW_ROLES.length,
    voters: [],
    totalDurationMs: durationMs,
    errorMessage: errMsg,
  };
}

async function collectVotesForPr(
  pr: SamplePr,
  simulate: boolean
): Promise<{ voteResults: VoteResultLike[]; diff: string; truncated: boolean }> {
  const [{ diff, truncated, baseRef, headRef }, meta] = await Promise.all([
    fetchPrDiff(pr.number),
    fetchPrTitleAndDescription(pr.number),
  ]);
  const proposal = buildPrReviewProposal({
    prTitle: meta.title,
    prDescription: meta.description,
    prDiff: diff,
    ...(baseRef !== '' && { baseRef }),
    ...(headRef !== '' && { headRef }),
    simulate,
  });
  const voteResults = await collectRealVotes({ roles: PR_REVIEW_ROLES, proposal, simulate });
  return { voteResults, diff, truncated };
}

function buildSuccessResult(
  pr: SamplePr,
  diff: string,
  truncated: boolean,
  voteResults: VoteResultLike[],
  durationMs: number
): BatchPrResult {
  const voters = voteResults.map(summarizeVoter);
  const reviews = voteResults.map((r) => ({
    role: r.role,
    decision: mapVoteDecisionToPrDecision(r.vote.decision),
    confidence: r.vote.confidence,
    reasoning: r.vote.reasoning,
    findings: parseFindings(r.vote.reasoning),
    source: r.source,
    cli: r.cli,
    processingTimeMs: r.processingTimeMs,
  }));
  return {
    prNumber: pr.number,
    title: pr.title,
    knownBugCount: pr.knownBugs.length,
    diffSize: diff.length,
    diffTruncated: truncated,
    summary: aggregatePrDecisions(reviews),
    approveCount: reviews.filter((r) => r.source !== 'error' && r.decision === 'approve').length,
    requestChangesCount: reviews.filter(
      (r) => r.source !== 'error' && r.decision === 'request_changes'
    ).length,
    abstainCount: reviews.filter((r) => r.source !== 'error' && r.decision === 'abstain').length,
    errorCount: reviews.filter((r) => r.source === 'error').length,
    voters,
    totalDurationMs: durationMs,
  };
}

async function runPr(pr: SamplePr, simulate: boolean): Promise<BatchPrResult> {
  const start = Date.now();
  console.log(`\n[${String(pr.number)}] ${pr.title} (knownBugs=${String(pr.knownBugs.length)})`);

  try {
    const { voteResults, diff, truncated } = await collectVotesForPr(pr, simulate);
    const result = buildSuccessResult(pr, diff, truncated, [...voteResults], Date.now() - start);
    console.log(
      `  → ${result.summary.toUpperCase()} (approve=${String(result.approveCount)}, request_changes=${String(result.requestChangesCount)}, abstain=${String(result.abstainCount)}, err=${String(result.errorCount)}) in ${String(Math.round(result.totalDurationMs / 1000))}s`
    );
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ FAILED: ${errMsg}`);
    return buildErrorResult(pr, errMsg, Date.now() - start);
  }
}

// ============================================================================
// Main
// ============================================================================

async function loadDataset(p: string): Promise<SampleDataset> {
  const raw = await readFile(p, 'utf8');
  const json: unknown = JSON.parse(raw);
  return SampleDatasetSchema.parse(json);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`pr_review batch harness — ${args.simulate ? 'SIMULATE' : 'REAL VOTERS'}`);
  console.log(`dataset: ${args.datasetPath}`);

  if (!existsSync(args.datasetPath)) {
    console.error(`Dataset not found: ${args.datasetPath}`);
    process.exit(1);
  }

  const dataset = await loadDataset(args.datasetPath);
  const filter = args.prsFilter;
  const filteredPrs =
    filter === undefined ? dataset.prs : dataset.prs.filter((p) => filter.has(p.number));
  console.log(
    `running ${String(filteredPrs.length)} of ${String(dataset.prs.length)} PRs from dataset (curated ${dataset.curatedAt})`
  );

  if (!existsSync(RESULTS_DIR)) await mkdir(RESULTS_DIR, { recursive: true });
  const ts = timestampForFilename();
  const jsonlPath = path.join(RESULTS_DIR, `pr-review-batch-${ts}.jsonl`);
  const summaryPath = path.join(RESULTS_DIR, `pr-review-batch-${ts}.summary.json`);

  const startedAt = new Date().toISOString();
  const results: BatchPrResult[] = [];

  for (const pr of filteredPrs) {
    const r = await runPr(pr, args.simulate);
    results.push(r);
    await appendFile(jsonlPath, `${JSON.stringify(r)}\n`);
  }

  const summary: BatchSummary = {
    startedAt,
    completedAt: new Date().toISOString(),
    dataset: args.datasetPath,
    simulate: args.simulate,
    totalPrs: filteredPrs.length,
    succeeded: results.filter((r) => r.errorMessage === undefined).length,
    failed: results.filter((r) => r.errorMessage !== undefined).length,
    results,
  };
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\nDone.`);
  console.log(`  results: ${jsonlPath}`);
  console.log(`  summary: ${summaryPath}`);
  console.log(
    `  succeeded=${String(summary.succeeded)}, failed=${String(summary.failed)} of ${String(summary.totalPrs)}`
  );
}

await main();
