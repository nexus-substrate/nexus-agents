#!/usr/bin/env npx tsx
/**
 * check-orphans.ts — surface src/ subtrees with no outside callers.
 *
 * Wraps knip (already a devDependency) and applies an allowlist to filter
 * known-intentional orphans (CLI scripts, examples, migrations). Output is
 * the filtered orphan-file list — used in audit mode (v1) for visibility,
 * with no enforcement.
 *
 * Counterfactual: would have caught the dead self-development engine
 * (#2402, deleted ~7,700 LOC) at week 1 instead of week 6.
 *
 * v1 = audit only (this PR). v2 = orphan-count contributes to fitness
 * score. v3 = fitness floor + threshold gates CI. Promotion gated on
 * dry-run review per the design (#2409 / PR #2420).
 *
 * See docs/architecture/IMPORT_GRAPH_ORPHANS.md (#2409). Implements #2410.
 *
 * Usage:
 *   npx tsx scripts/check-orphans.ts            # Audit mode
 *   npx tsx scripts/check-orphans.ts --verbose  # Show every flagged orphan
 *
 * Exit codes:
 *   0 - Always (v1 is audit-only; promotes to fail in v2/v3)
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'docs/ops/orphan-allowlist.json');

interface AllowlistEntry {
  readonly glob: string;
  readonly rationale: string;
}

interface SpecificFileEntry {
  readonly path: string;
  readonly rationale: string;
  readonly expires?: string;
}

interface OrphanAllowlist {
  readonly version: string;
  readonly description?: string;
  readonly patterns: readonly AllowlistEntry[];
  readonly specific_files: readonly SpecificFileEntry[];
}

interface KnipFileEntry {
  readonly name: string;
}

interface KnipIssue {
  readonly file: string;
  readonly files?: readonly KnipFileEntry[];
}

// ============================================================================
// Allowlist loading
// ============================================================================

export function loadAllowlist(): OrphanAllowlist | null {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error(`✗ Orphan allowlist not found: ${ALLOWLIST_PATH}`);
    return null;
  }
  try {
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8');
    return JSON.parse(content) as OrphanAllowlist;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Failed to parse allowlist: ${message}`);
    return null;
  }
}

// ============================================================================
// Glob matching (simple, no minimatch dep)
// ============================================================================

/**
 * Convert a glob to a RegExp. Supports `*` (any non-slash), `**` (any
 * including slashes), and literal text. Sufficient for path-style globs in
 * the allowlist.
 *
 * Translations:
 *   `**​/`  → `(?:.+/)?`   (zero or more leading directory segments)
 *   `/**`  → `(?:/.*)?`   (zero or more trailing directory segments + file)
 *   `**`   → `.*`         (anything when not adjacent to a slash)
 *   `*`    → `[^/]*`      (single segment, no slashes)
 */
export function globToRegExp(glob: string): RegExp {
  // Tokenize so we can distinguish ** from * without one greedy regex.
  let pattern = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    const next = glob[i + 1];
    if (c === '*' && next === '*') {
      // Look at the chars on either side of the ** token.
      const after = glob[i + 2];
      const before = i > 0 ? glob[i - 1] : '';
      if (after === '/') {
        pattern += '(?:.+/)?';
        i += 3;
        continue;
      }
      if (before === '/') {
        pattern += '(?:.*)?';
        i += 2;
        continue;
      }
      pattern += '.*';
      i += 2;
      continue;
    }
    if (c === '*') {
      pattern += '[^/]*';
      i += 1;
      continue;
    }
    if (c === undefined) break;
    if ('.+^${}()|[]\\'.includes(c)) {
      pattern += `\\${c}`;
      i += 1;
      continue;
    }
    pattern += c;
    i += 1;
  }
  return new RegExp(`^${pattern}$`);
}

/** Is `filePath` covered by any allowlist pattern or specific file entry? */
export function isAllowlisted(filePath: string, allowlist: OrphanAllowlist): boolean {
  if (allowlist.specific_files.some((e) => e.path === filePath)) return true;
  for (const entry of allowlist.patterns) {
    if (globToRegExp(entry.glob).test(filePath)) return true;
  }
  return false;
}

