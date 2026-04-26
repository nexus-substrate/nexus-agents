#!/usr/bin/env npx tsx
/**
 * pr_review batch scorer (#2240).
 *
 * Reads a batch summary JSON and the dataset it was run against; produces
 * aggregate metrics + a per-PR breakdown.
 *
 * Usage:
 *   npx tsx scripts/pr-review-score.ts                      # latest summary in testing/results
 *   npx tsx scripts/pr-review-score.ts <summary.json>       # specific summary
 *
 * @module scripts/pr-review-score
 */

/* eslint-disable no-console -- CLI script */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  SampleDatasetSchema,
  type SampleDataset,
  type SamplePr,
  type BatchSummary,
  type BatchPrResult,
  type PerPrScore,
  type ScoreReport,
} from './pr-review-batch-types.js';

const RESULTS_DIR = 'testing/results';

// ============================================================================
// Argument resolution
// ============================================================================

async function resolveSummaryPath(arg: string | undefined): Promise<string> {
  if (arg !== undefined && arg !== '') return arg;
  const entries = await readdir(RESULTS_DIR);
  const summaries = entries
    .filter((e) => e.startsWith('pr-review-batch-') && e.endsWith('.summary.json'))
    .sort();
  const latest = summaries[summaries.length - 1];
  if (latest === undefined) {
    throw new Error(`No batch summaries found in ${RESULTS_DIR}`);
  }
  return path.join(RESULTS_DIR, latest);
}

// ============================================================================
// Scoring
// ============================================================================

interface ParsedLocation {
  readonly file: string;
  readonly line: number | undefined;
}

function parseLocation(loc: string): ParsedLocation {
  const parts = loc.split(':');
  const file = parts[0]?.split('/').pop() ?? '';
  const lineStr = parts[1];
  const lineNum = lineStr === undefined ? Number.NaN : Number.parseInt(lineStr, 10);
  return { file, line: Number.isFinite(lineNum) ? lineNum : undefined };
}

function locationsMatch(findingLoc: string, knownBugLoc: string | undefined): boolean {
  if (knownBugLoc === undefined || knownBugLoc === '') return false;
  const f = parseLocation(findingLoc);
  const k = parseLocation(knownBugLoc);
  if (f.file === '' || f.file !== k.file) return false;
  if (f.line === undefined || k.line === undefined) return true; // file-match only when no lines
  return Math.abs(f.line - k.line) <= 5;
}

function countKnownBugMatches(pr: SamplePr, result: BatchPrResult): number {
  let matched = 0;
  for (const bug of pr.knownBugs) {
    const allFindings = result.voters.flatMap((v) => v.findings.filter((f) => f.verified));
    if (allFindings.some((f) => locationsMatch(f.location, bug.location))) {
      matched++;
    }
  }
  return matched;
}

function scorePr(pr: SamplePr, result: BatchPrResult): PerPrScore {
  const isBuggy = pr.knownBugs.length > 0;
  const expected = isBuggy ? 'request_changes' : 'approve';
  const verifiedFindingCount = result.voters.reduce((sum, v) => sum + v.verifiedFindingCount, 0);
  return {
    prNumber: pr.number,
    knownBugCount: pr.knownBugs.length,
    toolDecision: result.summary,
    verifiedFindingCount,
    classDecisionMatch: result.summary === expected,
    knownBugsMatched: isBuggy ? countKnownBugMatches(pr, result) : 0,
  };
}

