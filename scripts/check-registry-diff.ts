/**
 * check-registry-diff — bounded-diff guardrail for the weekly
 * model-registry.generated.json refresh workflow (epic #2174 / issue #2180).
 *
 * Compares two snapshots of the bundled registry and produces a Markdown
 * diff summary + a verdict on whether the change should be auto-mergeable.
 * A PR that deletes more than 5% of known entries or bumps any cost field
 * by more than 10x is labeled `needs-human-review` — these are the
 * supply-chain tripwires we defined in #2174 before approving Option D.
 *
 * Invoked standalone by the GH Actions workflow. Pure functions are
 * exported for unit tests so CI logic stays testable.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-registry-diff.ts <old.json> <new.json> [--json]
 *
 * Exits 0 always — the workflow decides what to do with the verdict via
 * the printed JSON / Markdown.
 */
/* eslint-disable no-console */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Shape expected — matches GeneratedRegistry from scripts/build-model-registry-types.ts
// ---------------------------------------------------------------------------

interface Entry {
  readonly id: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly pricing?: { readonly inputPer1M: number; readonly outputPer1M: number };
}

interface Registry {
  readonly entries: readonly Entry[];
}

// ---------------------------------------------------------------------------
// Pure diff computation
// ---------------------------------------------------------------------------

/** Per-model diff record. */
export interface ModelDiff {
  readonly id: string;
  readonly type: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly priceChangeRatio?: number; // max(newIn/oldIn, newOut/oldOut)
  readonly contextWindowChanged?: boolean;
}

export interface DiffSummary {
  readonly totalOld: number;
  readonly totalNew: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
  readonly unchanged: readonly string[];
  readonly perModel: readonly ModelDiff[];
  readonly deletionRate: number; // removed / totalOld, NaN if totalOld === 0
  readonly maxPriceChangeRatio: number; // across all changed entries
}

interface DiffBuckets {
  readonly perModel: ModelDiff[];
  readonly added: string[];
  readonly removed: string[];
  readonly changed: string[];
  readonly unchanged: string[];
  maxRatio: number;
}

function classifyKept(id: string, oldEntry: Entry, newEntry: Entry, buckets: DiffBuckets): void {
  const ratio = priceChangeRatio(oldEntry, newEntry);
  const ctxChanged = oldEntry.contextWindow !== newEntry.contextWindow;
  if (ratio !== undefined && ratio > buckets.maxRatio) buckets.maxRatio = ratio;
  const priceMoved = ratio !== undefined && ratio > 1;
  if (priceMoved || ctxChanged) {
    buckets.changed.push(id);
    buckets.perModel.push({
      id,
      type: 'changed',
      ...(ratio !== undefined ? { priceChangeRatio: ratio } : {}),
      ...(ctxChanged ? { contextWindowChanged: true } : {}),
    });
  } else {
    buckets.unchanged.push(id);
    buckets.perModel.push({ id, type: 'unchanged' });
  }
}

export function computeDiff(oldReg: Registry, newReg: Registry): DiffSummary {
  const oldById = new Map(oldReg.entries.map((e) => [e.id, e] as const));
  const newById = new Map(newReg.entries.map((e) => [e.id, e] as const));
  const buckets: DiffBuckets = {
    perModel: [],
    added: [],
    removed: [],
    changed: [],
    unchanged: [],
    maxRatio: 0,
  };

  for (const [id, newEntry] of newById) {
    const oldEntry = oldById.get(id);
    if (oldEntry === undefined) {
      buckets.added.push(id);
      buckets.perModel.push({ id, type: 'added' });
      continue;
    }
    classifyKept(id, oldEntry, newEntry, buckets);
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) {
      buckets.removed.push(id);
      buckets.perModel.push({ id, type: 'removed' });
    }
  }

  return {
    totalOld: oldReg.entries.length,
    totalNew: newReg.entries.length,
    added: buckets.added,
    removed: buckets.removed,
    changed: buckets.changed,
    unchanged: buckets.unchanged,
    perModel: buckets.perModel,
    deletionRate: oldReg.entries.length === 0 ? 0 : buckets.removed.length / oldReg.entries.length,
    maxPriceChangeRatio: buckets.maxRatio,
  };
}

/**
 * Compares input + output costs, returning the max(new/old) ratio. Uses 1
 * as a floor so zero → non-zero is treated as "new" (ratio 1, not divide
 * by zero). Returns undefined when neither entry has pricing.
 */
