/* eslint-disable no-console */
/**
 * Stratified Outcome Report (#2662, Epic E).
 *
 * The `fitness-audit` command is static source-tree analysis — it does not
 * read runtime data. This is the SEPARATE runtime-outcome report (the
 * #2662 design vote kept the concerns apart): it reads the OutcomeStore
 * JSONL and breaks task outcomes down per-stratum, because an aggregate
 * success rate hides where the failures live — one adapter at 60% on a
 * task-type can be masked by others compensating.
 *
 * Strata: `adapter` (cli) × `task-type` (category) × `voter-role` (#2662
 * added `voterRole` to recorded consensus outcomes — empty until votes
 * accumulate, honest rather than fake). Novel errors (`generic` /
 * `unknown` failure category) are surfaced separately for human triage.
 *
 * The OutcomeStore lives at runtime under `$NEXUS_DATA_DIR` — it is empty
 * in a clean CI checkout. This report is meant to run where real outcome
 * data exists: a developer's machine, or the `self-dogfood` workflow
 * which exercises the agents and accumulates outcomes before uploading
 * the JSON artifact.
 *
 * Usage:
 *   pnpm exec tsx scripts/stratify-outcomes.ts            # write docs/research/fitness-stratified-v1.md
 *   pnpm exec tsx scripts/stratify-outcomes.ts --json     # emit JSON to stdout (CI artifact)
 *   pnpm exec tsx scripts/stratify-outcomes.ts <path>     # read outcomes JSONL from <path>
 *
 * @module scripts/stratify-outcomes
 * @see Issue #2662
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';
import { getNexusDataDir } from '../packages/nexus-agents/src/config/nexus-data-dir.js';

const REPORT_PATH = join(ROOT, 'docs/research/fitness-stratified-v1.md');

/** The subset of a recorded outcome this report reads. */
export interface OutcomeRecord {
  cli?: string;
  category?: string;
  voterRole?: string;
  success?: boolean;
  failureCategory?: string;
  source?: string;
}

/** Success stats for one stratum value. */
export interface StratumStat {
  key: string;
  total: number;
  successes: number;
  successRate: number;
}

export interface StratifiedReport {
  totalOutcomes: number;
  byAdapter: StratumStat[];
  byTaskType: StratumStat[];
  byVoterRole: StratumStat[];
  /** Count of outcomes whose failure landed in an uninformative category. */
  novelErrorCount: number;
}

/** Parse an outcomes JSONL file, skipping malformed lines. */
export function loadOutcomes(jsonl: string): OutcomeRecord[] {
  const out: OutcomeRecord[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as OutcomeRecord);
    } catch {
      // Skip a malformed line — a partial write shouldn't sink the report.
    }
  }
  return out;
}

/** Group outcomes by a key extractor into sorted success-rate stats. */
function groupStats(
  outcomes: readonly OutcomeRecord[],
  keyOf: (o: OutcomeRecord) => string | undefined
): StratumStat[] {
  const buckets = new Map<string, { total: number; successes: number }>();
  for (const o of outcomes) {
    const key = keyOf(o);
    if (key === undefined || key === '') continue;
    const b = buckets.get(key) ?? { total: 0, successes: 0 };
    b.total += 1;
    if (o.success === true) b.successes += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      total: b.total,
      successes: b.successes,
      successRate: b.total === 0 ? 0 : b.successes / b.total,
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

/** A failure with no informative category — surfaced for human triage. */
function isNovelError(o: OutcomeRecord): boolean {
  if (o.success !== false) return false;
  return o.failureCategory === undefined || ['generic', 'unknown'].includes(o.failureCategory);
}

/** Stratify a set of outcomes by adapter, task-type, and voter-role. */
export function stratify(outcomes: readonly OutcomeRecord[]): StratifiedReport {
  return {
    totalOutcomes: outcomes.length,
    byAdapter: groupStats(outcomes, (o) => o.cli),
    byTaskType: groupStats(outcomes, (o) => o.category),
    byVoterRole: groupStats(outcomes, (o) => o.voterRole),
    novelErrorCount: outcomes.filter(isNovelError).length,
  };
}

function renderStatTable(title: string, stats: readonly StratumStat[]): string[] {
  const lines = [`## ${title}`, ''];
  if (stats.length === 0) {
    lines.push('_No data yet._');
    return lines;
  }
  // Spaced separator + cells so the table is markdownlint-MD060-clean.
  lines.push('| Stratum | Outcomes | Success rate |', '| --- | ---: | ---: |');
  for (const s of stats) {
    lines.push(`| \`${s.key}\` | ${String(s.total)} | ${(s.successRate * 100).toFixed(1)}% |`);
  }
  return lines;
}

/** Render the stratified report markdown. */
export function renderReport(report: StratifiedReport): string {
  const lines: string[] = [
    '# Fitness — Stratified Outcome Report (v1)',
    '',
    'Auto-generated by `scripts/stratify-outcomes.ts` (#2662). Runtime task',
    'outcomes from the OutcomeStore, broken down per stratum — an aggregate',
    'success rate hides where the failures live.',
    '',
    `Total outcomes: **${String(report.totalOutcomes)}** · ` +
      `novel/uncategorized failures: **${String(report.novelErrorCount)}** ` +
      '(surfaced separately for triage).',
    '',
    'Strata are sorted worst-success-rate first. `voter-role` is empty until',
    'consensus votes recorded with the #2662 `voterRole` field accumulate.',
    '',
    ...renderStatTable('By adapter', report.byAdapter),
    '',
    ...renderStatTable('By task-type', report.byTaskType),
    '',
    ...renderStatTable('By voter-role', report.byVoterRole),
  ];
  // Collapse any accidental multi-blank runs; single trailing newline.
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

function resolveOutcomesPath(): string {
  const arg = process.argv.find((a) => !a.startsWith('--') && a.endsWith('.jsonl'));
  if (arg !== undefined) return arg;
  return join(getNexusDataDir(), 'learning', 'outcomes.jsonl');
}

function main(): number {
  const path = resolveOutcomesPath();
  const outcomes = existsSync(path) ? loadOutcomes(readFileSync(path, 'utf-8')) : [];
  const report = stratify(outcomes);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  writeFileSync(REPORT_PATH, renderReport(report));
  console.log(
    `Wrote ${REPORT_PATH} — ${String(report.totalOutcomes)} outcomes ` +
      `(source: ${existsSync(path) ? path : 'none — OutcomeStore empty'}).`
  );
  return 0;
}

if (process.argv[1]?.endsWith('stratify-outcomes.ts') === true) {
  process.exit(main());
}
