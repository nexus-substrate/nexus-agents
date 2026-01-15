/**
 * SICA Test Generator Types
 *
 * Type definitions for self-generated test automation.
 * Integrates SICA self-improvement with TestingExpert capabilities.
 *
 * (Source: Issue #256, Phase 3.2 - Self-Generated Test Automation)
 */

import { z } from 'zod';
import type { VersionId } from './sica-types.js';

// ============================================================================
// Coverage Types
// ============================================================================

/**
 * Coverage metrics for a codebase or module.
 */
export interface CoverageMetrics {
  /** Line coverage percentage (0-100) */
  readonly line: number;
  /** Branch coverage percentage (0-100) */
  readonly branch: number;
  /** Function coverage percentage (0-100) */
  readonly function: number;
  /** Statement coverage percentage (0-100) */
  readonly statement: number;
  /** Areas with insufficient coverage */
  readonly uncoveredAreas?: readonly string[];
}

/**
 * Schema for validating coverage metrics.
 */
export const CoverageMetricsSchema = z.object({
  line: z.number().min(0).max(100),
  branch: z.number().min(0).max(100),
  function: z.number().min(0).max(100),
  statement: z.number().min(0).max(100),
  uncoveredAreas: z.array(z.string()).optional(),
});

/**
 * Coverage gap analysis result.
 */
export interface CoverageGap {
  /** File or module path */
  readonly path: string;
  /** Current coverage percentage */
  readonly current: number;
  /** Target coverage percentage */
  readonly target: number;
  /** Gap in coverage points */
  readonly gap: number;
  /** Specific uncovered areas */
  readonly uncoveredAreas: readonly string[];
  /** Priority for test generation (higher = more important) */
  readonly priority: number;
}

// ============================================================================
// Generated Test Types
// ============================================================================

/**
 * Type of test to generate.
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'component';

/**
 * Test framework to use.
 */
export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'playwright' | 'cypress';

/**
 * A generated test case.
 */
export interface GeneratedTest {
  /** Unique test identifier */
  readonly id: string;
  /** Test name/description */
  readonly name: string;
  /** Type of test */
  readonly type: TestType;
  /** Generated test code */
  readonly code: string;
  /** Target file/function being tested */
  readonly target: string;
  /** Test scenarios covered */
  readonly scenarios: readonly string[];
  /** Framework used */
  readonly framework: TestFramework;
  /** Generation timestamp */
  readonly generatedAt: Date;
}

/**
 * Schema for generated test.
 */
export const GeneratedTestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['unit', 'integration', 'e2e', 'component']),
  code: z.string().min(1),
  target: z.string().min(1),
  scenarios: z.array(z.string()),
  framework: z.enum(['vitest', 'jest', 'mocha', 'playwright', 'cypress']),
  generatedAt: z.date(),
});

// ============================================================================
// Test Generation Types
// ============================================================================

/**
 * Options for test generation.
 */
export interface TestGenerationOptions {
  /** Target coverage percentage (default: 80) */
  readonly targetCoverage?: number;
  /** Test framework to use (default: vitest) */
  readonly framework?: TestFramework;
  /** Test types to generate */
  readonly testTypes?: readonly TestType[];
  /** Maximum tests to generate per file */
  readonly maxTestsPerFile?: number;
  /** Whether to validate generated tests */
  readonly validate?: boolean;
  /** Focus on specific files/patterns */
  readonly focusPaths?: readonly string[];
}

/**
 * Result of test generation.
 */
export interface TestGenerationResult {
  /** Whether generation succeeded */
  readonly success: boolean;
  /** Generated tests */
  readonly tests: readonly GeneratedTest[];
  /** Coverage before generation */
  readonly coverageBefore: CoverageMetrics;
  /** Projected coverage after tests */
  readonly coverageAfter: CoverageMetrics;
  /** Coverage improvement in points */
  readonly coverageGain: number;
  /** Errors during generation */
  readonly errors: readonly string[];
  /** Generation duration in ms */
  readonly durationMs: number;
}

/**
 * Result of test validation.
 */
export interface TestValidationResult {
  /** Test that was validated */
  readonly testId: string;
  /** Whether test is valid */
  readonly valid: boolean;
  /** Whether test passes when run */
  readonly passes: boolean;
  /** Syntax errors if any */
  readonly syntaxErrors?: readonly string[];
  /** Runtime errors if any */
  readonly runtimeErrors?: readonly string[];
  /** Validation duration in ms */
  readonly durationMs: number;
}

// ============================================================================
// SICA Test Integration Types
// ============================================================================

/**
 * Test metrics for a SICA version.
 */
export interface VersionTestMetrics {
  /** Version ID */
  readonly versionId: VersionId;
  /** Number of tests generated */
  readonly testCount: number;
  /** Test pass rate (0-1) */
  readonly passRate: number;
  /** Coverage metrics */
  readonly coverage: CoverageMetrics;
  /** Tests generated by this version */
  readonly generatedTests: readonly GeneratedTest[];
  /** Last updated timestamp */
  readonly lastUpdatedAt: Date;
}

/**
 * Test improvement attempt result.
 */
export interface TestImprovementAttempt {
  /** Source version that generated tests */
  readonly sourceVersionId: VersionId;
  /** Tests generated in this attempt */
  readonly generatedTests: readonly GeneratedTest[];
  /** Validation results for generated tests */
  readonly validationResults: readonly TestValidationResult[];
  /** Coverage gain from this attempt */
  readonly coverageGain: number;
  /** Overall quality score (0-1) */
  readonly qualityScore: number;
  /** Whether attempt was successful */
  readonly successful: boolean;
  /** Attempt timestamp */
  readonly attemptedAt: Date;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Event types emitted by test generator.
 */
export type SicaTestEventType =
  | 'tests_generated'
  | 'tests_validated'
  | 'coverage_measured'
  | 'coverage_improved'
  | 'test_improvement_attempted';

/**
 * Test generator event.
 */
export interface SicaTestEvent {
  readonly type: SicaTestEventType;
  readonly versionId?: VersionId;
  readonly timestamp: Date;
  readonly data: Record<string, unknown>;
}
