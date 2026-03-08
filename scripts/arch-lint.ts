#!/usr/bin/env npx tsx
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
import { SRC_ROOT, DOCS_ROOT } from './script-paths.js';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly category: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

interface LintResult {
  readonly violations: Violation[];
  readonly filesScanned: number;
  readonly passed: boolean;
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
function checkSecurity(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');
  const isTestFile =
    relPath.includes('.test.') ||
    relPath.startsWith('testing/') ||
    relPath.includes('/testing/') ||
    relPath.includes('/fixtures/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    for (const { pattern, message } of SECURITY_PATTERNS) {
      if (shouldSkipSecurityPattern(relPath, message, isTestFile)) continue;

      if (pattern.test(line)) {
        pattern.lastIndex = 0;
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
function checkTestHygiene(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(SRC_ROOT, filePath);
  const lines = content.split('\n');

  // Skip test files and testing utilities (testing/ contains mock infrastructure)
  if (
    relPath.includes('.test.') ||
    relPath.startsWith('testing/') ||
    relPath.includes('/testing/')
  ) {
    return violations;
  }

  // Skip demo-command files (they contain demo data with Mock* names for illustration)
  if (relPath.includes('demo-command')) {
    return violations;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

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
 * Main linting function.
 */
function lint(): LintResult {
  const files = getAllTsFiles(SRC_ROOT);
  const violations: Violation[] = [];

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');

      violations.push(...checkLayerBoundaries(filePath, content));
      violations.push(...checkDeterminism(filePath, content));
      violations.push(...checkSecurity(filePath, content));
      violations.push(...checkTestHygiene(filePath, content));
    } catch {
      // Skip files that can't be read
    }
  }

  // Add governance checks
  violations.push(...checkGovernance());

  // Filter to only errors for pass/fail
  const errors = violations.filter((v) => v.severity === 'error');

  return {
    violations,
    filesScanned: files.length,
    passed: errors.length === 0,
  };
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
    for (const v of categoryViolations.slice(0, 10)) {
      const icon = v.severity === 'error' ? '✗' : '⚠';
      console.log(`  ${icon} ${v.file}:${String(v.line)} - ${v.message}`);
    }
    if (categoryViolations.length > 10) {
      console.log(`  ... and ${String(categoryViolations.length - 10)} more`);
    }
    console.log('');
  }

  if (result.passed) {
    console.log('✓ Architectural lint PASSED');
  } else {
    console.log('✗ Architectural lint FAILED');
  }
}

// Run linter
const result = lint();
printResults(result);
process.exit(result.passed ? 0 : 1);