function priceChangeRatio(oldEntry: Entry, newEntry: Entry): number | undefined {
  if (oldEntry.pricing === undefined && newEntry.pricing === undefined) return undefined;
  if (oldEntry.pricing === undefined || newEntry.pricing === undefined) return 1;
  const ratios = [
    safeRatio(newEntry.pricing.inputPer1M, oldEntry.pricing.inputPer1M),
    safeRatio(newEntry.pricing.outputPer1M, oldEntry.pricing.outputPer1M),
  ];
  return Math.max(...ratios);
}

function safeRatio(n: number, d: number): number {
  if (d === 0) return n === 0 ? 1 : Number.POSITIVE_INFINITY;
  return Math.abs(n / d);
}

// ---------------------------------------------------------------------------
// Bounded-diff verdict
// ---------------------------------------------------------------------------

export const DELETION_RATE_THRESHOLD = 0.05;
export const PRICE_RATIO_THRESHOLD = 10;

export interface GuardrailVerdict {
  readonly requiresHumanReview: boolean;
  readonly reasons: readonly string[];
}

export function checkGuardrails(summary: DiffSummary): GuardrailVerdict {
  const reasons: string[] = [];
  if (summary.deletionRate > DELETION_RATE_THRESHOLD) {
    reasons.push(
      `deletion rate ${(summary.deletionRate * 100).toFixed(1)}% exceeds ${(DELETION_RATE_THRESHOLD * 100).toFixed(0)}% threshold (${String(summary.removed.length)}/${String(summary.totalOld)} entries removed)`
    );
  }
  if (summary.maxPriceChangeRatio > PRICE_RATIO_THRESHOLD) {
    reasons.push(
      `max price change ratio ${summary.maxPriceChangeRatio.toFixed(2)}x exceeds ${String(PRICE_RATIO_THRESHOLD)}x threshold`
    );
  }
  return { requiresHumanReview: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Markdown summary for PR body
// ---------------------------------------------------------------------------

export function formatDiffMarkdown(summary: DiffSummary, verdict: GuardrailVerdict): string {
  const lines: string[] = [];
  lines.push('## Model registry refresh');
  lines.push('');
  lines.push(`- Total entries: ${String(summary.totalOld)} → ${String(summary.totalNew)}`);
  lines.push(`- Added: ${String(summary.added.length)}`);
  lines.push(`- Removed: ${String(summary.removed.length)}`);
  lines.push(`- Changed: ${String(summary.changed.length)}`);
  lines.push(`- Unchanged: ${String(summary.unchanged.length)}`);
  lines.push(
    `- Deletion rate: ${(summary.deletionRate * 100).toFixed(1)}% (threshold ${(DELETION_RATE_THRESHOLD * 100).toFixed(0)}%)`
  );
  if (summary.maxPriceChangeRatio > 0) {
    lines.push(
      `- Max price change ratio: ${summary.maxPriceChangeRatio.toFixed(2)}x (threshold ${String(PRICE_RATIO_THRESHOLD)}x)`
    );
  }
  lines.push('');
  if (verdict.requiresHumanReview) {
    lines.push('### ⚠ Requires human review');
    for (const reason of verdict.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }
  if (summary.removed.length > 0) {
    lines.push('<details><summary>Removed entries</summary>');
    lines.push('');
    for (const id of summary.removed.slice(0, 100)) lines.push(`- \`${id}\``);
    if (summary.removed.length > 100)
      lines.push(`- …and ${String(summary.removed.length - 100)} more`);
    lines.push('');
    lines.push('</details>');
  }
  if (summary.added.length > 0) {
    lines.push('<details><summary>Added entries</summary>');
    lines.push('');
    for (const id of summary.added.slice(0, 100)) lines.push(`- \`${id}\``);
    if (summary.added.length > 100) lines.push(`- …and ${String(summary.added.length - 100)} more`);
    lines.push('');
    lines.push('</details>');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Script entry
// ---------------------------------------------------------------------------

function readRegistry(path: string): Registry {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  if (
    raw === null ||
    typeof raw !== 'object' ||
    !('entries' in raw) ||
    !Array.isArray(raw.entries)
  ) {
    throw new Error(`${path}: not a valid generated registry (missing entries[])`);
  }
  return raw as Registry;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const paths = args.filter((a) => !a.startsWith('--'));
  const oldPath = paths[0];
  const newPath = paths[1];
  if (oldPath === undefined || newPath === undefined) {
    console.error('usage: check-registry-diff <old.json> <new.json> [--json]');
    process.exit(2);
  }
  const oldReg = readRegistry(oldPath);
  const newReg = readRegistry(newPath);
  const summary = computeDiff(oldReg, newReg);
  const verdict = checkGuardrails(summary);
  if (jsonOut) {
    const output = {
      summary,
      verdict,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(formatDiffMarkdown(summary, verdict));
  }
  process.exit(0);
}
