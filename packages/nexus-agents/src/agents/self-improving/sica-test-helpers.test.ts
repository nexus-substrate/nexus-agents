/**
 * Tests for SICA Test Generator Helpers
 * @module agents/self-improving/sica-test-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TARGET_COVERAGE,
  DEFAULT_FRAMEWORK,
  DEFAULT_TEST_TYPES,
  DEFAULT_MAX_TESTS_PER_FILE,
  matchesFocusPaths,
  selectTestType,
  generateTestCode,
  extractModuleName,
  sanitizeTestName,
  extractScenarios,
  validateTestSyntax,
  calculatePriority,
  createSuccessResult,
} from './sica-test-helpers.js';
import type { CoverageMetrics, GeneratedTest } from './sica-test-types.js';

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('has correct default coverage target', () => {
    expect(DEFAULT_TARGET_COVERAGE).toBe(80);
  });

  it('has correct default framework', () => {
    expect(DEFAULT_FRAMEWORK).toBe('vitest');
  });

  it('has correct default test types', () => {
    expect(DEFAULT_TEST_TYPES).toEqual(['unit', 'integration']);
  });

  it('has correct max tests per file', () => {
    expect(DEFAULT_MAX_TESTS_PER_FILE).toBe(5);
  });
});

// ============================================================================
// matchesFocusPaths
// ============================================================================

describe('matchesFocusPaths', () => {
  it('returns true when path matches a focus path', () => {
    expect(matchesFocusPaths('src/core/types.ts', ['src/core', 'src/agents'])).toBe(true);
  });

  it('returns true for partial match', () => {
    expect(matchesFocusPaths('src/agents/base-agent.ts', ['agents'])).toBe(true);
  });

  it('returns false when no match', () => {
    expect(matchesFocusPaths('src/utils/helpers.ts', ['core', 'agents'])).toBe(false);
  });

  it('returns false for empty focus paths', () => {
    expect(matchesFocusPaths('src/core/types.ts', [])).toBe(false);
  });
});

// ============================================================================
// selectTestType
// ============================================================================

describe('selectTestType', () => {
  it('selects integration for integration areas', () => {
    expect(selectTestType('integration tests', ['unit', 'integration'])).toBe('integration');
  });

  it('selects integration for workflow areas', () => {
    expect(selectTestType('workflow handlers', ['unit', 'integration'])).toBe('integration');
  });

  it('selects first type as default', () => {
    expect(selectTestType('helper functions', ['unit', 'integration'])).toBe('unit');
  });

  it('falls back to default when integration not in types', () => {
    expect(selectTestType('integration area', ['unit'])).toBe('unit');
  });

  it('falls back to unit when types is empty', () => {
    expect(selectTestType('area', [])).toBe('unit');
  });
});

// ============================================================================
// generateTestCode
// ============================================================================

describe('generateTestCode', () => {
  it('generates vitest test code', () => {
    const code = generateTestCode('src/helpers.ts', 'edge cases', 'unit', 'vitest');
    expect(code).toContain("import { describe, it, expect } from 'vitest'");
    expect(code).toContain('helpers');
    expect(code).toContain('edge cases');
  });

  it('generates jest test code', () => {
    const code = generateTestCode('src/utils.ts', 'validation', 'unit', 'jest');
    expect(code).toContain("import { describe, it, expect } from 'jest'");
  });

  it('generates fallback for unknown framework', () => {
    const code = generateTestCode('src/helpers.ts', 'area', 'unit', 'mocha' as 'vitest');
    expect(code).toContain('mocha test for area');
  });

  it('includes module import', () => {
    const code = generateTestCode('src/my-module.ts', 'area', 'unit', 'vitest');
    expect(code).toContain("from 'src/my-module.js'");
  });
});

// ============================================================================
// extractModuleName
// ============================================================================

describe('extractModuleName', () => {
  it('extracts module name from simple path', () => {
    expect(extractModuleName('helpers.ts')).toBe('helpers');
  });

  it('extracts module name from nested path', () => {
    expect(extractModuleName('src/core/types.ts')).toBe('types');
  });

  it('removes hyphens from name', () => {
    expect(extractModuleName('my-module.ts')).toBe('mymodule');
  });

  it('handles path without extension', () => {
    expect(extractModuleName('src/module')).toBe('module');
  });
});

// ============================================================================
// sanitizeTestName
// ============================================================================

describe('sanitizeTestName', () => {
  it('produces lowercase test name', () => {
    expect(sanitizeTestName('Edge Cases')).toBe('should handle edge cases');
  });

  it('removes special characters', () => {
    expect(sanitizeTestName('test & validation!')).toBe('should handle test  validation');
  });

  it('preserves spaces and alphanumeric', () => {
    expect(sanitizeTestName('unit test 123')).toBe('should handle unit test 123');
  });
});

// ============================================================================
// extractScenarios
// ============================================================================

describe('extractScenarios', () => {
  it('returns three scenarios', () => {
    const scenarios = extractScenarios('error handling');
    expect(scenarios).toHaveLength(3);
  });

  it('includes handles scenario', () => {
    const scenarios = extractScenarios('parsing');
    expect(scenarios[0]).toBe('handles parsing');
  });

  it('includes validates scenario', () => {
    const scenarios = extractScenarios('input');
    expect(scenarios[1]).toBe('validates input input');
  });

  it('includes expected result scenario', () => {
    const scenarios = extractScenarios('output');
    expect(scenarios[2]).toBe('returns expected result for output');
  });
});

// ============================================================================
// validateTestSyntax
// ============================================================================

describe('validateTestSyntax', () => {
  it('returns no errors for valid test code', () => {
    const code = "describe('test', () => { it('works', () => {}); });";
    expect(validateTestSyntax(code)).toEqual([]);
  });

  it('reports missing describe block', () => {
    const code = "it('works', () => {});";
    const errors = validateTestSyntax(code);
    expect(errors).toContain('Missing describe block');
  });

  it('reports missing test case', () => {
    const code = "describe('my module', () => { const x = 1; });";
    const errors = validateTestSyntax(code);
    expect(errors).toContain('Missing test case');
  });

  it('accepts test() as alternative to it()', () => {
    const code = "describe('test', () => { test('works', () => {}); });";
    expect(validateTestSyntax(code)).toEqual([]);
  });

  it('reports both missing describe and test', () => {
    const errors = validateTestSyntax('console.log("hello")');
    expect(errors).toHaveLength(2);
  });
});

// ============================================================================
// calculatePriority
// ============================================================================

describe('calculatePriority', () => {
  it('returns 10 for large gap (>= 20)', () => {
    expect(calculatePriority(60, 80)).toBe(10);
  });

  it('returns 7 for medium gap (>= 10)', () => {
    expect(calculatePriority(70, 80)).toBe(7);
  });

  it('returns 5 for small gap (>= 5)', () => {
    expect(calculatePriority(75, 80)).toBe(5);
  });

  it('returns 3 for tiny gap (< 5)', () => {
    expect(calculatePriority(78, 80)).toBe(3);
  });

  it('returns 3 when already at target', () => {
    expect(calculatePriority(80, 80)).toBe(3);
  });

  it('returns 3 when above target', () => {
    expect(calculatePriority(90, 80)).toBe(3);
  });
});

// ============================================================================
// createSuccessResult
// ============================================================================

describe('createSuccessResult', () => {
  it('creates a success result', () => {
    const tests: GeneratedTest[] = [];
    const before: CoverageMetrics = { line: 70, branch: 60, function: 80 } as CoverageMetrics;
    const after: CoverageMetrics = { line: 85, branch: 75, function: 90 } as CoverageMetrics;
    const result = createSuccessResult(tests, before, after, 1000);
    expect(result.success).toBe(true);
    expect(result.coverageGain).toBe(15);
    expect(result.durationMs).toBe(1000);
    expect(result.errors).toEqual([]);
  });

  it('calculates coverage gain correctly', () => {
    const before: CoverageMetrics = { line: 50, branch: 40, function: 60 } as CoverageMetrics;
    const after: CoverageMetrics = { line: 55, branch: 45, function: 65 } as CoverageMetrics;
    const result = createSuccessResult([], before, after, 500);
    expect(result.coverageGain).toBe(5);
  });
});
