#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * CLI documentation drift gate (#5142).
 *
 * `docs/ENTRYPOINTS.md` is named canonical for CLI/MCP entry points in
 * CLAUDE.md, and it drifted: it documented 20 commands while
 * `cli-command-catalog.ts` registered 53, and it listed two — `review-demo` and
 * `validation-dashboard` — that do not exist in the catalog at all.
 *
 * `inject-governance.ts` already regenerates ENTRYPOINTS' MCP *tool* tables from
 * source via marker blocks. The CLI *command* table has no markers and no gate,
 * so nothing compared the two lists. That is the #5142 shape: two artifacts
 * asserting the same fact with nothing checking they agree.
 *
 * WHY A CHECK RATHER THAN A GENERATOR. The doc's table carries human-authored
 * subcommand and mode columns that no catalog field supplies, so generating it
 * would lose information. The drift that matters is the NAME SET, and that is
 * mechanically comparable — so this reports names, and a human writes the prose.
 *
 * BASELINE-AWARE, like the repo's three other ratchets (orphan-allowlist,
 * schema-fanout-manifest, tool-distinctness-baseline). Documenting all 53
 * commands is a docs project; blocking on it would strand this gate unmerged.
 * A committed baseline lists the currently-undocumented commands, and CI fails
 * on a NEW undocumented command or a doc entry naming a command that does not
 * exist. The baseline is the debt, visible and countable.
 *
 * Usage:
 *   npx tsx scripts/check-cli-docs-drift.ts            # CI gate
 *   npx tsx scripts/check-cli-docs-drift.ts baseline   # reseed the baseline
 *
 * @module scripts/check-cli-docs-drift
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

const ENTRYPOINTS = join(ROOT, 'docs/ENTRYPOINTS.md');
const CATALOG = join(ROOT, 'packages/nexus-agents/src/cli-command-catalog.ts');
const BASELINE = join(ROOT, 'docs/ops/cli-docs-drift-baseline.json');

interface Baseline {
  readonly undocumented: readonly string[];
}

/** Command names registered in the catalog — the source of truth. */
export function catalogCommands(source: string): readonly string[] {
  return [...source.matchAll(/^\s*command:\s*'([a-z][a-z0-9-]*)'/gm)].map((m) => m[1] ?? '');
}

/**
 * Command names appearing in a leading `| \`name\`` table cell in ENTRYPOINTS.
 *
 * Only the first cell counts: a command referenced in a description is being
 * mentioned, not documented, and crediting that would make this a check that
 * cannot fail.
 */
export function documentedCommands(doc: string): readonly string[] {
  // Scoped to the `## CLI Commands` section. ENTRYPOINTS.md contains several
  // other tables whose first cell is a backticked name — workflow templates
  // (`code-review`, `security-audit`, …), MCP tools, exports. A file-wide scan
  // reported sixteen of those as CLI commands that do not exist, which would
  // have made this gate cry wolf on its first run and get switched off.
  // The command tables run from `## CLI Commands` to `### Mode Selection`.
  // Everything after that heading — mode selection, global options, the options
  // reference — also uses backticked first cells, and scanning it reported
  // `mesh` and `orchestrator` (MODES, not commands) as phantom entries.
  const start = doc.indexOf('\n## CLI Commands');
  if (start === -1) return [];
  const rest = doc.slice(start + 1);
  const modeSel = rest.indexOf('\n### Mode Selection');
  const nextTop = rest.indexOf('\n## ');
  const ends = [modeSel, nextTop].filter((i) => i !== -1);
  const section = ends.length > 0 ? rest.slice(0, Math.min(...ends)) : rest;
  return [...section.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm)].map((m) => m[1] ?? '');
}

export interface DriftReport {
  readonly phantom: readonly string[];
  readonly newlyUndocumented: readonly string[];
  readonly baselinedUndocumented: readonly string[];
}

export function computeDrift(
  catalog: readonly string[],
  documented: readonly string[],
  baseline: Baseline
): DriftReport {
  const inCatalog = new Set(catalog);
  const inDocs = new Set(documented);
  const accepted = new Set(baseline.undocumented);

  // Documented but not registered — always a hard failure. A reader following
  // the doc runs a command that does not exist.
  const phantom = [...inDocs].filter((c) => !inCatalog.has(c)).sort();
  const undocumented = [...inCatalog].filter((c) => !inDocs.has(c)).sort();

  return {
    phantom,
    newlyUndocumented: undocumented.filter((c) => !accepted.has(c)),
    baselinedUndocumented: undocumented.filter((c) => accepted.has(c)),
  };
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE)) return { undocumented: [] };
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

function main(): void {
  const mode = process.argv[2] ?? 'check';
  const catalog = catalogCommands(readFileSync(CATALOG, 'utf8'));
  const documented = documentedCommands(readFileSync(ENTRYPOINTS, 'utf8'));

  if (catalog.length === 0) {
    console.error('cli-docs-drift: parsed ZERO commands from the catalog — the parser is broken.');
    console.error('Failing rather than reporting a clean diff over an empty set.');
    process.exit(1);
  }

  if (mode === 'baseline') {
    const undocumented = catalog.filter((c) => !documented.includes(c)).sort();
    writeFileSync(BASELINE, `${JSON.stringify({ undocumented }, null, 2)}\n`);
    console.log(`cli-docs-drift: baseline reseeded with ${String(undocumented.length)} entries.`);
    return;
  }

  const drift = computeDrift(catalog, documented, loadBaseline());
  let failed = false;

  if (drift.phantom.length > 0) {
    failed = true;
    console.error('docs/ENTRYPOINTS.md documents commands that do NOT exist in the catalog:');
    for (const c of drift.phantom) console.error(`  - ${c}`);
    console.error('  Remove the row, or add the command. A reader following the doc gets nothing.');
  }

  if (drift.newlyUndocumented.length > 0) {
    failed = true;
    console.error('\nNEW commands missing from docs/ENTRYPOINTS.md:');
    for (const c of drift.newlyUndocumented) console.error(`  - ${c}`);
    console.error('  Document them, or reseed: npx tsx scripts/check-cli-docs-drift.ts baseline');
  }

  console.log(
    `cli-docs-drift: ${String(catalog.length)} registered, ${String(documented.length)} documented, ` +
      `${String(drift.baselinedUndocumented.length)} baselined as undocumented debt.`
  );
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('check-cli-docs-drift.ts') === true) main();
