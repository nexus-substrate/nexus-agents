/**
 * Architectural Linting Script
 *
 * Enforces architectural rules as code per System Mandate Loop B.
 *
 * Categories:
 * 1. Interfaces & Boundaries - Layer violations
 * 2. Determinism - Non-deterministic patterns
 * 3. Governance - CLAUDE.md compliance
 * 4. Test Hygiene - Mocks outside tests
 * 5. Security - No secrets, no silent ignores
 *
 * @module scripts/arch-lint
 * (Source: Issue #570)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SRC_ROOT, DOCS_ROOT, ROOT } from './script-paths.js';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly category: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface LintResult {
  readonly violations: Violation[];
  readonly filesScanned: number;
  readonly passed: boolean;
  /**
   * Set when the lint ran over ZERO files (#4586).
   *
   * `passed: errors.length === 0` is true over an empty file set, so a glob
   * that stops matching — a directory rename, a moved package, a broken
   * `collectLintTargets` — reported the architecture lint clean. `filesScanned`
   * sat in the same object, unread. Absence of evidence is not evidence of
   * compliance: this reports `unmeasured` and exits non-zero.
   */
  readonly unmeasured?: boolean;
}

// Note: Layer definitions are documented in wiring-graph.json
// This file focuses on specific forbidden cross-layer imports

// Forbidden cross-layer imports
const FORBIDDEN_IMPORTS: ReadonlyArray<{ from: string; to: string; reason: string }> = [
  { from: 'core/', to: 'agents/', reason: 'Core should not depend on agents' },
  { from: 'core/', to: 'mcp/', reason: 'Core should not depend on MCP' },
  { from: 'adapters/', to: 'agents/', reason: 'Adapters should not depend on agents' },
  { from: 'adapters/', to: 'mcp/', reason: 'Adapters should not depend on MCP' },
];

// Patterns that indicate non-determinism
const NONDETERMINISTIC_PATTERNS = [
  { pattern: /Math\.random\(\)/g, message: 'Unseeded Math.random()' },
  { pattern: /new Date\(\)/g, message: 'new Date() without injection' },
  { pattern: /Date\.now\(\)/g, message: 'Date.now() without injection (review required)' },
  { pattern: /crypto\.randomUUID\(\)/g, message: 'randomUUID() without seeding' },
];

// Patterns that indicate security issues
const SECURITY_PATTERNS = [
  { pattern: /process\.env\.[A-Z_]+/g, message: 'Direct env access (use config)' },
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, message: 'Hardcoded password' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, message: 'Hardcoded API key' },
  { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/gi, message: 'Hardcoded secret' },
  { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g, message: 'Empty catch block (silent ignore)' },
];

// Mock patterns (should only be in test files)
const MOCK_PATTERNS = [
  { pattern: /vi\.fn\(\)/g, message: 'vi.fn() mock' },
  { pattern: /vi\.mock\(/g, message: 'vi.mock()' },
  { pattern: /jest\.fn\(\)/g, message: 'jest.fn() mock' },
  { pattern: /jest\.mock\(/g, message: 'jest.mock()' },
  { pattern: /\bMock[A-Z]/g, message: 'Mock class/function' },
];

/**
 * Recursively get all TypeScript files in a directory.
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * True when the line is entirely a comment (`//`, or a `/* ... *​/` body line).
 *
 * Deliberately conservative: only whole-line comments qualify, so a trailing
 * comment cannot mask real code earlier on the same line.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** True for tests, testing utilities, and fixture data. */
function isTestOrFixtureFile(relPath: string): boolean {
  return (
    relPath.includes('.test.') ||
    relPath.startsWith('testing/') ||
    relPath.includes('/testing/') ||
    relPath.includes('/fixtures/')
  );
}

/**
 * True for modules where a mock token is legitimate rather than production
 * mock usage:
 *  - tests and `testing/` mock infrastructure;
 *  - `demo-command` files, whose demo data uses `Mock*` names illustratively;
 *  - `expert-prompts`, which are prompt strings that *teach* testing practice
 *    and therefore quote `vi.fn()` and friends as guidance.
 */
function isMockExemptFile(relPath: string): boolean {
  return (
    relPath.includes('.test.') ||
    relPath.startsWith('testing/') ||
    relPath.includes('/testing/') ||
    relPath.includes('demo-command') ||
    relPath.includes('expert-prompts')
  );
}

/**
 * True when an `arch-lint-ignore <rule>` directive covers line `index`.
 *
 * Accepted on the offending line itself, or anywhere in the contiguous comment
 * block immediately above it — a suppression usually carries a multi-line
 * justification, and the reason should not have to fit on one line. The rule
 * name is required so every suppression is greppable by rule.
 */
function hasIgnoreDirective(lines: readonly string[], index: number, rule: string): boolean {
  const directive = `arch-lint-ignore ${rule}`;

  if (lines[index]?.includes(directive) === true) return true;

  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined || !isCommentLine(line)) return false;
    if (line.includes(directive)) return true;
  }

  return false;
}

