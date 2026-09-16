/**
 * Undeclared-options detector precision reader (#5422).
 *
 * `consensus_vote` warns when a proposal names alternatives in prose while
 * `options` is undeclared (#5360). The warning's precision cannot be measured
 * over the vote ledger — it stores a 503-char proposal preview — so the
 * detector records its verdict LIVE, on every vote, as
 * `undeclaredOptionsDetector` on the decision-cost record
 * (`<dataDir>/learning/decision-costs.jsonl`). This script reads those rows
 * back:
 *
 * 1. lists every FIRED row (`decisionId`, pattern, declared option count,
 *    excerpt) so an operator can hand-label each as a true or false positive;
 * 2. prints `fired / total`, where `total` counts rows that carry a verdict —
 *    not-fired rows are the denominator, rows written before the field existed
 *    are reported separately, never folded in as "not fired";
 * 3. given a labels file (`<decisionId>,<tp|fp>` per line, `#` comments),
 *    prints precision = tp / (tp + fp) with n, and whether the promotion bar
 *    on #5422 (precision >= 0.9 over >= 30 labelled fired rows) is met.
 *
 * The empty case is `unmeasured`, exit 2 — a store with no fired rows, or
 * fired rows with no labels, is not a precision of 1.
 *
 * Manual-only: it reads a runtime store only a machine that ran panels has;
 * a CI runner has none and would report `unmeasured` on every run.
 *
 * ## Usage
 *
 *   pnpm exec tsx scripts/undeclared-options-precision.ts
 *   pnpm exec tsx scripts/undeclared-options-precision.ts --file <decision-costs.jsonl>
 *   pnpm exec tsx scripts/undeclared-options-precision.ts --labels <labels.csv>
 *
 * Exit: 0 measured; 2 unmeasured (no fired rows, no labels, missing store);
 * 1 usage error.
 *
 * @module scripts/undeclared-options-precision
 * @see Issue #5422 (the measurement), #5360 (the warning)
 */

import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { getDecisionCostFile } from '../packages/nexus-agents/src/config/learning-persistence.js';
import {
  UndeclaredOptionsDetectorSchema,
  type UndeclaredOptionsDetectorRecord,
} from '../packages/nexus-agents/src/observability/decision-cost.js';
import { UNDECLARED_OPTION_PATTERNS } from '../packages/nexus-agents/src/mcp/tools/consensus-vote-option-detection.js';

/** Promotion bar from #5422: precision floor over a minimum labelled sample. */
export const PROMOTION_MIN_PRECISION = 0.9;
export const PROMOTION_MIN_FIRED = 30;

/**
 * The slice of a decision-cost record this reader needs. Deliberately not the
 * store's full schema: rows written before an unrelated field was added must
 * still count, and only the verdict's shape matters here.
 */
const RowSchema = z.object({
  decisionId: z.string().min(1),
  gate: z.string().min(1),
  timestamp: z.string().min(1),
  undeclaredOptionsDetector: UndeclaredOptionsDetectorSchema.optional(),
});

export interface DetectorRow {
  readonly decisionId: string;
  readonly gate: string;
  readonly timestamp: string;
  readonly verdict: UndeclaredOptionsDetectorRecord;
}

export interface StoreCensus {
  /** Rows carrying a verdict — fired or not. The precision denominator. */
  readonly total: number;
  readonly fired: readonly DetectorRow[];
  /** Rows with no verdict: written before #5422, or by `pr_review`. */
  readonly withoutVerdict: number;
  /** Lines that are not JSON, or whose verdict fails the schema. */
  readonly unparseable: number;
}

/** Census of one JSONL store's text. Empty text is zero of everything. */
export function parseStoreText(text: string): StoreCensus {
  const rows: DetectorRow[] = [];
  let withoutVerdict = 0;
  let unparseable = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      unparseable += 1;
      continue;
    }
    const parsed = RowSchema.safeParse(json);
    if (!parsed.success) {
      unparseable += 1;
      continue;
    }
    const { undeclaredOptionsDetector: verdict, ...rest } = parsed.data;
    if (verdict === undefined) {
      withoutVerdict += 1;
      continue;
    }
    rows.push({ ...rest, verdict });
  }
  return {
    total: rows.length,
    fired: rows.filter((r) => r.verdict.fired),
    withoutVerdict,
    unparseable,
  };
}

export type Label = 'tp' | 'fp';

