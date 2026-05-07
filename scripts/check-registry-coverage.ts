#!/usr/bin/env npx tsx
/**
 * check-registry-coverage.ts — enforce wiring-completeness for behavioral registries.
 *
 * When a source file declared in registry-coverage-manifest.json changes in a way
 * that touches the registry's marker, every peer file MUST also change in the same
 * PR. Catches the class of bug from #2347 / #2344 / #2358 / #2315 — registry entry
 * added but peer files (schema, MCP tool, contract test, etc.) miss the update.
 *
 * Hard-fail in v1; no escape hatch. If a registry change genuinely doesn't need a
 * peer-file update, the manifest is wrong; fix the manifest in the same PR.
 *
 * See docs/architecture/REGISTRY_COVERAGE.md (#2405). Implements #2406.
 *
 * Usage:
 *   npx tsx scripts/check-registry-coverage.ts            # Check for violations
 *   npx tsx scripts/check-registry-coverage.ts --verbose  # Detailed output
 *
 * Exit codes:
 *   0 - No violations
 *   1 - Violation detected
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/ops/registry-coverage-manifest.json');

interface RegistryEntry {
  readonly name: string;
  readonly source: string;
  readonly marker: string;
  readonly peer_files: readonly string[];
  readonly rationale: string;
}

interface RegistryManifest {
  readonly version: string;
  readonly description?: string;
  readonly registries: readonly RegistryEntry[];
}

interface Violation {
  readonly registry: RegistryEntry;
  readonly missing_peers: readonly string[];
}

// ============================================================================
// Git helpers
// ============================================================================

/**
 * Validate GITHUB_BASE_REF before passing it to git. Allowlist limits the
 * value to git-ref-safe characters; even though execFileSync (no shell) makes
 * command injection impossible by construction, this also rejects malformed
 * values that would silently fail at the git boundary.
 */
function safeBaseRef(): string | null {
  const raw = process.env['GITHUB_BASE_REF'];
  if (raw === undefined || raw === '') return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(raw)) return null;
  return raw;
}

/**
 * Get the list of files changed in the current PR (or HEAD~1 fallback).
 * Walks the PR commit range when GITHUB_BASE_REF is set so the diff captures
 * every commit on the branch (lesson from #2411 — actions/checkout's PR-merge
 * ref puts a synthetic merge commit at HEAD).
 *
 * Uses execFileSync with argv arrays (no shell) per security review on PR
 * #2421.
 */
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
    // Fall back to staged files (covers local pre-commit usage).
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

/**
 * Get the diff content for a specific file across the PR range.
 * Returns the unified diff so the caller can detect marker-line touches.
 */
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