/**
 * True when a matched credential assignment reads its value indirectly at
 * runtime — a `${...}` template interpolation or an `{env:NAME}` placeholder —
 * rather than embedding a literal.
 */
function isIndirectValue(matchText: string): boolean {
  return matchText.includes('${') || /\{env:[^}]+\}/.test(matchText);
}

/**
 * Check that a module creating a nexus tempdir also tears one down.
 *
 * `nexusMkdtemp`/`nexusMkdtempSync` allocate a directory under the gitignored
 * scratch root. Nothing reaps that root on a schedule, so a caller that never
 * removes what it created leaks a directory per invocation (#4489).
 *
 * Scope, stated honestly: this is a module-level smoke check. It proves a
 * teardown call *exists* alongside the creating call — not that every throw or
 * early-return path reaches it. Ordering and path coverage remain a review
 * concern; this rule only catches the case of a new caller landing with no
 * teardown at all, which is the failure mode that has actually occurred.
 */
export function checkTempDirCleanup(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);

  // The module that defines the helpers, and tests (which tear down via their
  // own fixtures), are not callers in the sense this rule polices.
  if (relPath.includes('nexus-tmp-dir') || relPath.includes('.test.')) {
    return violations;
  }

  if (!/\bnexusMkdtemp(?:Sync)?\s*\(/.test(content)) {
    return violations;
  }

  // Recognised teardown idioms, matching what the existing callers do:
  // `rmSync(dir, ...)`, `await rm(dir, ...)`, or an explicit rimraf.
  const hasTeardown = /\b(?:rmSync|rm|rimraf)\s*\(/.test(content);
  if (hasTeardown) {
    return violations;
  }

  // Escape hatch for the legitimate case where the created path is handed to a
  // caller that owns teardown. Requires naming the rule, so it is greppable.
  if (content.includes('arch-lint-ignore tmpdir-cleanup')) {
    return violations;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!/\bnexusMkdtemp(?:Sync)?\s*\(/.test(line)) continue;

    violations.push({
      file: relPath,
      line: i + 1,
      rule: 'tmpdir-cleanup',
      category: 'Resource Hygiene',
      message:
        'Creates a nexus tempdir but the module has no rm/rmSync teardown ' +
        '(add cleanup, or `// arch-lint-ignore tmpdir-cleanup -- <reason>`)',
      severity: 'error',
    });
  }

  return violations;
}

/**
 * Check for layer boundary violations.
 */
function checkLayerBoundaries(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');

  for (const { from, to, reason } of FORBIDDEN_IMPORTS) {
    if (relPath.startsWith(from)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        // Check if this is an import from the forbidden layer
        const hasImport =
          line.includes('import') && (line.includes(`'../${to}`) || line.includes(`"../${to}`));
        if (!hasImport) continue;

        // Type-only imports are allowed (import type { X } from ...)
        if (line.includes('import type')) {
          continue;
        }

        violations.push({
          file: relPath,
          line: i + 1,
          rule: 'layer-boundary',
          category: 'Interfaces & Boundaries',
          message: reason,
          severity: 'error',
        });
      }
    }
  }

  return violations;
}

/**
 * Check for non-deterministic patterns.
 */
function checkDeterminism(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');

  // Skip test files for determinism checks
  if (relPath.includes('.test.') || relPath.includes('/testing/')) {
    return violations;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    for (const { pattern, message } of NONDETERMINISTIC_PATTERNS) {
      if (pattern.test(line)) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        violations.push({
          file: relPath,
          line: i + 1,
          rule: 'determinism',
          category: 'Determinism',
          message,
          severity: 'warning',
        });
      }
    }
  }

  return violations;
}

/**
 * Check if a security pattern should be skipped for this file/message.
 */