/** `<decisionId>,<tp|fp>` per line; blanks and `#` comments skipped. */
export function parseLabels(text: string): { labels: Map<string, Label>; malformed: string[] } {
  const labels = new Map<string, Label>();
  const malformed: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const comma = line.indexOf(',');
    const id = comma === -1 ? '' : line.slice(0, comma).trim();
    const label = comma === -1 ? '' : line.slice(comma + 1).trim();
    if (id === '' || (label !== 'tp' && label !== 'fp')) {
      malformed.push(line);
      continue;
    }
    labels.set(id, label);
  }
  return { labels, malformed };
}

export type PrecisionVerdict =
  | { readonly kind: 'unmeasured'; readonly reason: string }
  | {
      readonly kind: 'measured';
      readonly tp: number;
      readonly fp: number;
      readonly n: number;
      readonly precision: number;
      /** Fired rows the labels file does not cover. */
      readonly unlabelled: number;
      /** Labelled ids that match no fired row (stale or mistyped). */
      readonly unknownIds: readonly string[];
    };

/**
 * precision = tp / (tp + fp) over the fired rows the labels cover. Named
 * empty cases: no fired rows, and fired rows with no label, are both
 * `unmeasured` — a denominator of zero is not a precision of 1.
 */
export function computePrecision(
  fired: readonly DetectorRow[],
  labels: ReadonlyMap<string, Label>
): PrecisionVerdict {
  if (fired.length === 0) return { kind: 'unmeasured', reason: '0 fired rows' };
  let tp = 0;
  let fp = 0;
  let unlabelled = 0;
  const firedIds = new Set<string>();
  for (const row of fired) {
    firedIds.add(row.decisionId);
    const label = labels.get(row.decisionId);
    if (label === 'tp') tp += 1;
    else if (label === 'fp') fp += 1;
    else unlabelled += 1;
  }
  const n = tp + fp;
  if (n === 0) {
    return {
      kind: 'unmeasured',
      reason: `0 labelled fired rows (${String(fired.length)} fired, 0 labelled)`,
    };
  }
  const unknownIds = [...labels.keys()].filter((id) => !firedIds.has(id));
  return { kind: 'measured', tp, fp, n, precision: tp / n, unlabelled, unknownIds };
}

/** One line per excerpt: control characters would otherwise break the table. */
function oneLine(text: string): string {
  return text.replace(/\r?\n/g, '⏎').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '?');
}

function renderBar(verdict: PrecisionVerdict): string {
  const bar = `bar (#5422): precision >= ${String(PROMOTION_MIN_PRECISION)} over n >= ${String(PROMOTION_MIN_FIRED)} labelled fired rows`;
  if (verdict.kind === 'unmeasured') return `${bar} — unmeasured`;
  if (verdict.n < PROMOTION_MIN_FIRED) {
    return `${bar} — NOT MET (n=${String(verdict.n)} < ${String(PROMOTION_MIN_FIRED)})`;
  }
  if (verdict.precision < PROMOTION_MIN_PRECISION) {
    return `${bar} — NOT MET (precision ${verdict.precision.toFixed(3)} < ${String(PROMOTION_MIN_PRECISION)})`;
  }
  return `${bar} — MET (precision ${verdict.precision.toFixed(3)}, n=${String(verdict.n)})`;
}

/** Per-pattern fired counts, every pattern in force listed, zero-hit ones included. */
function renderByPattern(fired: readonly DetectorRow[]): string[] {
  const lines = ['fired rows by pattern (every pattern in force, zero-hit ones included):'];
  const byPattern = new Map<string, number>();
  for (const row of fired) {
    const key = row.verdict.pattern ?? '(no pattern recorded)';
    byPattern.set(key, (byPattern.get(key) ?? 0) + 1);
  }
  for (const pattern of UNDECLARED_OPTION_PATTERNS) {
    const key = String(pattern);
    lines.push(`  ${key}: ${String(byPattern.get(key) ?? 0)}`);
    byPattern.delete(key);
  }
  for (const [key, count] of byPattern) {
    lines.push(`  ${key}: ${String(count)}  (not in the current pattern set)`);
  }
  return lines;
}

