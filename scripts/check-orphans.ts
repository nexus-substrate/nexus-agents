#!/usr/bin/env npx tsx
/**
 * check-orphans.ts — surface src/ subtrees with no outside callers.
 *
 * Wraps knip (already a devDependency) and applies an allowlist to filter
 * known-intentional orphans (CLI scripts, examples, migrations). A flagged
 * orphan fails the check.
 *
 * Counterfactual: would have caught the dead self-development engine
 * (#2402, deleted ~7,700 LOC) at week 1 instead of week 6.
 *
 * Shipped audit-only in v1 (#2410) with a docstring promising promotion "in
 * v2/v3" and nothing tracking it. #4583 promoted it instead of restating the
 * promise: with the allowlist as it stands the check is already green (22
 * orphans, all allowlisted), and it is demonstrably able to fire — an
 * unreferenced non-exempt module gets flagged. A check that cannot fail by
 * construction is not a check.
 *
 * Two things keep the allowlist from becoming the loophole:
 *   - Every `specific_files` entry must declare exactly one of `expires`
 *     (dated debt) or `permanent: true` (a structural fact) — never neither,
 *     never both. An undeclared exemption fails the check by name.
 *   - An `expires` date that has passed stops exempting, so the file flags.
 *
 * Scope: knip's unused-*files* category only. The unused-*exports* half is
 * the #4561 ratchet's job and is deliberately not duplicated here.
 *
 * See docs/architecture/IMPORT_GRAPH_ORPHANS.md (#2409). Implements #2410,
 * promoted to blocking in #4583.
 *
 * Usage:
 *   npx tsx scripts/check-orphans.ts            # Check
 *   npx tsx scripts/check-orphans.ts --verbose  # Show every flagged orphan
 *
 * Exit codes:
 *   0 - No flagged orphans and every allowlist exemption is well-formed
 *   1 - An orphan is flagged, an exemption declares neither expires nor
 *       permanent, or the allowlist is missing/unparseable
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

/**
 * A one-off exemption. It MUST declare which kind it is: `expires` for dated
 * debt, or `permanent: true` for a file that structurally can never be
 * imported. Exactly one — neither is an undeclared exemption, and both is a
 * contradiction. See {@link validateAllowlist}.
 */