// ============================================================================
// Knip invocation
// ============================================================================

/** Run knip --reporter json and return the parsed array of issues. */
export function runKnip(cwd: string = REPO_ROOT): readonly KnipIssue[] {
  try {
    const out = execFileSync('npx', ['knip', '--reporter', 'json'], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024, // knip output can be ~400KB+
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out) as KnipIssue[];
  } catch (error: unknown) {
    // knip exits non-zero when issues exist; that's fine — we still get JSON on stdout.
    if (error !== null && typeof error === 'object' && 'stdout' in error) {
      const stdout = (error as { stdout?: string }).stdout;
      if (typeof stdout === 'string' && stdout.trim().length > 0) {
        try {
          return JSON.parse(stdout) as KnipIssue[];
        } catch {
          /* fall through */
        }
      }
    }
    return [];
  }
}

// ============================================================================
// Orphan extraction
// ============================================================================

/** Extract orphan file paths from knip issues. */
export function extractOrphans(issues: readonly KnipIssue[]): readonly string[] {
  const seen = new Set<string>();
  for (const issue of issues) {
    for (const f of issue.files ?? []) {
      seen.add(f.name);
    }
  }
  return [...seen].sort();
}

/** Return orphans NOT covered by the allowlist. */
export function filterOrphans(
  orphans: readonly string[],
  allowlist: OrphanAllowlist
): readonly string[] {
  return orphans.filter((p) => !isAllowlisted(p, allowlist));
}

// ============================================================================
// Reporting
// ============================================================================

interface CheckResult {
  readonly total: number;
  readonly allowlisted: number;
  readonly flagged: readonly string[];
}

export function performCheck(): CheckResult | null {
  const allowlist = loadAllowlist();
  if (allowlist === null) return null;

  const issues = runKnip();
  const all = extractOrphans(issues);
  const flagged = filterOrphans(all, allowlist);

  return {
    total: all.length,
    allowlisted: all.length - flagged.length,
    flagged,
  };
}

function checkOrphans(verbose: boolean): boolean {
  console.log('Orphan Detection (#2410 — v1 audit-only)');
  console.log('=========================================\n');

  const result = performCheck();
  if (result === null) return false;

  console.log(`Total orphans (knip): ${String(result.total)}`);
  console.log(`Allowlisted: ${String(result.allowlisted)}`);
  console.log(`Flagged: ${String(result.flagged.length)}\n`);

  if (result.flagged.length === 0) {
    console.log('✓ No flagged orphans.\n');
    return true;
  }

  if (verbose || result.flagged.length <= 20) {
    console.log('Flagged orphans (audit-only — not blocking):');
    for (const p of result.flagged) {
      console.log(`  - ${p}`);
    }
    console.log('');
  } else {
    console.log(`Flagged orphans (showing first 20 of ${String(result.flagged.length)}):`);
    for (const p of result.flagged.slice(0, 20)) {
      console.log(`  - ${p}`);
    }
    console.log(`  … (${String(result.flagged.length - 20)} more — use --verbose to see all)`);
    console.log('');
  }

  console.log('To resolve:');
  console.log('  1. Wire the orphan into something that imports it, OR');
  console.log('  2. Delete it if it is genuinely dead, OR');
  console.log('  3. Add it to docs/ops/orphan-allowlist.json with rationale.');
  console.log('');
  console.log('See: docs/architecture/IMPORT_GRAPH_ORPHANS.md');
  console.log('Note: v1 is audit-only. Will not fail CI. Promotes in v2/v3.\n');

  return true;
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-orphans.ts — surface src/ subtrees with no outside callers (v1 audit-only)

Usage:
  npx tsx scripts/check-orphans.ts [options]

Options:
  --verbose, -v  Show every flagged orphan
  --help, -h     Show this help

Exit codes:
  0 - Always (v1 is audit-only; promotes to fail in v2/v3)
`);
    process.exit(0);
  }

  const success = checkOrphans(verbose);
  process.exit(success ? 0 : 1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-orphans.ts') === true;
if (invokedDirectly) {
  main();
}
