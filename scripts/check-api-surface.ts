#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Public API surface gate (#4749).
 *
 * Diffs the current surface against the committed snapshot. A change is not an
 * error — it is a prompt to decide the semver level deliberately, which is the
 * step that was missing when #4736 shipped a `number | null` widening as a
 * patch and when #4744 claimed a publicly-reachable type was internal.
 *
 * The gate deliberately does NOT classify severity. It cannot know whether a
 * removed symbol was load-bearing for a downstream consumer, and a gate that
 * guessed would be trusted more than it deserves. It reports what moved and
 * makes a human look.
 *
 * Usage:
 *   npx tsx scripts/check-api-surface.ts          # verify
 *   pnpm api:surface                              # regenerate the snapshot
 *
 * @module scripts/check-api-surface
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { COLLISION_HEADER } from './extract-api-surface.js';

const SNAPSHOT = join(process.cwd(), 'api-surface.txt');

/**
 * Splits a surface into `symbol -> its block of member lines`.
 *
 * Per-SYMBOL, not per-line. A global line-set diff silently misses a member
 * change whenever the same line text exists under another symbol — the first
 * version of this gate reported "unchanged" for the #4744 widening because
 * `tokensUsed?: number | undefined` already appeared under `StepResult`. A
 * member line only means something inside its declaration.
 */
function parseBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let current: string | undefined;
  let lines: string[] = [];
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      if (current !== undefined) blocks.set(current, lines.join('\n'));
      current = line;
      lines = [];
    } else {
      lines.push(line);
    }
  }
  if (current !== undefined) blocks.set(current, lines.join('\n'));
  return blocks;
}

/** Member lines present in `body` but not in `other`, tagged with their symbol. */
function changedLines(symbol: string, body: string, other: string): string[] {
  const otherLines = other.split('\n');
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !otherLines.includes(line))
    .map((line) => `${symbol} >${line}`);
}

/** Symbols whose declaration or members changed. Exported for testing. */
export function diffSurface(
  committed: string,
  current: string
): { added: string[]; removed: string[] } {
  const before = parseBlocks(committed);
  const after = parseBlocks(current);
  const added: string[] = [];
  const removed: string[] = [];

  for (const [symbol, body] of after) {
    const prior = before.get(symbol);
    if (prior === undefined) {
      added.push(`${symbol}  [new symbol]`);
    } else if (prior !== body) {
      const lines = changedLines(symbol, body, prior);
      // Fail safe: `changedLines` compares membership, so a change in how many
      // times an identical line appears yields nothing. The blocks differ, so
      // say so rather than reporting "unchanged".
      added.push(...(lines.length > 0 ? lines : [`${symbol}  [block changed]`]));
    }
  }
  for (const [symbol, body] of before) {
    const now = after.get(symbol);
    if (now === undefined) removed.push(`${symbol}  [symbol gone]`);
    else if (now !== body) removed.push(...changedLines(symbol, body, now));
  }
  return { added, removed };
}

/**
 * The cross-module collision count carried in the snapshot header, or `null`
 * when the header is absent.
 *
 * `null` is distinct from `0` on purpose. A missing header means the file was
 * generated before the count existed, or by an extractor that stopped emitting
 * it — either way the ratchet has nothing to compare and must say so rather
 * than reading absence as "no collisions".
 */
export function collisionCountOf(text: string): number | null {
  for (const line of text.split('\n')) {
    if (!line.startsWith(COLLISION_HEADER)) continue;
    const parsed = Number.parseInt(line.slice(COLLISION_HEADER.length).trim(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * The collision ratchet (#5224): the number of names declared in more than one
 * module may go DOWN or stay level, never up.
 *
 * Until #5224 the extractor fused those declarations into a single entry whose
 * members came from both, so the snapshot described a type no source file
 * contains and this gate diffed against it. They are now reported separately.
 * The ratchet is what stops the list growing back while the underlying
 * duplication (#5125, #5129) is worked through.
 *
 * It fires TODAY, on the next collision introduced — it is not waiting on the
 * count reaching zero. When it does reach zero, turning this into a flat
 * refusal is a one-line change.
 *
 * Returns a problem description, or `null` when the ratchet holds.
 */
export function checkCollisionRatchet(committed: string, current: string): string | null {
  const now = collisionCountOf(current);
  if (now === null) {
    return (
      `The generated surface carries no "${COLLISION_HEADER.trim()}" header. ` +
      'The ratchet cannot compare anything, so it cannot fail — which makes it not a check. ' +
      'Restore the header in scripts/extract-api-surface.ts (#5224).'
    );
  }
  const before = collisionCountOf(committed);
  if (before === null) {
    return (
      `api-surface.txt predates the collision header (#5224). ` +
      'Regenerate it once with `pnpm api:surface` to set the baseline.'
    );
  }
  if (now > before) {
    return (
      `Cross-module name collisions rose from ${String(before)} to ${String(now)}. ` +
      'A name declared in two modules makes the published surface ambiguous and used to ' +
      'be reported as one fused declaration. Rename one side, or reduce the count elsewhere ' +
      'before adding this one.'
    );
  }
  return null;
}

/** Header lines carry a symbol count that changes on almost every edit. */
function withoutHeader(text: string): string {
  return text
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n');
}

function main(): void {
  if (!existsSync(SNAPSHOT)) {
    console.error(`Missing ${SNAPSHOT}. Generate it with: pnpm api:surface`);
    process.exit(1);
  }

  const current = execFileSync('npx', ['tsx', 'scripts/extract-api-surface.ts'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const committed = readFileSync(SNAPSHOT, 'utf8');

  const ratchet = checkCollisionRatchet(committed, current);
  if (ratchet !== null) {
    console.error(`Public API surface: ${ratchet}\n`);
    process.exit(1);
  }

  const { added, removed } = diffSurface(withoutHeader(committed), withoutHeader(current));

  if (added.length === 0 && removed.length === 0) {
    console.log('Public API surface unchanged.');
    return;
  }

  console.error('Public API surface changed.\n');
  const show = (label: string, lines: string[]): void => {
    if (lines.length === 0) return;
    console.error(`${label} (${String(lines.length)}):`);
    for (const line of lines.slice(0, 40)) console.error(`  ${line}`);
    if (lines.length > 40) console.error(`  … ${String(lines.length - 40)} more`);
    console.error('');
  };
  show('REMOVED or CHANGED FROM', removed);
  show('ADDED or CHANGED TO', added);

  console.error('Decide the semver level, then update the snapshot:');
  console.error('  pnpm api:surface && git add api-surface.txt\n');
  console.error('Guidance — a removed symbol, a widened union or return type,');
  console.error('or a required field becoming optional is BREAKING for readers.');
  console.error('Additive optional fields and new symbols are minor.');
  console.error('This gate reports the change; it does not classify it.');
  process.exit(1);
}

if (process.argv[1]?.endsWith('check-api-surface.ts') === true) main();