interface SpecificFileEntry {
  readonly path: string;
  readonly rationale: string;
  /** ISO `YYYY-MM-DD`. The exemption holds through the end of this day (UTC). */
  readonly expires?: string;
  /** `true` when the file can never be imported by construction. */
  readonly permanent?: boolean;
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

// ============================================================================
// Exemption declaration + expiry (#4583)
// ============================================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `YYYY-MM-DD` as the last instant of that day (UTC), or null if malformed. */
function parseExpiry(expires: string): number | null {
  if (!ISO_DATE.test(expires)) return null;
  const ms = Date.parse(`${expires}T23:59:59.999Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Check that every `specific_files` entry declares its intent.
 *
 * Returns one human-readable error per malformed entry, each naming the file.
 * An empty array means the allowlist is well-formed. Structural `patterns`
 * are permanent facts about the repo layout and are not validated here.
 */
export function validateAllowlist(allowlist: OrphanAllowlist): readonly string[] {
  const errors: string[] = [];
  for (const entry of allowlist.specific_files) {
    const isPermanent = entry.permanent === true;
    const hasExpiry = typeof entry.expires === 'string';

    if (isPermanent && hasExpiry) {
      errors.push(
        `${entry.path}: declares both "expires" and "permanent" — an exemption is either dated debt or a permanent structural fact, not both. Drop one.`
      );
      continue;
    }
    if (!isPermanent && !hasExpiry) {
      errors.push(
        `${entry.path}: declares neither "expires" nor "permanent" — say which it is. Add "expires": "YYYY-MM-DD" if the exemption is debt with an end date, or "permanent": true with a rationale saying why the file can never be imported.`
      );
      continue;
    }
    if (hasExpiry && parseExpiry(entry.expires) === null) {
      errors.push(
        `${entry.path}: "expires": ${JSON.stringify(entry.expires)} is not a YYYY-MM-DD date — an unparseable expiry would silently never expire.`
      );
    }
  }
  return errors;
}

/**
 * Is this one-off exemption still in force at `now`?
 *
 * Permanent entries always are. Dated entries hold through the end of their
 * `expires` day and stop afterwards, so the file flags. An entry declaring
 * neither is treated as in force here — {@link validateAllowlist} is the
 * enforcement point for that, and it fails the whole check by name.
 */
function isExemptionActive(entry: SpecificFileEntry, now: Date): boolean {
  if (entry.permanent === true) return true;
  if (typeof entry.expires !== 'string') return true;
  const deadline = parseExpiry(entry.expires);
  if (deadline === null) return true; // validateAllowlist reports this as an error.
  return now.getTime() <= deadline;
}

/**
 * Is `filePath` covered by any allowlist pattern, or by a specific-file
 * exemption that is still in force at `now`?
 */
export function isAllowlisted(
  filePath: string,
  allowlist: OrphanAllowlist,
  now: Date = new Date()
): boolean {
  if (allowlist.specific_files.some((e) => e.path === filePath && isExemptionActive(e, now)))
    return true;
  for (const entry of allowlist.patterns) {
    if (globToRegExp(entry.glob).test(filePath)) return true;
  }
  return false;
}

// ============================================================================
// Knip invocation
// ============================================================================

/** Coerce a parsed knip JSON value into the array shape we expect.
 *  Knip can emit either a top-level array or an object with `issues` array
 *  depending on version + reporter mode. Defensively normalize. */
function normalizeKnipJson(parsed: unknown): readonly KnipIssue[] {
  if (Array.isArray(parsed)) return parsed as readonly KnipIssue[];
  if (parsed !== null && typeof parsed === 'object' && 'issues' in parsed) {
    const inner = parsed.issues;
    if (Array.isArray(inner)) return inner as readonly KnipIssue[];
  }
  return [];
}

/** Run knip --reporter json and return the parsed array of issues. */
export function runKnip(cwd: string = REPO_ROOT): readonly KnipIssue[] {
  try {
    const out = execFileSync('npx', ['knip', '--reporter', 'json'], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024, // knip output can be ~400KB+
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (out.trim().length === 0) return [];
    return normalizeKnipJson(JSON.parse(out));
  } catch (error: unknown) {
    // knip exits non-zero when issues exist; that's fine — we still get JSON on stdout.
    if (error !== null && typeof error === 'object' && 'stdout' in error) {
      const stdout = (error as { stdout?: string }).stdout;
      if (typeof stdout === 'string' && stdout.trim().length > 0) {
        try {
          return normalizeKnipJson(JSON.parse(stdout));
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

/** Return orphans NOT covered by the allowlist as of `now`. */
export function filterOrphans(
  orphans: readonly string[],
  allowlist: OrphanAllowlist,
  now: Date = new Date()
): readonly string[] {
  return orphans.filter((p) => !isAllowlisted(p, allowlist, now));
}

// ============================================================================
// Reporting
// ============================================================================

interface CheckResult {
  readonly total: number;
  readonly allowlisted: number;
  readonly flagged: readonly string[];
}

export function performCheck(now: Date = new Date()): CheckResult | null {
  const allowlist = loadAllowlist();
  if (allowlist === null) return null;

  const declarationErrors = validateAllowlist(allowlist);
  if (declarationErrors.length > 0) {
    console.error('✗ Allowlist exemptions that do not declare their intent:\n');
    for (const message of declarationErrors) {
      console.error(`  - ${message}`);
    }
    console.error('\nSee docs/ops/orphan-allowlist.json (#4583).');
    return null;
  }

  const issues = runKnip();
  const all = extractOrphans(issues);
  const flagged = filterOrphans(all, allowlist, now);

  return {
    total: all.length,
    allowlisted: all.length - flagged.length,
    flagged,
  };
}

/** The gate's verdict: any flagged orphan fails the check. */
export function isPassing(result: CheckResult): boolean {
  return result.flagged.length === 0;
}

function checkOrphans(verbose: boolean): boolean {
  console.log('Orphan Detection (#2410, blocking since #4583)');
  console.log('==============================================\n');

  const result = performCheck();
  if (result === null) return false;

  console.log(`Total orphans (knip): ${String(result.total)}`);
  console.log(`Allowlisted: ${String(result.allowlisted)}`);
  console.log(`Flagged: ${String(result.flagged.length)}\n`);

  if (isPassing(result)) {
    console.log('✓ No flagged orphans.\n');
    return true;
  }

  if (verbose || result.flagged.length <= 20) {
    console.log('Flagged orphans (blocking):');
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
  console.log('  3. Add it to docs/ops/orphan-allowlist.json with a rationale and');
  console.log('     either "expires": "YYYY-MM-DD" or "permanent": true.');
  console.log('');
  console.log('See: docs/architecture/IMPORT_GRAPH_ORPHANS.md');
  console.log('This check blocks CI (audit-only through v1; promoted in #4583).\n');

  return isPassing(result);
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-orphans.ts — surface src/ subtrees with no outside callers (blocking)

Usage:
  npx tsx scripts/check-orphans.ts [options]

Options:
  --verbose, -v  Show every flagged orphan
  --help, -h     Show this help

Exit codes:
  0 - No flagged orphans and every allowlist exemption is well-formed
  1 - An orphan is flagged, an exemption declares neither expires nor
      permanent, or the allowlist is missing/unparseable
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
