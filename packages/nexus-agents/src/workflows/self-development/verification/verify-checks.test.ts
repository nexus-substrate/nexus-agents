/**
 * Tests for QA Verification Checks
 *
 * @module workflows/self-development/verification/verify-checks.test
 */

import { describe, it, expect } from 'vitest';
import {
  TYPECHECK,
  LINT,
  TEST,
  BUILD,
  SECURITY_AUDIT,
  COVERAGE,
  MINIMAL_CHECKS,
  STANDARD_CHECKS,
  FULL_CHECKS,
  createCheck,
  filterChecksByCategory,
  getChecksForFiles,
} from './verify-checks.js';

// ============================================================================
// Default Check Definitions
// ============================================================================

describe('Default check definitions', () => {
  it('TYPECHECK has correct structure', () => {
    expect(TYPECHECK.id).toBe('typecheck');
    expect(TYPECHECK.category).toBe('typecheck');
    expect(TYPECHECK.command).toBe('pnpm typecheck');
    expect(TYPECHECK.required).toBe(true);
    expect(TYPECHECK.weight).toBe(0.25);
    expect(TYPECHECK.timeoutMs).toBe(120000);
  });

  it('LINT has correct structure', () => {
    expect(LINT.id).toBe('lint');
    expect(LINT.category).toBe('lint');
    expect(LINT.required).toBe(true);
  });

  it('TEST has correct structure', () => {
    expect(TEST.id).toBe('test');
    expect(TEST.category).toBe('test');
    expect(TEST.required).toBe(true);
    expect(TEST.weight).toBe(0.3);
  });

  it('BUILD has correct structure', () => {
    expect(BUILD.id).toBe('build');
    expect(BUILD.category).toBe('build');
    expect(BUILD.required).toBe(true);
  });

  it('SECURITY_AUDIT is optional', () => {
    expect(SECURITY_AUDIT.id).toBe('security-audit');
    expect(SECURITY_AUDIT.required).toBe(false);
  });

  it('COVERAGE is optional', () => {
    expect(COVERAGE.id).toBe('coverage');
    expect(COVERAGE.required).toBe(false);
  });

  it('all weights sum to 1.25 across all checks', () => {
    const checks = [TYPECHECK, LINT, TEST, BUILD, SECURITY_AUDIT, COVERAGE];
    const totalWeight = checks.reduce<number>((sum, c) => sum + (c.weight ?? 0), 0);
    expect(totalWeight).toBeCloseTo(1.25, 5);
  });
});

// ============================================================================
// Preset Configurations
// ============================================================================

describe('Preset configurations', () => {
  it('MINIMAL_CHECKS includes typecheck and lint', () => {
    expect(MINIMAL_CHECKS).toHaveLength(2);
    expect(MINIMAL_CHECKS.map((c) => c.id)).toEqual(['typecheck', 'lint']);
  });

  it('STANDARD_CHECKS includes typecheck, lint, test, build', () => {
    expect(STANDARD_CHECKS).toHaveLength(4);
    expect(STANDARD_CHECKS.map((c) => c.id)).toEqual(['typecheck', 'lint', 'test', 'build']);
  });

  it('FULL_CHECKS includes all 6 checks', () => {
    expect(FULL_CHECKS).toHaveLength(6);
    expect(FULL_CHECKS.map((c) => c.id)).toEqual([
      'typecheck',
      'lint',
      'test',
      'build',
      'security-audit',
      'coverage',
    ]);
  });
});

// ============================================================================
// createCheck
// ============================================================================

describe('createCheck', () => {
  it('creates check with required fields', () => {
    const check = createCheck('my-check', 'My Check', 'echo test');

    expect(check.id).toBe('my-check');
    expect(check.name).toBe('My Check');
    expect(check.command).toBe('echo test');
    expect(check.category).toBe('custom');
    expect(check.timeoutMs).toBe(60000);
    expect(check.required).toBe(false);
    expect(check.weight).toBe(0.1);
  });

  it('creates check with custom options', () => {
    const check = createCheck('custom', 'Custom', 'npm run check', {
      category: 'test',
      timeoutMs: 30000,
      required: true,
      weight: 0.5,
      successPatterns: ['PASS'],
      failurePatterns: ['FAIL'],
    });

    expect(check.category).toBe('test');
    expect(check.timeoutMs).toBe(30000);
    expect(check.required).toBe(true);
    expect(check.weight).toBe(0.5);
    expect(check.successPatterns).toEqual(['PASS']);
    expect(check.failurePatterns).toEqual(['FAIL']);
  });

  it('omits patterns when not provided', () => {
    const check = createCheck('bare', 'Bare', 'echo');

    expect(check).not.toHaveProperty('successPatterns');
    expect(check).not.toHaveProperty('failurePatterns');
  });
});

// ============================================================================
// filterChecksByCategory
// ============================================================================

describe('filterChecksByCategory', () => {
  it('filters by single category', () => {
    const result = filterChecksByCategory(FULL_CHECKS, ['test']);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('test');
  });

  it('filters by multiple categories', () => {
    const result = filterChecksByCategory(FULL_CHECKS, ['typecheck', 'lint']);
    expect(result).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    const result = filterChecksByCategory(FULL_CHECKS, ['nonexistent']);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// getChecksForFiles
// ============================================================================

describe('getChecksForFiles', () => {
  it('includes typecheck and lint for .ts files', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['src/foo.ts']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('typecheck');
    expect(ids).toContain('lint');
  });

  it('includes test checks for .test.ts files', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['src/foo.test.ts']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('test');
  });

  it('includes security and build for package.json', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['package.json']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('security-audit');
    expect(ids).toContain('build');
  });

  it('always includes required checks', () => {
    // Even for unknown file types, required checks should be included
    const result = getChecksForFiles(FULL_CHECKS, ['unknown.xyz']);
    const requiredIds = result.filter((c) => c.required).map((c) => c.id);

    expect(requiredIds).toContain('typecheck');
    expect(requiredIds).toContain('lint');
    expect(requiredIds).toContain('test');
    expect(requiredIds).toContain('build');
  });

  it('includes tsx files for typecheck', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['Component.tsx']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('typecheck');
  });

  it('handles .spec. files as test files', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['foo.spec.ts']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('test');
  });

  it('handles package-lock files', () => {
    const result = getChecksForFiles(FULL_CHECKS, ['package-lock.json']);
    const ids = result.map((c) => c.id);

    expect(ids).toContain('security-audit');
  });
});
