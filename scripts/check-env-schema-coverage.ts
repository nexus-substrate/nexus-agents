#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Env-schema coverage gate — the reverse direction of #4722 (#5142).
 *
 * `config/env-schema.ts` validates every `NEXUS_*` variable at startup and
 * reports an unrecognized name as unknown, with a typo suggestion. The #4722
 * test guards ONE direction: every variable the docs tell people to set must be
 * registered. Nothing guarded the other direction — a variable the CODE READS
 * but the schema does not know.
 *
 * That gap is user-visible, and it inverts the feature's purpose. A correctly
 * spelled variable that production code genuinely reads gets reported to the
 * user as an unknown name with a suggestion to change it to something else.
 * The typo-detector accuses the user of a typo they did not make. A sweep on
 * 2026-08-29 found real instances, including `NEXUS_MCP_DEPTH`, read at
 * `codex-mcp-adapter-helpers.ts` and registered nowhere.
 *
 * WHY LITERALS, NOT `process.env` ACCESSES. The package reads env vars three
 * ways: `process.env.X` directly, `process.env[CONST]` where a named constant
 * holds the literal (`const NEXUS_MCP_DEPTH_ENV = 'NEXUS_MCP_DEPTH'`), and
 * `env['X']` on an injected environment object. Only the first is visible to a
 * `process.env` scan — it sees 38 of the 115 literals in this package. Keying
 * on the string literal is what makes the check able to fail.
 *
 * BASELINE-AWARE, like the repo's other ratchets (orphan-allowlist,
 * schema-fanout-manifest, tool-distinctness-baseline, cli-docs-drift). Two
 * lists, deliberately distinct:
 *
 *   - `intentional` — literals that must NEVER be registered, each with a
 *     reason. Typo fixtures (`NEXUS_V2_DELEATE` exists to prove the suggester
 *     recovers the real name) and vars owned by another process belong here.
 *     Registering one would break the test that depends on it being unknown.
 *   - `debt` — real variables not yet registered. These SHOULD be registered;
 *     the list is the visible, countable backlog.
 *
 * Collapsing the two would hide the difference between "cannot be fixed" and
 * "not fixed yet", which is the distinction a reader of the baseline needs.
 *
 * Usage:
 *   npx tsx scripts/check-env-schema-coverage.ts            # CI gate
 *   npx tsx scripts/check-env-schema-coverage.ts baseline   # reseed `debt`
 *
 * @module scripts/check-env-schema-coverage
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './script-paths.js';

const SRC = join(ROOT, 'packages/nexus-agents/src');
const SCHEMA = join(SRC, 'config/env-schema.ts');
const BASELINE = join(ROOT, 'docs/ops/env-schema-coverage-baseline.json');

interface Baseline {
  /** Literals that must never be registered, keyed to the reason why. */
  readonly intentional: Readonly<Record<string, string>>;
  /** Real variables awaiting registration — visible debt. */
  readonly debt: readonly string[];
}

/** One `NEXUS_*` literal and where it was found. */
export interface EnvUse {
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

/**
 * Matches, in priority order: a line comment, a block comment, or a string
 * literal. Scanning all three in one alternation is what keeps `//` inside a
 * string (`'http://…'`) from being read as a comment.
 */
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * Remove comments so a var merely DESCRIBED in prose is not counted as read.
 *
 * Without this the gate flags every JSDoc block that names a removed variable,
 * which is exactly the false-positive class that made `check-cli-docs-drift`
 * fire twice on non-commands. String literals are preserved; only `//` and
 * block comments are blanked, and the newlines inside a block comment are kept
 * so reported line numbers stay accurate.
 */
export function stripComments(source: string): string {
  return source.replace(TOKEN, (match) => {
    if (match.startsWith('//')) return '';
    // Blank the block comment but keep its newlines so line numbers stay true.
    if (match.startsWith('/*')) return match.replace(/[^\n]/g, '');
    return match; // a string literal — preserved
  });
}

/**
 * Every `NEXUS_*` literal read in one source file.
 *
 * Matches quoted literals (`'NEXUS_X'`, `"NEXUS_X"`) and the bare dotted access
 * `process.env.NEXUS_X`, which carries no quotes.
 */
export function envUsesInFile(source: string, file: string): readonly EnvUse[] {
  const code = stripComments(source);
  const uses: EnvUse[] = [];
  const lines = code.split('\n');

  lines.forEach((text, idx) => {
    const patterns = [/['"](NEXUS_[A-Z0-9_]+)['"]/g, /process\.env\.(NEXUS_[A-Z0-9_]+)/g];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        const name = m[1];
        if (name !== undefined) uses.push({ name, file, line: idx + 1 });
      }
    }
  });

  return uses;
}

/** Recursively collect non-test `.ts` files, skipping the schema itself. */
export function collectSourceFiles(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    if (entry.includes('.test.') || entry.includes('.spec.')) continue;
    if (full === SCHEMA) continue; // the registry is not a consumer
    out.push(full);
  }
  return out;
}