function shouldSkipSecurityPattern(relPath: string, message: string, isTestFile: boolean): boolean {
  // Skip env access check in config files
  if (message.includes('env access') && relPath.includes('config/')) return true;
  // Skip hardcoded credential checks in test files (they're fixtures)
  if (message.includes('Hardcoded') && isTestFile) return true;
  // Skip hardcoded credential checks in constitution files (they're examples)
  if (message.includes('Hardcoded') && relPath.includes('constitutions/')) return true;
  // Skip empty catch in test files
  if (message.includes('Empty catch') && isTestFile) return true;
  return false;
}

/**
 * Check for security violations.
 */
export function checkSecurity(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');
  const isTestFile = isTestOrFixtureFile(relPath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // A credential shape written in prose is documentation about secrets, not
    // a secret. The secret-scanner modules describe their own patterns.
    if (isCommentLine(line) || hasIgnoreDirective(lines, i, 'security')) continue;

    for (const { pattern, message } of SECURITY_PATTERNS) {
      if (shouldSkipSecurityPattern(relPath, message, isTestFile)) continue;

      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      pattern.lastIndex = 0;

      // `${x}` and `{env:NAME}` are indirections that read the value at
      // runtime — the precise opposite of hardcoding it.
      if (match !== null && !isIndirectValue(match[0])) {
        violations.push({
          file: relPath,
          line: i + 1,
          rule: 'security',
          category: 'Security',
          message,
          severity: message.includes('Hardcoded') ? 'error' : 'warning',
        });
      }
    }
  }

  return violations;
}

/**
 * Check for mocks outside test files.
 */
export function checkTestHygiene(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');

  if (isMockExemptFile(relPath)) {
    return violations;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // A mock name inside a comment is prose about tests, not a mock. Only
    // whole-line comments are skipped so a trailing `// ...` cannot be used to
    // hide real code, and a `//` inside a string literal (a URL) is untouched.
    if (isCommentLine(line)) continue;

    for (const { pattern, message } of MOCK_PATTERNS) {
      if (pattern.test(line)) {
        pattern.lastIndex = 0;
        violations.push({
          file: relPath,
          line: i + 1,
          rule: 'test-hygiene',
          category: 'Test Hygiene',
          message: `${message} found in production code`,
          severity: 'error',
        });
      }
    }
  }

  return violations;
}

/** Create a governance violation. */
function govViolation(file: string, msg: string, sev: 'error' | 'warning'): Violation {
  return { file, line: 0, rule: 'governance', category: 'Governance', message: msg, severity: sev };
}

/** Check CLAUDE.md for required sections. */
function checkClaudeMd(violations: Violation[]): void {
  const claudeMdPath = join(DOCS_ROOT, '../CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    violations.push(govViolation('CLAUDE.md', 'CLAUDE.md not found', 'error'));
    return;
  }
  const claudeMd = readFileSync(claudeMdPath, 'utf-8');
  const requiredSections = [
    'Quick Reference',
    'Prerequisites',
    'Core Operating Principles',
    'Orchestration Model',
  ];
  for (const section of requiredSections) {
    if (!claudeMd.includes(section)) {
      violations.push(govViolation('CLAUDE.md', `Missing required section: ${section}`, 'warning'));
    }
  }
}

/** Check required governance files exist. */
function checkGovernanceFiles(violations: Violation[]): void {
  const files = [
    { path: 'architecture/wiring-graph.json', severity: 'error' as const },
    { path: 'metrics/completeness-score.md', severity: 'warning' as const },
  ];
  for (const { path, severity } of files) {
    if (!existsSync(join(DOCS_ROOT, path))) {
      violations.push(
        govViolation(`docs/${path}`, `${path.split('/').pop() ?? path} not found`, severity)
      );
    }
  }
}

/** Check governance compliance. */
function checkGovernance(): Violation[] {
  const violations: Violation[] = [];
  checkClaudeMd(violations);
  checkGovernanceFiles(violations);
  return violations;
}

/**
 * Files the linter walks.
 *
 * #4498: `scripts/` is included, not just the package source. The
 * `tmpdir-cleanup` rule shipped scanning `SRC_ROOT` only, so a leaking tempdir
 * in `scripts/review-pr.ts` went unreported by the guard added to catch
 * exactly that — a blind spot in the checker, not a missing rule. Test files
 * are excluded: the production-code rules do not apply to them, and each rule
 * already re-checks `.test.` for its own reasons.
 */
export function collectLintTargets(): string[] {
  return [...collectSrcTargets(), ...collectScriptTargets()];
}

/** Package source — subject to every rule. */
function collectSrcTargets(): string[] {
  return getAllTsFiles(SRC_ROOT).filter((f) => !f.includes('.test.'));
}

