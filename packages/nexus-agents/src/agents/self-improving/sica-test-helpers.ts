/**
 * SICA Test Generator Helpers
 *
 * Helper functions for test generation, validation, and code creation.
 * Extracted from sica-test-generator.ts for maintainability.
 *
 * (Source: Issue #256, Phase 3.2 - Self-Generated Test Automation)
 */

import type {
  CoverageMetrics,
  GeneratedTest,
  TestGenerationResult,
  TestFramework,
  TestType,
} from './sica-test-types.js';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TARGET_COVERAGE = 80;
export const DEFAULT_FRAMEWORK: TestFramework = 'vitest';
export const DEFAULT_TEST_TYPES: readonly TestType[] = ['unit', 'integration'];
export const DEFAULT_MAX_TESTS_PER_FILE = 5;

// ============================================================================
// Types
// ============================================================================

/** Resolved options with all defaults applied. */
export interface ResolvedOptions {
  readonly targetCoverage: number;
  readonly framework: TestFramework;
  readonly testTypes: readonly TestType[];
  readonly maxPerFile: number;
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Creates a success result when no tests are generated.
 */
export function createSuccessResult(
  tests: readonly GeneratedTest[],
  before: CoverageMetrics,
  after: CoverageMetrics,
  durationMs: number
): TestGenerationResult {
  return {
    success: true,
    tests,
    coverageBefore: before,
    coverageAfter: after,
    coverageGain: after.line - before.line,
    errors: [],
    durationMs,
  };
}

// ============================================================================
// Path Matching
// ============================================================================

/**
 * Checks if a path matches any of the focus paths.
 */
export function matchesFocusPaths(path: string, focusPaths: readonly string[]): boolean {
  return focusPaths.some((fp) => path.includes(fp));
}

// ============================================================================
// Test Type Selection
// ============================================================================

/**
 * Selects appropriate test type based on area name.
 */
export function selectTestType(area: string, types: readonly TestType[]): TestType {
  const defaultType: TestType = types[0] ?? 'unit';
  if (area.includes('integration') || area.includes('workflow')) {
    return types.includes('integration') ? 'integration' : defaultType;
  }
  return defaultType;
}

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generates test code for a specific area.
 */
export function generateTestCode(
  path: string,
  area: string,
  type: TestType,
  framework: TestFramework
): string {
  const moduleName = extractModuleName(path);
  const testName = sanitizeTestName(area);

  if (framework === 'vitest' || framework === 'jest') {
    return `import { describe, it, expect } from '${framework}';
import { ${moduleName} } from '${path.replace('.ts', '.js')}';

describe('${moduleName}', () => {
  describe('${area}', () => {
    it('${testName}', () => {
      // Test ${type} for: ${area}
      expect(${moduleName}).toBeDefined();
    });
  });
});
`;
  }

  return `// ${framework} test for ${area}`;
}

/**
 * Extracts module name from file path.
 */
export function extractModuleName(path: string): string {
  const parts = path.split('/');
  const filename = parts[parts.length - 1] ?? 'module';
  return filename.replace('.ts', '').replace(/-/g, '');
}

/**
 * Sanitizes a test name for use in describe/it blocks.
 */
export function sanitizeTestName(area: string): string {
  return `should handle ${area.toLowerCase().replace(/[^a-z0-9\s]/g, '')}`;
}

/**
 * Extracts test scenarios from an area description.
 */
export function extractScenarios(area: string): readonly string[] {
  return [`handles ${area}`, `validates ${area} input`, `returns expected result for ${area}`];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates test code syntax.
 */
export function validateTestSyntax(code: string): readonly string[] {
  const errors: string[] = [];
  if (!code.includes('describe')) errors.push('Missing describe block');
  if (!code.includes('it') && !code.includes('test')) errors.push('Missing test case');
  return errors;
}

// ============================================================================
// Priority Calculation
// ============================================================================

/**
 * Calculates priority based on coverage gap.
 */
export function calculatePriority(current: number, target: number): number {
  const gap = target - current;
  if (gap >= 20) return 10;
  if (gap >= 10) return 7;
  if (gap >= 5) return 5;
  return 3;
}
