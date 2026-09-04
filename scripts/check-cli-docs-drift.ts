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
 * WHY THIS STILL EXISTS NOW THAT THE TABLE IS GENERATED (#5458). The catalog
 * carries only a name and a description, so `inject-governance.ts` generates
 * exactly those two columns between `GOVERNANCE:ENTRYPOINTS_CLI` markers; the
 * hand-written subcommand/mode table stays outside them. Two gaps remain that
 * the generator's own staleness check cannot see:
 *
 * - A PHANTOM row in the hand-maintained table — a first cell naming a command
 *   that is not in the catalog. That is how `review-demo` and
 *   `validation-dashboard` got in. Always a hard failure.
 * - A MISSING command. The generator soft-skips when its markers are absent, so
 *   deleting the marker block would silently stop the tables regenerating. Any
 *   catalog command with no row in the section fails here.
 *
 * The 34-entry baseline this gate shipped with (#5142) retired with the
 * generator: an undocumented command is no longer accepted debt, it is a gate
 * failure. Both directions of the name-set comparison are hard.
 *
 * Usage:
 *   npx tsx scripts/check-cli-docs-drift.ts            # CI gate
 *
 * @module scripts/check-cli-docs-drift
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';
import { parseCommandCatalog } from './parse-cli-command-catalog.js';

const ENTRYPOINTS = join(ROOT, 'docs/ENTRYPOINTS.md');
const CATALOG = join(ROOT, 'packages/nexus-agents/src/cli-command-catalog.ts');

/**
 * Command names registered in the catalog — the source of truth. Read through
 * the same AST parser the generator uses (#5458), so the two cannot disagree
 * about what the catalog contains. `(default)` is a `--help` placeholder, not a
 * typed command, and `documentedCommands` cannot match it either.
 */
export function catalogCommands(source: string): readonly string[] {
  return parseCommandCatalog(source)
    .map((e) => e.command)
    .filter((c) => c !== '(default)');
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
  readonly undocumented: readonly string[];
}

export function computeDrift(
  catalog: readonly string[],
  documented: readonly string[]
): DriftReport {
  const inCatalog = new Set(catalog);
  const inDocs = new Set(documented);

  // Documented but not registered — a reader following the doc runs a command
  // that does not exist. Registered but not documented — the generated block
  // is missing or its markers were removed. Both are hard failures.
  return {
    phantom: [...inDocs].filter((c) => !inCatalog.has(c)).sort(),
    undocumented: [...inCatalog].filter((c) => !inDocs.has(c)).sort(),
  };
}

function main(): void {
  const catalog = catalogCommands(readFileSync(CATALOG, 'utf8'));
  const documented = documentedCommands(readFileSync(ENTRYPOINTS, 'utf8'));

  if (catalog.length === 0) {
    console.error('cli-docs-drift: parsed ZERO commands from the catalog — the parser is broken.');
    console.error('Failing rather than reporting a clean diff over an empty set.');
    process.exit(1);
  }

  const drift = computeDrift(catalog, documented);
  let failed = false;

  if (drift.phantom.length > 0) {
    failed = true;
    console.error('docs/ENTRYPOINTS.md documents commands that do NOT exist in the catalog:');
    for (const c of drift.phantom) console.error(`  - ${c}`);
    console.error('  Remove the row, or add the command. A reader following the doc gets nothing.');
  }

  if (drift.undocumented.length > 0) {
    failed = true;
    console.error('\nCatalog commands with no row in docs/ENTRYPOINTS.md:');
    for (const c of drift.undocumented) console.error(`  - ${c}`);
    console.error(
      '  The CLI tables are generated between GOVERNANCE:ENTRYPOINTS_CLI markers; ' +
        'run `pnpm governance:inject` and check the markers are still present.'
    );
  }

  console.log(
    `cli-docs-drift: ${String(catalog.length)} registered, ${String(documented.length)} documented, ` +
      `${String(drift.phantom.length)} phantom, ${String(drift.undocumented.length)} undocumented.`
  );
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('check-cli-docs-drift.ts') === true) main();