/**
 * Repo-root `scripts/` — subject only to the rules that mean something here.
 *
 * Layer boundaries and determinism are package-source concepts, and this
 * module *defines* the mock patterns, so running test-hygiene over it makes it
 * match itself. Resource hygiene and hardcoded credentials apply everywhere.
 */
function collectScriptTargets(): string[] {
  return getAllTsFiles(join(ROOT, 'scripts')).filter((f) => !f.includes('.test.'));
}

/**
 * Main linting function.
 */
function lint(): LintResult {
  const srcFiles = collectSrcTargets();
  const scriptFiles = collectScriptTargets();
  const violations: Violation[] = [];

  for (const filePath of srcFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');

      violations.push(...checkLayerBoundaries(filePath, content));
      violations.push(...checkDeterminism(filePath, content));
      violations.push(...checkSecurity(filePath, content));
      violations.push(...checkTestHygiene(filePath, content));
      violations.push(...checkTempDirCleanup(filePath, content));
    } catch {
      // Skip files that can't be read
    }
  }

  // #4498: scripts/ gets the scope-appropriate subset (see collectScriptTargets).
  for (const filePath of scriptFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');

      violations.push(...checkSecurity(filePath, content));
      violations.push(...checkTempDirCleanup(filePath, content));
    } catch {
      // Skip files that can't be read
    }
  }

  // Add governance checks
  violations.push(...checkGovernance());

  // Filter to only errors for pass/fail
  const errors = violations.filter((v) => v.severity === 'error');

  return lintVerdict(violations, errors, srcFiles.length + scriptFiles.length);
}

/**
 * The pass/fail/unmeasured verdict, separated from the scan so the empty-input
 * case is testable without a filesystem (#4586).
 *
 * Three states, not two. `passed: errors.length === 0` is true over an empty
 * file set, so a glob that stops matching reported the architecture lint clean
 * with `filesScanned: 0` sitting unread beside it.
 */
export function lintVerdict(
  violations: Violation[],
  errors: readonly Violation[],
  filesScanned: number
): LintResult {
  if (filesScanned === 0) {
    return { violations, filesScanned, passed: false, unmeasured: true };
  }
  return { violations, filesScanned, passed: errors.length === 0 };
}

/**
 * Format and print results.
 */
/* eslint-disable no-console */
function printResults(result: LintResult): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    ARCHITECTURAL LINT REPORT                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Files scanned: ${String(result.filesScanned)}`);
  console.log(`Total violations: ${String(result.violations.length)}`);
  console.log(`Errors: ${String(result.violations.filter((v) => v.severity === 'error').length)}`);
  console.log(
    `Warnings: ${String(result.violations.filter((v) => v.severity === 'warning').length)}`
  );
  console.log('');

  // Group by category
  const byCategory = new Map<string, Violation[]>();
  for (const v of result.violations) {
    const existing = byCategory.get(v.category) ?? [];
    existing.push(v);
    byCategory.set(v.category, existing);
  }

  for (const [category, categoryViolations] of byCategory) {
    console.log(`── ${category} ──`);

    // Errors decide the exit code, so they are always printed in full and
    // ahead of warnings. Truncating them behind a wall of warnings (as this
    // did) makes a failing run unable to explain itself.
    const errors = categoryViolations.filter((v) => v.severity === 'error');
    const warnings = categoryViolations.filter((v) => v.severity !== 'error');

    for (const v of errors) {
      console.log(`  ✗ ${v.file}:${String(v.line)} - ${v.message}`);
    }
    for (const v of warnings.slice(0, 10)) {
      console.log(`  ⚠ ${v.file}:${String(v.line)} - ${v.message}`);
    }
    if (warnings.length > 10) {
      console.log(`  ... and ${String(warnings.length - 10)} more warnings`);
    }
    console.log('');
  }

  if (result.unmeasured === true) {
    console.log('✗ Architectural lint UNMEASURED — zero files scanned');
    console.log('  Nothing was inspected, so nothing can be said to have passed.');
    console.log('  Check the source globs in collectLintTargets/collectScriptTargets.');
  } else if (result.passed) {
    console.log('✓ Architectural lint PASSED');
  } else {
    console.log('✗ Architectural lint FAILED');
  }
}

// Run linter. Guarded so the rule functions can be imported by tests without
// the module exiting the process at import time.
if (process.argv[1]?.endsWith('arch-lint.ts') === true) {
  const result = lint();
  printResults(result);
  process.exit(result.passed ? 0 : 1);
}