export function loadManifest(): RegistryManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`✗ Registry-coverage manifest not found: ${MANIFEST_PATH}`);
    return null;
  }
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(content) as RegistryManifest;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Failed to parse manifest: ${message}`);
    return null;
  }
}

/** Verify every manifest path actually exists (catches bitrot). */
export function validateManifest(manifest: RegistryManifest): readonly string[] {
  const errors: string[] = [];
  for (const reg of manifest.registries) {
    if (!fs.existsSync(path.join(REPO_ROOT, reg.source))) {
      errors.push(`${reg.name}: source missing → ${reg.source}`);
    }
    for (const peer of reg.peer_files) {
      if (!fs.existsSync(path.join(REPO_ROOT, peer))) {
        errors.push(`${reg.name}: peer missing → ${peer}`);
      }
    }
  }
  return errors;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Was the registry's marker block touched by the PR diff?
 *
 * v1 detection is line-based: if any added/removed line in the source-file diff
 * contains the marker token, the registry is "changed." Comment-only touches
 * that mention the marker would false-positive — acceptable for v1; promote to
 * AST-based detection if the noise rate gets high.
 */
export function isRegistryChanged(
  registry: RegistryEntry,
  changedFiles: readonly string[],
  diffOf: (path: string) => string = getFileDiff
): boolean {
  if (!changedFiles.includes(registry.source)) return false;
  const diff = diffOf(registry.source);
  for (const line of diff.split('\n')) {
    if ((line.startsWith('+') || line.startsWith('-')) && line.includes(registry.marker)) {
      return true;
    }
  }
  return false;
}

/** Find peer files declared by the registry that are NOT in the changed-files set. */
export function findMissingPeers(
  registry: RegistryEntry,
  changedFiles: readonly string[]
): readonly string[] {
  const changed = new Set(changedFiles);
  return registry.peer_files.filter((p) => !changed.has(p));
}

// ============================================================================
// Reporting
// ============================================================================

function printVerboseInfo(manifest: RegistryManifest, changed: readonly string[]): void {
  console.log(`Manifest version: ${manifest.version}`);
  console.log(`Registries: ${String(manifest.registries.length)}`);
  console.log(`Changed files: ${String(changed.length)}`);
  changed.slice(0, 20).forEach((f) => {
    console.log(`  - ${f}`);
  });
  if (changed.length > 20) console.log(`  … (${String(changed.length - 20)} more)`);
  console.log('');
}

function printViolation(v: Violation): void {
  console.log(`✗ VIOLATION: ${v.registry.name}`);
  console.log(`  Source: ${v.registry.source}`);
  console.log(`  Rationale: ${v.registry.rationale}`);
  console.log(`  Missing peer files (must also be updated in this PR):`);
  for (const peer of v.missing_peers) {
    console.log(`    - ${peer}`);
  }
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

interface CheckResult {
  readonly success: boolean;
  readonly violations: readonly Violation[];
  readonly bitrot_errors: readonly string[];
}

export function performCheck(verbose: boolean): CheckResult {
  const manifest = loadManifest();
  if (manifest === null) {
    return { success: false, violations: [], bitrot_errors: [] };
  }

  const bitrotErrors = validateManifest(manifest);
  if (bitrotErrors.length > 0) {
    return { success: false, violations: [], bitrot_errors: bitrotErrors };
  }

  const changedFiles = getChangedFiles();
  if (verbose) printVerboseInfo(manifest, changedFiles);

  const violations: Violation[] = [];
  for (const registry of manifest.registries) {
    if (!isRegistryChanged(registry, changedFiles)) continue;
    const missing = findMissingPeers(registry, changedFiles);
    if (missing.length > 0) {
      violations.push({ registry, missing_peers: missing });
    }
  }

  return { success: violations.length === 0, violations, bitrot_errors: [] };
}

function checkRegistryCoverage(verbose: boolean): boolean {
  console.log('Registry-Coverage Check (#2406)');
  console.log('================================\n');

  const result = performCheck(verbose);

  if (result.bitrot_errors.length > 0) {
    console.error('✗ Manifest bitrot detected (paths in manifest do not exist on disk):\n');
    for (const e of result.bitrot_errors) {
      console.error(`  ${e}`);
    }
    console.error('');
    console.error('Fix the manifest at docs/ops/registry-coverage-manifest.json.');
    return false;
  }

  if (result.success) {
    console.log('✓ No registry-coverage violations.\n');
    return true;
  }

  console.log(`✗ ${String(result.violations.length)} registry-coverage violation(s) detected.\n`);
  for (const v of result.violations) {
    printViolation(v);
  }

  console.log('To resolve:');
  console.log('  1. Update the missing peer files in the same PR, OR');
  console.log(
    '  2. Update docs/ops/registry-coverage-manifest.json if the peer is no longer required.'
  );
  console.log('');
  console.log('See: docs/architecture/REGISTRY_COVERAGE.md\n');
  return false;
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-registry-coverage.ts — enforce wiring-completeness for behavioral registries

Usage:
  npx tsx scripts/check-registry-coverage.ts [options]

Options:
  --verbose, -v  Show detailed output
  --help, -h     Show this help

Exit codes:
  0 - No violations
  1 - Violation detected
`);
    process.exit(0);
  }

  const success = checkRegistryCoverage(verbose);
  process.exit(success ? 0 : 1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-registry-coverage.ts') === true;
if (invokedDirectly) {
  main();
}
