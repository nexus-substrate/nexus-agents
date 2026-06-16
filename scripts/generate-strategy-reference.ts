#!/usr/bin/env npx tsx
/**
 * Strategy Manifest Reference Generator (#3838, Epic C / M2).
 *
 * Emits the force-strategy reference into the Astro `docs` content collection
 * (`docs/reference/strategies/index.md`) from the SINGLE source of truth — the
 * live strategy-manifest registry (`STRATEGY_MANIFEST_REGISTRY`,
 * `src/orchestration/strategy-manifest-registry.ts`, #3835). Each routable
 * execution strategy gets a row with its entrypoint tool, description,
 * when-to-force guidance, maturity/authority tier, and executor availability.
 *
 * The canonical-`run` PROSE landed via #3548 (run is the default entry point;
 * the specialized pipeline tools are force-strategy escape hatches). This
 * generator supplies the manifest-DERIVED tables + per-strategy when-to-force
 * guidance that complete that story, so the force-strategy docs are generated
 * from the manifest and cannot drift from the router's source of truth.
 *
 * Mirrors scripts/generate-tool-reference.ts (#3687):
 *   - follows the generate + `--check` (drift-gate) two-mode pattern;
 *   - lands in the repo-top-level Astro `docs` collection (requires `title`
 *     frontmatter), excluded from check-docs-indexed / prettier like
 *     docs/reference/tools;
 *   - the data is never hand-written, so it cannot drift.
 *
 * Unlike the tool-reference generator (which parses source statically to avoid a
 * ci-health circular-init hazard in the MCP tool modules), this imports the
 * manifest registry directly: it is a validated, pure-data constant with no
 * cross-module init hazard.
 *
 * Usage:
 *   npx tsx scripts/generate-strategy-reference.ts          # write the reference
 *   npx tsx scripts/generate-strategy-reference.ts --check  # fail if out of date
 *
 * @module scripts/generate-strategy-reference
 * (Source: Issue #3838)
 */

/* eslint-disable no-console */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_ROOT } from './script-paths.js';
import { STRATEGY_MANIFEST_REGISTRY } from '../packages/nexus-agents/src/orchestration/strategy-manifest-registry.js';
import type { StrategyManifest } from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';

const CHECK_MODE = process.argv.includes('--check');
const OUT_DIR = join(DOCS_ROOT, 'reference/strategies');

// ─── Markdown emission ───────────────────────────────────────────────────────

/** YAML-escape a scalar for single-quoted frontmatter. */
function yamlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Escape a string for a single Markdown table cell. The escape character `\`
 * is escaped FIRST (so existing backslashes can't form spurious escapes), then
 * the cell delimiter `|`, then newlines are flattened (they'd break the row).
 */
function escapeCell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Sort manifests stably by strategy name so output is deterministic. */
export function sortedManifests(): StrategyManifest[] {
  return [...STRATEGY_MANIFEST_REGISTRY.manifests].sort((a, b) =>
    a.strategy.localeCompare(b.strategy)
  );
}

/** Human label for the executor-availability flag. */
function executorLabel(available: boolean, long: boolean): string {
  if (long) {
    return available
      ? 'wired (runs inline with `execute:true`)'
      : 'fail-closed (no inline executor wired yet; routing never auto-selects it)';
  }
  return available ? 'wired' : 'fail-closed';
}

/** Frontmatter + intro prose (the canonical-run / force-strategy framing). */
function renderHeader(count: number): string[] {
  return [
    '---',
    `title: ${yamlQuote('Strategy Reference (force-strategy escape hatches)')}`,
    `description: ${yamlQuote(
      `Manifest-generated reference for all ${String(count)} routable execution strategies: entrypoint tool, when to force, maturity/authority tier, executor availability.`
    )}`,
    'tier: 1',
    'keywords: [mcp, strategies, force-strategy, run, orchestration, reference]',
    '---',
    '',
    '# Strategy Reference',
    '',
    '> Auto-generated from the strategy-manifest registry',
    '> (`src/orchestration/strategy-manifest-registry.ts`, the single source of',
    '> truth the router reads). Do not edit by hand — run `pnpm docs:strategies`',
    '> to regenerate.',
    '',
    '[`run`](./../tools/run.md) is the canonical entry point: give it a goal and the',
    'MetaOrchestrator routes to one of these strategies for you. You rarely need to',
    'pick a strategy by hand. The specialized tools below remain available as',
    '**force-strategy escape hatches** — pass `forceStrategy` to `run`, or call the',
    "strategy's entrypoint tool directly — for when you already know exactly which",
    'engine the work needs. Each row tells you when forcing is the right call.',
    '',
    `nexus-agents has **${String(count)} routable execution strategies**.`,
    '',
  ];
}

/** The summary table — one row per manifest. */
function renderTable(manifests: readonly StrategyManifest[]): string[] {
  const lines: string[] = [
    '| Strategy | Entrypoint tool | When to force | Maturity | Authority | Executor |',
    '| -------- | --------------- | ------------- | -------- | --------- | -------- |',
  ];
  for (const m of manifests) {
    lines.push(
      `| \`${escapeCell(m.strategy)}\` ` +
        `| \`${escapeCell(m.entrypointTool)}\` ` +
        `| ${escapeCell(m.whenToForce ?? '—')} ` +
        `| ${escapeCell(m.maturityTier)} ` +
        `| ${escapeCell(m.authorityTier ?? '—')} ` +
        `| ${executorLabel(m.executorAvailable, false)} |`
    );
  }
  lines.push('');
  return lines;
}

