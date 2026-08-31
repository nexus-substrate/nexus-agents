#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Tool-Description Distinctness Lint (#2650)
 *
 * Computes pairwise lexical similarity (TF-IDF + cosine) across the 38 MCP
 * tool descriptions and flags pairs that are insufficiently distinct.
 * Insufficiently-distinct descriptions cause routing misses — Claude /
 * Codex / Gemini disambiguate among tools primarily by description text.
 *
 * IMPORTANT — this is a LEXICAL overlap heuristic, a cheap proxy for "would
 * an LLM router confuse these," NOT a semantic-similarity measure. Flagged
 * pairs get human review; the fix is a rename OR a clearer description,
 * decided case-by-case (#2650).
 *
 * Gate behaviour mirrors the repo's other baseline-aware gates
 * (orphan-allowlist.json, schema-fanout-manifest.json): a committed
 * baseline lists the currently-accepted overlapping pairs; CI fails only on
 * a NEW pair at/above threshold or a baseline pair whose similarity rose
 * past the tolerance. This keeps `main` green while catching regressions.
 *
 * Usage:
 *   npx tsx scripts/check-tool-distinctness.ts            # CI gate (check)
 *   npx tsx scripts/check-tool-distinctness.ts check      # same
 *   npx tsx scripts/check-tool-distinctness.ts report     # regen v1 report
 *   npx tsx scripts/check-tool-distinctness.ts baseline   # reseed baseline
 *
 * @module scripts/check-tool-distinctness
 * (Source: Issue #2650, Epic A #2651)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';
import { TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';

const BASELINE_PATH = join(ROOT, 'docs/ops/tool-distinctness-baseline.json');
const REPORT_PATH = join(ROOT, 'docs/research/mcp-tool-distinctness-v1.md');

/**
 * Low-signal tokens dropped before TF-IDF: common English function words
 * plus MCP-description boilerplate ("returns", "optional", "tool", …).
 * IDF already down-weights terms common across the corpus; this removes
 * the residual noise the contrarian reviewer flagged on the #2650 vote.
 */
const STOPWORDS = new Set<string>([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'for',
  'with',
  'in',
  'on',
  'by',
  'as',
  'at',
  'is',
  'are',
  'be',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'from',
  'into',
  'via',
  'if',
  'when',
  'each',
  'all',
  'any',
  'per',
  'not',
  'returns',
  'return',
  'optional',
  'tool',
  'tools',
  'use',
  'used',
  'using',
  'given',
  'based',
  'etc',
  'their',
  'them',
  'which',
  'new',
  'run',
  'runs',
  'get',
  'gets',
  'accepts',
  'supports',
  'support',
  'one',
  'three',
  'five',
]);

// ============================================================================
// TF-IDF + cosine (pure functions)
// ============================================================================

/** Lowercase, split on non-alphanumerics, drop short / numeric / stopword tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

/** TF-IDF vectors for a corpus keyed by document id. */
export function computeTfIdf(corpus: Record<string, string[]>): Map<string, Map<string, number>> {
  const ids = Object.keys(corpus);
  const docFreq = new Map<string, number>();
  for (const id of ids) {
    for (const term of new Set(corpus[id])) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const n = ids.length;
  const vectors = new Map<string, Map<string, number>>();
  for (const id of ids) {
    const tokens = corpus[id] ?? [];
    const counts = new Map<string, number>();
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [term, count] of counts) {
      const idf = Math.log(n / (docFreq.get(term) ?? 1));
      vec.set(term, count * idf);
    }
    vectors.set(id, vec);
  }
  return vectors;
}

/** Cosine similarity between two sparse TF-IDF vectors (0..1). */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other !== undefined) dot += weight * other;
  }
  const magA = Math.sqrt([...a.values()].reduce((s, w) => s + w * w, 0));
  const magB = Math.sqrt([...b.values()].reduce((s, w) => s + w * w, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

export interface PairScore {
  a: string;
  b: string;
  similarity: number;
}

/** Round to 3 decimals so float noise never moves a comparison. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** All tool pairs ranked by descending description similarity. */
export function rankPairs(descriptions: Record<string, string>): PairScore[] {
  const corpus: Record<string, string[]> = {};
  for (const [name, desc] of Object.entries(descriptions)) corpus[name] = tokenize(desc);
  const vectors = computeTfIdf(corpus);
  const names = Object.keys(descriptions).sort();
  const pairs: PairScore[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i] as string;
      const b = names[j] as string;
      const empty = new Map<string, number>();
      const sim = cosineSimilarity(vectors.get(a) ?? empty, vectors.get(b) ?? empty);
      pairs.push({ a, b, similarity: round3(sim) });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

// ============================================================================
// Baseline-aware gate
// ============================================================================

export interface Baseline {
  /** Self-documenting note; ignored on load, emitted on regeneration. */
  _comment?: string;
  threshold: number;
  tolerance: number;
  pairs: PairScore[];
}

const BASELINE_COMMENT =
  'Accepted overlapping MCP tool-description pairs (#2650). `check:tool-distinctness` ' +
  'fails CI on a NEW pair >= threshold or a baseline pair whose similarity rose past ' +
  'tolerance. To accept a new pair, add it here with a tracking issue; to reseed, run ' +
  '`npx tsx scripts/check-tool-distinctness.ts baseline <threshold>`.';

export interface DistinctnessResult {
  ok: boolean;
  /** Every pair at/above the threshold. */
  flagged: PairScore[];
  /** Flagged pairs not present in the baseline — these fail CI. */
  newOffenders: PairScore[];
  /** Baseline pairs whose similarity rose past the tolerance — these fail CI. */
  regressions: PairScore[];
  /** Full ranked list, for the v1 report. */
  allRanked: PairScore[];
}

/** Canonical key for a pair, order-independent. */
function pairKey(p: { a: string; b: string }): string {
  return [p.a, p.b].sort().join('|');
}

/** Run the distinctness check against a baseline. */
export function runDistinctnessCheck(
  descriptions: Record<string, string>,
  baseline: Baseline
): DistinctnessResult {
  const allRanked = rankPairs(descriptions);
  const flagged = allRanked.filter((p) => p.similarity >= baseline.threshold);
  const baselineByKey = new Map(baseline.pairs.map((p) => [pairKey(p), p]));
  const newOffenders: PairScore[] = [];
  const regressions: PairScore[] = [];
  for (const pair of flagged) {
    const known = baselineByKey.get(pairKey(pair));
    if (known === undefined) {
      newOffenders.push(pair);
    } else if (pair.similarity > known.similarity + baseline.tolerance) {
      regressions.push(pair);
    }
  }
  return {
    ok: newOffenders.length === 0 && regressions.length === 0,
    flagged,
    newOffenders,
    regressions,
    allRanked,
  };
}

/**
 * Threshold used when the committed baseline is absent or omits one.
 *
 * This was `1.1`, and flagging is `similarity >= threshold` over **cosine
 * similarity, which is bounded at 1.0** — so the fallback was unreachable by
 * construction. `flagged` was always empty, `ok` was always true, and the gate
 * printed "0 pair(s) at/above threshold 1.1" and exited 0 from the required
 * `lint` job. A reviewer read that green mark as "tool descriptions were
 * compared"; nothing had been.
 *
 * `0.5` is the value the committed baseline has carried since #2676, so a
 * missing or key-less baseline now behaves like the checked-in one rather than
 * like a disabled gate. A test pins that this stays reachable.
 */
export const DEFAULT_THRESHOLD = 0.5;

/** Drift tolerance applied when the baseline omits one. */
export const DEFAULT_TOLERANCE = 0.03;

/**
 * Apply defaults to a parsed (or absent) baseline.
 *
 * Split out from `loadBaseline` so both fallback paths — no file at all, and a
 * file missing keys — are exercised by the same tested function. They carried
 * the unreachable `1.1` separately, so fixing one would have left the other.
 */
export function normalizeBaseline(parsed: Partial<Baseline> | undefined): Baseline {
  return {
    threshold: parsed?.threshold ?? DEFAULT_THRESHOLD,
    tolerance: parsed?.tolerance ?? DEFAULT_TOLERANCE,
    pairs: parsed?.pairs ?? [],
  };
}

/** Load the committed baseline, or a permissive empty one if absent. */
export function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) return normalizeBaseline(undefined);
  return normalizeBaseline(JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Partial<Baseline>);
}

// ============================================================================
// Report + baseline generation
// ============================================================================

/** Render the v1 distinctness report markdown. */
function renderReport(result: DistinctnessResult, baseline: Baseline): string {
  const lines: string[] = [];
  lines.push('# MCP Tool-Description Distinctness — v1', '');
  lines.push(
    'Auto-generated by `scripts/check-tool-distinctness.ts` (#2650). Pairwise',
    'TF-IDF + cosine similarity across the 38 registered MCP tool descriptions.',
    '',
    '**This is a lexical overlap heuristic** — a cheap proxy for "would an LLM',
    'router confuse these tools," not a semantic-similarity measure. Flagged',
    'pairs need human review; the fix is a rename OR a clearer description,',
    'decided case-by-case.',
    '',
    `Threshold: \`${String(baseline.threshold)}\` · tolerance: \`${String(baseline.tolerance)}\` · ` +
      `pairs at/above threshold: ${String(result.flagged.length)} of ${String(result.allRanked.length)}.`,
    ''
  );
  lines.push('## Flagged pairs (at/above threshold)', '');
  if (result.flagged.length === 0) {
    lines.push('_None._', '');
  } else {
    lines.push('| Tool A | Tool B | Similarity | Tracked |', '|---|---|---|---|');
    const baselineKeys = new Set(baseline.pairs.map((p) => pairKey(p)));
    for (const p of result.flagged) {
      const tracked = baselineKeys.has(pairKey(p)) ? 'baseline' : '**NEW**';
      lines.push(`| \`${p.a}\` | \`${p.b}\` | ${p.similarity.toFixed(3)} | ${tracked} |`);
    }
    lines.push('');
  }
  lines.push('## Top 25 ranked pairs', '');
  lines.push('| Tool A | Tool B | Similarity |', '|---|---|---|');
  for (const p of result.allRanked.slice(0, 25)) {
    lines.push(`| \`${p.a}\` | \`${p.b}\` | ${p.similarity.toFixed(3)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Build a baseline JSON seeded from the current flagged pairs. */
function buildBaseline(descriptions: Record<string, string>, threshold: number): Baseline {
  const ranked = rankPairs(descriptions);
  return {
    _comment: BASELINE_COMMENT,
    threshold,
    tolerance: 0.03,
    pairs: ranked.filter((p) => p.similarity >= threshold),
  };
}

// ============================================================================
// CLI
// ============================================================================

function cliCheck(): number {
  const baseline = loadBaseline();
  const result = runDistinctnessCheck(TOOL_DESCRIPTIONS, baseline);
  if (result.ok) {
    console.log(
      `Tool distinctness OK — ${String(result.flagged.length)} pair(s) at/above ` +
        `threshold ${String(baseline.threshold)}, all in baseline.`
    );
    return 0;
  }
  if (result.newOffenders.length > 0) {
    console.error('Tool-description distinctness regression — NEW overlapping pair(s) (#2650):');
    for (const p of result.newOffenders) {
      console.error(`  - ${p.a} <-> ${p.b}  (similarity ${p.similarity.toFixed(3)})`);
    }
    console.error('  Make the descriptions more distinct, or — if intentional — add the pair to');
    console.error(`  docs/ops/tool-distinctness-baseline.json with a tracking issue.`);
  }
  if (result.regressions.length > 0) {
    console.error('Tool-description distinctness regression — baseline pair(s) grew more similar:');
    for (const p of result.regressions) {
      console.error(`  - ${p.a} <-> ${p.b}  (similarity ${p.similarity.toFixed(3)})`);
    }
  }
  return 1;
}

function cliReport(): number {
  const baseline = loadBaseline();
  const result = runDistinctnessCheck(TOOL_DESCRIPTIONS, baseline);
  writeFileSync(REPORT_PATH, renderReport(result, baseline));
  console.log(`Wrote ${REPORT_PATH}`);
  return 0;
}

function cliBaseline(): number {
  const threshold = Number(process.argv[3] ?? '0.5');
  const baseline = buildBaseline(TOOL_DESCRIPTIONS, threshold);
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `Wrote ${BASELINE_PATH} — threshold ${String(threshold)}, ` +
      `${String(baseline.pairs.length)} pair(s).`
  );
  return 0;
}

// Guard the CLI so the test file can import the pure functions without
// triggering a run (mirrors the pattern other importable scripts use).
if (process.argv[1]?.endsWith('check-tool-distinctness.ts') === true) {
  const command = process.argv[2] ?? 'check';
  const exitCode =
    command === 'report' ? cliReport() : command === 'baseline' ? cliBaseline() : cliCheck();
  process.exit(exitCode);
}