/** Names the schema registers, read from its source. */
export function registeredNames(schemaSource: string): readonly string[] {
  // Declared as unquoted Zod object keys: `NEXUS_TIMEOUT_CLI: positiveIntStr...`.
  // Commented-out names must not count as registered, so strip comments first.
  const code = stripComments(schemaSource);
  return [...new Set([...code.matchAll(/^\s*(NEXUS_[A-Z0-9_]+)\s*:/gm)].map((m) => m[1] ?? ''))];
}

export interface Coverage {
  /** Unregistered, unbaselined, and genuinely read — the failure set. */
  readonly newlyUnregistered: readonly EnvUse[];
  /** Baselined debt still present. */
  readonly knownDebt: readonly string[];
  /** Baseline entries no longer read anywhere — the baseline has gone stale. */
  readonly staleBaseline: readonly string[];
}

export function computeCoverage(
  uses: readonly EnvUse[],
  registered: readonly string[],
  baseline: Baseline
): Coverage {
  const known = new Set(registered);
  const intentional = new Set(Object.keys(baseline.intentional));
  const debt = new Set(baseline.debt);

  const newlyUnregistered = uses.filter(
    (u) => !known.has(u.name) && !intentional.has(u.name) && !debt.has(u.name)
  );

  const seen = new Set(uses.map((u) => u.name));
  const staleBaseline = [...debt, ...intentional].filter((n) => !seen.has(n)).sort();

  return {
    newlyUnregistered,
    knownDebt: [...debt].filter((n) => seen.has(n)).sort(),
    staleBaseline,
  };
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE)) return { intentional: {}, debt: [] };
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

/** Prints every failure mode; returns true when the gate should fail. */
function reportCoverage(cov: Coverage): boolean {
  let failed = false;

  if (cov.newlyUnregistered.length > 0) {
    failed = true;
    console.error('NEXUS_* variables read in src but NOT registered in config/env-schema.ts:');
    for (const u of cov.newlyUnregistered) {
      console.error(`  - ${u.name}  (${u.file}:${String(u.line)})`);
    }
    console.error(
      '\n  Startup validation will report each of these as an unknown variable and\n' +
        '  suggest a different name, even when the user spelled it correctly.\n' +
        '  Register it in env-schema.ts, or add it to the baseline with a reason:\n' +
        '    npx tsx scripts/check-env-schema-coverage.ts baseline'
    );
  }

  if (cov.staleBaseline.length > 0) {
    failed = true;
    console.error('\nBaseline entries no longer read anywhere (remove them):');
    for (const n of cov.staleBaseline) console.error(`  - ${n}`);
  }

  return failed;
}

function main(): void {
  const mode = process.argv[2];
  const files = collectSourceFiles(SRC);
  const uses = files.flatMap((f) => envUsesInFile(readFileSync(f, 'utf8'), relative(ROOT, f)));
  const registered = registeredNames(readFileSync(SCHEMA, 'utf8'));

  // A parser that finds nothing would pass silently forever.
  if (registered.length === 0 || uses.length === 0) {
    console.error(
      `env-schema-coverage: parsed ${String(registered.length)} registered names and ` +
        `${String(uses.length)} uses across ${String(files.length)} files. ` +
        'Zero on either side means the parser broke, not that the repo is clean.'
    );
    process.exit(1);
  }

  const baseline = loadBaseline();

  if (mode === 'baseline') {
    const known = new Set(registered);
    const intentional = new Set(Object.keys(baseline.intentional));
    const debt = [
      ...new Set(uses.map((u) => u.name).filter((n) => !known.has(n) && !intentional.has(n))),
    ].sort();
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ intentional: baseline.intentional, debt }, null, 2)}\n`
    );
    console.log(`env-schema-coverage: baseline reseeded with ${String(debt.length)} debt entries.`);
    return;
  }

  const cov = computeCoverage(uses, registered, baseline);
  const failed = reportCoverage(cov);

  console.log(
    `env-schema-coverage: ${String(registered.length)} registered, ` +
      `${String(new Set(uses.map((u) => u.name)).size)} distinct read across ` +
      `${String(files.length)} files, ${String(cov.knownDebt.length)} baselined as debt.`
  );
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('check-env-schema-coverage.ts') === true) main();
