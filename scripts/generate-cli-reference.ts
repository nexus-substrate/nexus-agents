/**
 * Generate the CLI reference from the same catalog parser as the CLI docs gate.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-cli-reference.ts
 *   pnpm exec tsx scripts/generate-cli-reference.ts --check
 *
 * @module scripts/generate-cli-reference
 * (Source: Issue #7200)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCommandCatalog } from './parse-cli-command-catalog.js';
import { ROOT } from './script-paths.js';

const SOURCE_PATH = 'packages/nexus-agents/src/cli-command-catalog.ts';
const OUTPUT_PATH = 'docs/reference/cli.md';

/** Keep a description within a single Markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Angle-bracket placeholders in catalog prose must render as text. */
function escapeDescription(value: string): string {
  return escapeCell(value)
    .split(/(`[^`]*`)/g)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    )
    .join('');
}

/** Render the complete catalog, including its default and internal entries. */
export function renderCliReference(source: string): string {
  const entries = parseCommandCatalog(source);
  if (entries.length === 0) {
    throw new Error('CLI reference: COMMAND_CATALOG is missing or empty; refusing an empty page.');
  }
  entries.sort((a, b) => (a.command < b.command ? -1 : a.command > b.command ? 1 : 0));
  return [
    '---',
    "title: 'CLI Reference'",
    "description: 'Generated reference for every nexus-agents CLI command, audience, and description.'",
    'diataxis: reference',
    'tier: 1',
    'keywords: [cli, commands, catalog, reference]',
    'related_files: [docs/ENTRYPOINTS.md, docs/reference/environment.md]',
    '---',
    '',
    '# CLI Reference',
    '',
    `> Generated from ${SOURCE_PATH} — do not edit by hand`,
    '',
    'Regenerate with `pnpm exec tsx scripts/generate-cli-reference.ts`.',
    '',
    'The catalog includes the no-argument `(default)` invocation and internal commands.',
    'Run `nexus-agents <command> --help` for command options.',
    '',
    '| Command | Audience | Description |',
    '| ------- | -------- | ----------- |',
    ...entries.map(
      (entry) =>
        `| \`${escapeCell(entry.command)}\` | ${escapeCell(entry.audience)} | ${escapeDescription(entry.description)} |`
    ),
    '',
  ].join('\n');
}

function main(): void {
  try {
    const output = renderCliReference(readFileSync(join(ROOT, SOURCE_PATH), 'utf8'));
    const target = join(ROOT, OUTPUT_PATH);
    if (process.argv.includes('--check')) {
      const current = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
      if (current !== output) {
        console.error(
          `CLI reference drift: ${current === undefined ? 'missing' : 'out of date'} ${OUTPUT_PATH}`
        );
        console.error('Run "pnpm exec tsx scripts/generate-cli-reference.ts" to regenerate.');
        process.exitCode = 1;
        return;
      }
      console.log(`CLI reference up to date: ${OUTPUT_PATH}`);
      return;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output, 'utf8');
    console.log(`Generated CLI reference: ${OUTPUT_PATH}`);
  } catch (error: unknown) {
    console.error(
      `CLI reference generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