/** The per-strategy detail section. */
function renderDetail(manifests: readonly StrategyManifest[]): string[] {
  const lines: string[] = ['## Per-strategy detail', ''];
  for (const m of manifests) {
    lines.push(
      `### \`${m.strategy}\``,
      '',
      m.description,
      '',
      `- **Entrypoint tool:** \`${m.entrypointTool}\``,
      `- **When to force:** ${m.whenToForce ?? '—'}`,
      `- **Maturity tier:** ${m.maturityTier}`,
      `- **Authority tier:** ${m.authorityTier ?? '—'}`,
      `- **Executor:** ${executorLabel(m.executorAvailable, true)}`,
      ''
    );
  }
  return lines;
}

export function renderReferencePage(manifests: readonly StrategyManifest[]): string {
  return [
    ...renderHeader(manifests.length),
    ...renderTable(manifests),
    ...renderDetail(manifests),
  ].join('\n');
}

// ─── Drift detection (for --check) ───────────────────────────────────────────

interface OutFile {
  readonly path: string;
  readonly content: string;
}

function buildOutputs(): OutFile[] {
  const manifests = sortedManifests();
  return [{ path: join(OUT_DIR, 'index.md'), content: renderReferencePage(manifests) }];
}

/** Compare on-disk pages to `outputs`; returns human-readable drift lines. */
function findDrifts(outputs: OutFile[]): string[] {
  const drifts: string[] = [];
  const expected = new Set(outputs.map((o) => o.path));
  // Stale files: anything in OUT_DIR not in the expected set.
  if (existsSync(OUT_DIR)) {
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith('.md') && !expected.has(join(OUT_DIR, f))) {
        drifts.push(`stale (should be removed): ${f}`);
      }
    }
  }
  for (const o of outputs) {
    const current = existsSync(o.path) ? readFileSync(o.path, 'utf-8') : null;
    if (current === null) drifts.push(`missing: ${o.path}`);
    else if (current !== o.content) drifts.push(`out of date: ${o.path}`);
  }
  return drifts;
}

function runCheck(outputs: OutFile[]): void {
  const drifts = findDrifts(outputs);
  if (drifts.length === 0) {
    console.log(`✓ Strategy reference up to date (${String(outputs.length)} files).`);
    process.exit(0);
  }
  console.error(`✗ Strategy reference drift (${String(drifts.length)}):`);
  for (const d of drifts) console.error(`  - ${d}`);
  console.error('  Run "pnpm docs:strategies" to regenerate.');
  process.exit(1);
}

function main(): void {
  const outputs = buildOutputs();
  if (CHECK_MODE) {
    runCheck(outputs);
    return;
  }
  // Clean stale pages then write.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const o of outputs) writeFileSync(o.path, o.content, 'utf-8');
  console.log(`✓ Generated ${String(outputs.length)} strategy-reference file(s) into ${OUT_DIR}`);
}

// Only run when invoked directly (not when imported by the test for its pure
// render/sort helpers).
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
