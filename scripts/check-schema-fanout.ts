/**
 * check-schema-fanout.ts — surface schema-change cascades.
 *
 * When a tracked Zod schema's source file changes in a way that touches the
 * schema's marker, at least one consumer test file MUST also change in the
 * same PR. v1 ships **warn-only** — observability before enforcement, mirroring
 * the improvement_review (#2402) and registry-coverage (#2406) patterns. Promote
 * to hard fail in v2 once the false-positive rate is acceptable.
 *
 * Catches the cascade pattern from #2253 / #2254 / #2255 — schema changes
 * shipped without consumer-test updates, then needed 1-2 follow-up PRs to fix.
 *
 * See docs/architecture/SCHEMA_FANOUT_COVERAGE.md (#2407). Implements #2408.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-schema-fanout.ts            # Warn-only check
 *   pnpm exec tsx scripts/check-schema-fanout.ts --verbose  # Detailed output
 *   pnpm exec tsx scripts/check-schema-fanout.ts --strict   # Promote warnings to errors (v2)
 *   pnpm exec tsx scripts/check-schema-fanout.ts --manifest <path>
 *
 * Exit codes:
 *   0 - No warnings, OR warnings only (default v1 mode)
 *   1 - Manifest missing/unparseable OR --strict and warnings emitted
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/ops/schema-fanout-manifest.json');

interface SchemaEntry {
  readonly name: string;
  readonly source: string;
  readonly marker: string;
  readonly consumer_tests: readonly string[];
  readonly rationale: string;
}

interface SchemaFanoutManifest {
  readonly version: string;
  readonly description?: string;
  readonly schemas: readonly SchemaEntry[];
}

interface Warning {
  readonly schema: SchemaEntry;
  readonly missing_tests: readonly string[];
}

type ManifestLoadResult =
  | { readonly success: true; readonly manifest: SchemaFanoutManifest }
  | { readonly success: false; readonly error: string };

// ============================================================================
// Git helpers (execFileSync — no shell, see PR #2421 security review)
// ============================================================================

function safeBaseRef(): string | null {
  const raw = process.env['GITHUB_BASE_REF'];
  if (raw === undefined || raw === '') return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(raw)) return null;
  return raw;
}

export function getChangedFiles(cwd: string = REPO_ROOT): string[] {
  const baseRef = safeBaseRef();
  const range = baseRef !== null ? `origin/${baseRef}...HEAD` : 'HEAD~1...HEAD';
  try {
    const out = execFileSync('git', ['diff', '--name-only', range], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    try {
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return staged
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

export function getFileDiff(filePath: string, cwd: string = REPO_ROOT): string {
  const baseRef = safeBaseRef();
  const range = baseRef !== null ? `origin/${baseRef}...HEAD` : 'HEAD~1...HEAD';
  try {
    return execFileSync('git', ['diff', range, '--', filePath], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

// ============================================================================
// Manifest loading + validation
// ============================================================================

export function loadManifest(manifestPath: string = MANIFEST_PATH): ManifestLoadResult {
  if (!fs.existsSync(manifestPath)) {
    return { success: false, error: `Manifest not found: ${manifestPath}` };
  }
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return { success: true, manifest: JSON.parse(content) as SchemaFanoutManifest };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to parse manifest: ${message}` };
  }
}

export function validateManifest(manifest: SchemaFanoutManifest): readonly string[] {
  const errors: string[] = [];
  for (const schema of manifest.schemas) {
    if (!fs.existsSync(path.join(REPO_ROOT, schema.source))) {
      errors.push(`${schema.name}: source missing → ${schema.source}`);
    }
    for (const test of schema.consumer_tests) {
      if (!fs.existsSync(path.join(REPO_ROOT, test))) {
        errors.push(`${schema.name}: consumer test missing → ${test}`);
      }
    }
  }
  return errors;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Was the schema's marker block touched by the PR diff?
 *
 * v1 detection is line-based: any +/- diff line containing the marker token
 * counts as "schema changed." This is intentionally coarse — false positives
 * surface as warnings (not errors), and the operator can dismiss them.
 */
