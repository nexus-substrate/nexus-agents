/**
 * QA Verification Checks
 *
 * Configurable check definitions for the verification engine.
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

import type { CheckDefinition } from './verify-types.js';

// ============================================================================
// Default Check Definitions
// ============================================================================

/**
 * TypeScript type checking.
 */
export const TYPECHECK: CheckDefinition = {
  id: 'typecheck',
  name: 'TypeScript Type Check',
  category: 'typecheck',
  command: 'pnpm typecheck',
  successPatterns: [],
  failurePatterns: ['error TS\\d+:', 'Type error:'],
  timeoutMs: 120000,
  required: true,
  weight: 0.25,
};

/**
 * ESLint code quality.
 */
export const LINT: CheckDefinition = {
  id: 'lint',
  name: 'ESLint',
  category: 'lint',
  command: 'pnpm lint',
  successPatterns: [],
  failurePatterns: ['error', '\\d+ problems?'],
  timeoutMs: 180000,
  required: true,
  weight: 0.25,
};

/**
 * Unit and integration tests.
 */
export const TEST: CheckDefinition = {
  id: 'test',
  name: 'Test Suite',
  category: 'test',
  command: 'pnpm test',
  successPatterns: ['Tests.*passed', '✓.*tests?'],
  failurePatterns: ['FAIL', 'failed', 'Error:'],
  timeoutMs: 300000,
  required: true,
  weight: 0.3,
};

/**
 * Build compilation.
 */
export const BUILD: CheckDefinition = {
  id: 'build',
  name: 'Build',
  category: 'build',
  command: 'pnpm build',
  successPatterns: ['successfully', 'Done'],
  failurePatterns: ['error', 'failed', 'Error:'],
  timeoutMs: 180000,
  required: true,
  weight: 0.2,
};

/**
 * Security audit.
 */
export const SECURITY_AUDIT: CheckDefinition = {
  id: 'security-audit',
  name: 'Security Audit',
  category: 'security',
  command: 'pnpm audit --audit-level=high',
  successPatterns: ['found 0 vulnerabilities', 'No vulnerabilities'],
  failurePatterns: ['high', 'critical', 'vulnerabilities found'],
  timeoutMs: 60000,
  required: false,
  weight: 0.15,
};

/**
 * Test coverage threshold.
 */
export const COVERAGE: CheckDefinition = {
  id: 'coverage',
  name: 'Test Coverage',
  category: 'coverage',
  command: 'pnpm test:coverage --reporter=text-summary',
  successPatterns: ['All files.*[8-9]\\d%|100%'],
  failurePatterns: ['Coverage.*[0-6]\\d%'],
  timeoutMs: 300000,
  required: false,
  weight: 0.1,
};

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Minimal checks for quick verification.
 */
export const MINIMAL_CHECKS: readonly CheckDefinition[] = [TYPECHECK, LINT];

/**
 * Standard checks for most issues.
 */
export const STANDARD_CHECKS: readonly CheckDefinition[] = [TYPECHECK, LINT, TEST, BUILD];

/**
 * Full checks for releases and major changes.
 */
export const FULL_CHECKS: readonly CheckDefinition[] = [
  TYPECHECK,
  LINT,
  TEST,
  BUILD,
  SECURITY_AUDIT,
  COVERAGE,
];

// ============================================================================
// Check Configuration Helpers
// ============================================================================

/**
 * Creates a custom check definition.
 */
export function createCheck(
  id: string,
  name: string,
  command: string,
  options: Partial<Omit<CheckDefinition, 'id' | 'name' | 'command'>> = {}
): CheckDefinition {
  // Build base check without optional pattern properties
  const base = {
    id,
    name,
    command,
    category: options.category ?? 'custom',
    timeoutMs: options.timeoutMs ?? 60000,
    required: options.required ?? false,
    weight: options.weight ?? 0.1,
  };

  // Build optional properties conditionally to satisfy exactOptionalPropertyTypes
  const optionals: { successPatterns?: readonly string[]; failurePatterns?: readonly string[] } =
    {};
  if (options.successPatterns !== undefined) {
    optionals.successPatterns = options.successPatterns;
  }
  if (options.failurePatterns !== undefined) {
    optionals.failurePatterns = options.failurePatterns;
  }

  return { ...base, ...optionals };
}

/**
 * Filters checks by category.
 */
export function filterChecksByCategory(
  checks: readonly CheckDefinition[],
  categories: readonly string[]
): CheckDefinition[] {
  return checks.filter((check) => categories.includes(check.category));
}

/**
 * Gets checks for changed files.
 */
export function getChecksForFiles(
  checks: readonly CheckDefinition[],
  files: readonly string[]
): CheckDefinition[] {
  const categories = new Set<string>();

  for (const file of files) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      categories.add('typecheck');
      categories.add('lint');
    }
    if (file.includes('.test.') || file.includes('.spec.')) {
      categories.add('test');
    }
    if (file === 'package.json' || file.includes('package-lock')) {
      categories.add('security');
      categories.add('build');
    }
  }

  // Always include required checks
  const result = checks.filter((check) => check.required || categories.has(check.category));

  return result;
}
