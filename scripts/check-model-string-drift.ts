/**
 * Fitness-guard: refuse hardcoded model-version strings outside config/.
 *
 * Mirrors the existing scripts/check-*-drift.ts family. Uses ts-morph to walk
 * the AST and inspect string literals only — JSDoc and `//` comments are
 * non-StringLiteral nodes so they're excluded by construction (no regex
 * pre-pass needed, no false positives on documentation).
 *
 * Pattern matches version-bearing model identifiers like `claude-opus-4-6`,
 * `claude-sonnet-4-20250514`, `gemini-3.1-pro-preview`, `gpt-5.2-codex`. Short
 * stable aliases (`claude-sonnet-4`, `opus`, `haiku`) pass through.
 *
 * The day-1 allowlist holds the 18 Category-A sites discovered during research
 * for #2199; each entry references a child of the companion migration epic
 * #2200. Removing entries from the allowlist is how migration progress is
 * measured.
 *
 * Advisory by default — exits 0 even when violations are found. Set
 * `NEXUS_DRIFT_ADVISORY=0` to flip to blocking (exit 1) — used in the
 * pre-push hook + CI gate after the advisory cycle (#2199 Child 4).
 *
 * @module scripts/check-model-string-drift
 * (Source: Issue #2199 Child 2)
 */

import { Project, Node } from 'ts-morph';
import { relative } from 'node:path';
import { SRC_ROOT, ROOT } from './script-paths.js';
import { ALLOWLIST, isAllowed } from './model-string-drift-allowlist.js';

/** Pattern that flags version-bearing model identifiers. */
export const VERSION_BEARING_PATTERN =
  /^(claude|gemini|codex|gpt|opencode|anthropic\/|openrouter\/)[a-z0-9./-]*\d[a-z0-9./-]*$/i;

/** Short aliases that are intentionally stable and should NOT trip the rule. */
export const STABLE_ALIASES: ReadonlySet<string> = new Set([
  'claude-opus',
  'claude-sonnet',
  'claude-haiku',
  'claude-opus-4',
  'claude-sonnet-4',
  'claude-haiku-4',
  'claude-haiku-3',
  'gemini-pro',
  'gemini-flash',
  'gemini-3-pro',
  'gemini-3-flash',
  'opus',
  'sonnet',
  'haiku',
]);

/** Globs scanned for violations. */
const SCAN_GLOBS = ['packages/nexus-agents/src/**/*.ts'];

/** Globs excluded from scanning. */
const EXCLUDE_PATTERNS: ReadonlyArray<RegExp> = [
  /\/packages\/nexus-agents\/src\/config\//,
  /\.test\.ts$/,
];

/** A single violation found during scanning. */
export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly literal: string;
}

/**
 * Pure predicate — does this string literal trip the rule?
 *
 * Exported for unit testing. A string trips the rule when it matches the
 * version-bearing pattern AND is not in the stable-alias allowlist.
 */
export function isViolatingLiteral(value: string): boolean {
  if (STABLE_ALIASES.has(value)) return false;
  return VERSION_BEARING_PATTERN.test(value);
}

/** Pure predicate — should this file be scanned? */
export function shouldScanFile(absolutePath: string): boolean {
  for (const exclude of EXCLUDE_PATTERNS) {
    if (exclude.test(absolutePath)) return false;
  }
  return true;
}

/** Collects all violations across the codebase. Returns empty array on clean run. */
export function collectViolations(project: Project): readonly Violation[] {
  const violations: Violation[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const absolutePath = sourceFile.getFilePath();
    if (!shouldScanFile(absolutePath)) continue;
    const fileRel = relative(ROOT, absolutePath);
    sourceFile.forEachDescendant((node) => {
      if (!Node.isStringLiteral(node)) return;
      const value = node.getLiteralValue();
      if (!isViolatingLiteral(value)) return;
      const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
      if (isAllowed(fileRel, value, ALLOWLIST)) return;
      violations.push({ file: fileRel, line, column, literal: value });
    });
  }
  return violations;
}

/**
 * Number of source files the drift scan actually inspects.
 *
 * Shares `shouldScanFile` with `collectViolations` deliberately: a count
 * derived from a different rule would certify coverage the scan does not have.
 * `addSourceFilesAtPaths` returns an empty set for a glob that matches nothing
 * rather than throwing, so without this the gate reported a clean run over
 * zero files.
 */
export function scannedFileCount(project: Project): number {
  let count = 0;
  for (const sourceFile of project.getSourceFiles()) {
    if (shouldScanFile(sourceFile.getFilePath())) count++;
  }
  return count;
}

function formatViolation(v: Violation): string {
  return `${v.file}:${String(v.line)}:${String(v.column)}  found "${v.literal}"`;
}

function isAdvisory(): boolean {
  return process.env['NEXUS_DRIFT_ADVISORY'] !== '0';
}

function main(): void {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });
  project.addSourceFilesAtPaths(SCAN_GLOBS.map((g) => `${ROOT}/${g}`));

  const scanned = scannedFileCount(project);

  // A glob matching nothing is a broken gate, not a clean codebase. This ran
  // ahead of the violation check because `violations.length === 0` cannot
  // distinguish the two, and the allowlist line printed below reports a static
  // constant that reads as coverage regardless of what was scanned.
  if (scanned === 0) {
    process.stderr.write(
      `Model-string drift: scanned 0 files under ${SRC_ROOT}\n` +
        `  Globs: ${SCAN_GLOBS.join(', ')}\n` +
        '  The check inspected nothing. Fix the scan globs rather than trusting this run.\n'
    );
    process.exit(1);
  }

  const violations = collectViolations(project);

  if (violations.length === 0) {
    const allowedCount = ALLOWLIST.length;
    process.stdout.write(
      `✓ No new model-version drift detected. Source root: ${SRC_ROOT}\n` +
        `  ${String(scanned)} file(s) scanned; ${String(allowedCount)} grandfathered site(s) in allowlist.\n`
    );
    process.exit(0);
  }

  for (const v of violations) {
    process.stderr.write(formatViolation(v) + '\n');
    process.stderr.write(
      '  → use the alias from getCliModelName() or import from config/model-capabilities.ts\n'
    );
  }
  process.stderr.write(`\n${String(violations.length)} model-string drift violation(s) found.\n`);

  if (isAdvisory()) {
    process.stderr.write(
      'ADVISORY MODE — not failing the build. Set NEXUS_DRIFT_ADVISORY=0 to enforce.\n'
    );
    process.exit(0);
  }
  process.exit(1);
}

// Only run main when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main();
}