export function isSchemaChanged(
  schema: SchemaEntry,
  changedFiles: readonly string[],
  diffOf: (path: string) => string = getFileDiff
): boolean {
  if (!changedFiles.includes(schema.source)) return false;
  const diff = diffOf(schema.source);
  for (const line of diff.split('\n')) {
    if ((line.startsWith('+') || line.startsWith('-')) && line.includes(schema.marker)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the consumer tests that the PR did NOT touch.
 * Returns empty array if at least one consumer test was changed (the v1 proxy).
 */
export function findUntouchedConsumerTests(
  schema: SchemaEntry,
  changedFiles: readonly string[]
): readonly string[] {
  const changed = new Set(changedFiles);
  const anyTouched = schema.consumer_tests.some((t) => changed.has(t));
  if (anyTouched) return [];
  return schema.consumer_tests;
}

// ============================================================================
// Reporting
// ============================================================================

function printWarning(w: Warning): void {
  console.log(`⚠ WARNING: ${w.schema.name}`);
  console.log(`  Source changed: ${w.schema.source}`);
  console.log(`  Rationale: ${w.schema.rationale}`);
  console.log(`  No consumer test was updated. Expected at least one of:`);
  for (const t of w.missing_tests) {
    console.log(`    - ${t}`);
  }
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

interface CheckResult {
  readonly success: boolean;
  readonly warnings: readonly Warning[];
  readonly bitrot_errors: readonly string[];
  readonly error?: string;
}

export function performCheck(verbose: boolean, manifestPath: string = MANIFEST_PATH): CheckResult {
  const loaded = loadManifest(manifestPath);
  if (!loaded.success) {
    return { success: false, warnings: [], bitrot_errors: [], error: loaded.error };
  }
  const { manifest } = loaded;

  const bitrotErrors = validateManifest(manifest);
  if (bitrotErrors.length > 0) {
    return { success: false, warnings: [], bitrot_errors: bitrotErrors };
  }

  const changedFiles = getChangedFiles();
  if (verbose) {
    console.log(`Manifest version: ${manifest.version}`);
    console.log(`Tracked schemas: ${String(manifest.schemas.length)}`);
    console.log(`Changed files: ${String(changedFiles.length)}\n`);
  }

  const warnings: Warning[] = [];
  for (const schema of manifest.schemas) {
    if (!isSchemaChanged(schema, changedFiles)) continue;
    const missing = findUntouchedConsumerTests(schema, changedFiles);
    if (missing.length > 0) {
      warnings.push({ schema, missing_tests: missing });
    }
  }

  return { success: true, warnings, bitrot_errors: [] };
}

export function checkSchemaFanout(
  verbose: boolean,
  strict: boolean,
  result: CheckResult = performCheck(verbose)
): boolean {
  console.log('Schema-Fan-Out Check (#2408 — v1 warn-only)');
  console.log('============================================\n');

  if (result.bitrot_errors.length > 0) {
    console.error('✗ Manifest bitrot detected (paths in manifest do not exist on disk):\n');
    for (const e of result.bitrot_errors) {
      console.error(`  ${e}`);
    }
    console.error('\nFix the manifest at docs/ops/schema-fanout-manifest.json.');
    return false;
  }

  if (!result.success) {
    console.error(`✗ schema-fan-out check could not run: ${result.error ?? 'Unknown error'}`);
    return false;
  }

  if (result.warnings.length === 0) {
    console.log('✓ No schema-fan-out warnings.\n');
    return true;
  }

  console.log(`⚠ ${String(result.warnings.length)} schema-fan-out warning(s).\n`);
  for (const w of result.warnings) {
    printWarning(w);
  }

  console.log('To resolve:');
  console.log('  1. Update at least one consumer test file in the same PR, OR');
  console.log('  2. Update docs/ops/schema-fanout-manifest.json if a consumer no longer exists.');
  console.log('');
  console.log('See: docs/architecture/SCHEMA_FANOUT_COVERAGE.md');
  console.log('');
  console.log('Note: v1 is warn-only. Will promote to error (`--strict`) once calibrated.\n');

  return strict ? false : true;
}

function resolveManifestPath(args: readonly string[]): string | null {
  const optionIndex = args.indexOf('--manifest');
  if (optionIndex === -1) return MANIFEST_PATH;
  const value = args[optionIndex + 1];
  if (value === undefined || value.startsWith('-')) return null;
  return path.resolve(value);
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const strict = args.includes('--strict');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-schema-fanout.ts — surface schema-change cascades

Usage:
  pnpm exec tsx scripts/check-schema-fanout.ts [options]

Options:
  --verbose, -v  Show detailed output
  --strict       Promote warnings to errors (v2 mode)
  --manifest     Override the schema-fan-out manifest path
  --help, -h     Show this help

Exit codes:
  0 - No warnings, OR warnings only (default v1 mode)
  1 - Manifest missing/unparseable, bitrot detected, OR --strict with warnings
`);
    process.exit(0);
  }

  const manifestPath = resolveManifestPath(args);
  if (manifestPath === null) {
    console.error('✗ --manifest requires a path.');
    process.exit(1);
  }

  const result = performCheck(verbose, manifestPath);
  const success = checkSchemaFanout(verbose, strict, result);
  process.exit(success ? 0 : 1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-schema-fanout.ts') === true;
if (invokedDirectly) {
  main();
}