function aggregateReport(
  source: string,
  perPr: readonly PerPrScore[],
  results: readonly BatchPrResult[]
): ScoreReport {
  const buggyScores = perPr.filter((p) => p.knownBugCount > 0);
  const cleanScores = perPr.filter((p) => p.knownBugCount === 0);

  const buggyCaught = buggyScores.filter((p) => p.toolDecision === 'request_changes').length;
  const cleanFalsePositives = cleanScores.filter(
    (p) => p.toolDecision === 'request_changes'
  ).length;
  const knownBugMatches = buggyScores.reduce((sum, p) => sum + (p.knownBugsMatched > 0 ? 1 : 0), 0);

  const bugCatchRate = buggyScores.length === 0 ? 0 : buggyCaught / buggyScores.length;
  const falsePositiveRate = cleanScores.length === 0 ? 0 : cleanFalsePositives / cleanScores.length;
  const knownBugMatchRate = buggyScores.length === 0 ? 0 : knownBugMatches / buggyScores.length;

  const successfulResults = results.filter((r) => r.errorMessage === undefined);
  const avgDurationMs =
    successfulResults.length === 0
      ? 0
      : successfulResults.reduce((s, r) => s + r.totalDurationMs, 0) / successfulResults.length;

  return {
    source,
    totalPrs: perPr.length,
    buggyPrs: buggyScores.length,
    cleanPrs: cleanScores.length,
    bugCatchRate,
    falsePositiveRate,
    knownBugMatchRate,
    avgDurationMs,
    perPr,
    successCriteria: {
      bugCatchAtLeastTenPercent: bugCatchRate >= 0.1,
      falsePositiveBelowTwentyPercent: falsePositiveRate < 0.2,
      avgDurationBelowFiveMinutes: avgDurationMs < 5 * 60 * 1000,
    },
  };
}

// ============================================================================
// Pretty print
// ============================================================================

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function pretty(report: ScoreReport): string {
  const lines: string[] = [];
  lines.push(`# pr_review batch score`);
  lines.push(`source: ${report.source}`);
  lines.push(
    `total PRs: ${String(report.totalPrs)} (${String(report.buggyPrs)} buggy, ${String(report.cleanPrs)} clean)`
  );
  lines.push(``);
  lines.push(`## Aggregate`);
  lines.push(`bug-catch rate:        ${formatPercent(report.bugCatchRate)} (target ≥10%)`);
  lines.push(`false-positive rate:   ${formatPercent(report.falsePositiveRate)} (target <20%)`);
  lines.push(`known-bug match rate:  ${formatPercent(report.knownBugMatchRate)}`);
  lines.push(`avg duration:          ${formatDuration(report.avgDurationMs)} (target <5m)`);
  lines.push(``);
  lines.push(`## Success criteria (#2233)`);
  lines.push(
    `bug-catch ≥10%:        ${report.successCriteria.bugCatchAtLeastTenPercent ? '✓ PASS' : '✗ FAIL'}`
  );
  lines.push(
    `false-positive <20%:   ${report.successCriteria.falsePositiveBelowTwentyPercent ? '✓ PASS' : '✗ FAIL'}`
  );
  lines.push(
    `avg duration <5m:      ${report.successCriteria.avgDurationBelowFiveMinutes ? '✓ PASS' : '✗ FAIL'}`
  );
  lines.push(``);
  lines.push(`## Per-PR breakdown`);
  for (const p of report.perPr) {
    const tag = p.knownBugCount > 0 ? `[BUGGY×${String(p.knownBugCount)}]` : '[CLEAN]';
    const match = p.classDecisionMatch ? '✓' : '✗';
    lines.push(
      `  ${match} #${String(p.prNumber)} ${tag} → ${p.toolDecision} (verified findings: ${String(p.verifiedFindingCount)}, known-bugs matched: ${String(p.knownBugsMatched)})`
    );
  }
  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const summaryPath = await resolveSummaryPath(process.argv[2]);
  const summaryRaw = await readFile(summaryPath, 'utf8');
  const summary = JSON.parse(summaryRaw) as BatchSummary;
  const datasetRaw = await readFile(summary.dataset, 'utf8');
  const dataset: SampleDataset = SampleDatasetSchema.parse(JSON.parse(datasetRaw));

  const datasetByNumber = new Map(dataset.prs.map((p) => [p.number, p]));
  const perPr: PerPrScore[] = summary.results
    .map((r) => {
      const pr = datasetByNumber.get(r.prNumber);
      if (pr === undefined) return null;
      return scorePr(pr, r);
    })
    .filter((s): s is PerPrScore => s !== null);

  const report = aggregateReport(summaryPath, perPr, summary.results);
  const reportPath = summaryPath.replace('.summary.json', '.score.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(pretty(report));
  console.log(`\n  full report: ${reportPath}`);
}

await main();