/** The rows to hand-label, one per line, tab-separated. */
function renderFiredRows(fired: readonly DetectorRow[]): string[] {
  const lines = ['fired rows (decisionId\tpattern\tdeclaredOptionCount\texcerpt):'];
  if (fired.length === 0) lines.push('  (none)');
  for (const row of fired) {
    lines.push(
      `  ${row.decisionId}\t${row.verdict.pattern ?? ''}\t${String(row.verdict.declaredOptionCount)}\t${oneLine(row.verdict.excerpt ?? '')}`
    );
  }
  return lines;
}

/**
 * The precision lines. `precision` is `undefined` when no labels file was
 * given, which renders as unmeasured — distinct from a labels file that
 * covers nothing.
 */
function renderPrecision(firedCount: number, precision: PrecisionVerdict | undefined): string[] {
  if (precision === undefined) {
    const line =
      firedCount === 0
        ? 'precision: unmeasured (0 fired rows)'
        : 'precision: unmeasured (no labels file) — label the rows above as <decisionId>,<tp|fp> and pass --labels';
    return [line, renderBar({ kind: 'unmeasured', reason: 'no labels' })];
  }
  if (precision.kind === 'unmeasured') {
    return [`precision: unmeasured (${precision.reason})`, renderBar(precision)];
  }
  const lines = [
    `precision: ${precision.precision.toFixed(3)} (tp=${String(precision.tp)}, fp=${String(precision.fp)}, n=${String(precision.n)})`,
  ];
  if (precision.unlabelled > 0)
    lines.push(`unlabelled fired rows: ${String(precision.unlabelled)}`);
  if (precision.unknownIds.length > 0) {
    lines.push(`labels naming no fired row: ${precision.unknownIds.join(', ')}`);
  }
  lines.push(renderBar(precision));
  return lines;
}

/** The whole report: census header, per-pattern counts, fired rows, precision. */
export function renderReport(
  storePath: string,
  census: StoreCensus,
  precision: PrecisionVerdict | undefined
): string {
  const lines = [
    `store: ${storePath}`,
    `fired / total: ${String(census.fired.length)} / ${String(census.total)}`,
    `rows without a verdict (written before #5422, or pr_review): ${String(census.withoutVerdict)}`,
    `unparseable lines: ${String(census.unparseable)}`,
    '',
    ...renderByPattern(census.fired),
    '',
    ...renderFiredRows(census.fired),
    '',
    ...renderPrecision(census.fired.length, precision),
  ];
  return `${lines.join('\n')}\n`;
}

const USAGE =
  'usage: undeclared-options-precision.ts [--file <decision-costs.jsonl>] [--labels <labels.csv>]';

interface Args {
  readonly file: string;
  readonly labels: string | undefined;
}

function parseArgs(argv: readonly string[]): Args | { readonly error: string } {
  let file: string | undefined;
  let labels: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--file' && next !== undefined) {
      file = next;
      i += 1;
    } else if (arg === '--labels' && next !== undefined) {
      labels = next;
      i += 1;
    } else {
      return { error: `unknown or incomplete argument: ${String(arg)}\n${USAGE}` };
    }
  }
  return { file: file ?? getDecisionCostFile(), labels };
}

/** Pure entry point: argv in, `{ exitCode, output }` out, so tests need no process. */
export function run(argv: readonly string[]): { exitCode: number; output: string } {
  const args = parseArgs(argv);
  if ('error' in args) return { exitCode: 1, output: `${args.error}\n` };
  if (!existsSync(args.file)) {
    return {
      exitCode: 2,
      output: `store: ${args.file}\nprecision: unmeasured (no store file at that path)\n`,
    };
  }
  const census = parseStoreText(readFileSync(args.file, 'utf-8'));
  let precision: PrecisionVerdict | undefined;
  let labelNotes = '';
  if (args.labels !== undefined) {
    if (!existsSync(args.labels)) {
      return { exitCode: 1, output: `labels file not found: ${args.labels}\n${USAGE}\n` };
    }
    const { labels, malformed } = parseLabels(readFileSync(args.labels, 'utf-8'));
    if (malformed.length > 0) {
      labelNotes = `malformed label lines (ignored): ${malformed.join(' | ')}\n`;
    }
    precision = computePrecision(census.fired, labels);
  }
  const output = renderReport(args.file, census, precision) + labelNotes;
  const measured = precision?.kind === 'measured';
  return { exitCode: measured ? 0 : 2, output };
}

const entryPath = process.argv[1] ?? '';
if (import.meta.url === `file://${entryPath}`) {
  const { exitCode, output } = run(process.argv.slice(2));
  process.stdout.write(output);
  process.exit(exitCode);
}
