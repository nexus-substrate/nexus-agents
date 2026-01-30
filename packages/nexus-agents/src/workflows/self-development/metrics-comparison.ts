/**
 * Metrics Before/After Comparison
 *
 * Functions for capturing baseline metrics and comparing before/after states.
 *
 * @module workflows/self-development/metrics-comparison
 */

import type { Result } from '../../core/index.js';
import { ok, err, getTimeProvider } from '../../core/index.js';

// =============================================================================
// Types
// =============================================================================

/** Baseline metrics snapshot before implementation. */
export interface BaselineSnapshot {
  /** Timestamp when snapshot was taken. */
  readonly timestamp: string;
  /** Test coverage percentage. */
  readonly testCoverage: number;
  /** Number of lint errors. */
  readonly lintErrors: number;
  /** Number of lint warnings. */
  readonly lintWarnings: number;
  /** Number of type errors. */
  readonly typeErrors: number;
  /** Build success status. */
  readonly buildPasses: boolean;
  /** Test suite pass status. */
  readonly testsPassing: boolean;
}

/** Metrics comparison result. */
export interface MetricsComparison {
  /** Whether the comparison passed quality gates. */
  readonly passed: boolean;
  /** Coverage delta (positive = improvement). */
  readonly coverageDelta: number;
  /** Lint error delta (negative = improvement). */
  readonly lintErrorDelta: number;
  /** Lint warning delta (negative = improvement). */
  readonly lintWarningDelta: number;
  /** Type error delta (negative = improvement). */
  readonly typeErrorDelta: number;
  /** Whether any regressions occurred. */
  readonly hasRegressions: boolean;
  /** List of regression descriptions. */
  readonly regressions: readonly string[];
  /** List of improvement descriptions. */
  readonly improvements: readonly string[];
}

// =============================================================================
// Baseline Creation
// =============================================================================

/**
 * Create an empty baseline snapshot (all zeros/passing).
 */
export function createEmptyBaseline(): BaselineSnapshot {
  return {
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    testCoverage: 0,
    lintErrors: 0,
    lintWarnings: 0,
    typeErrors: 0,
    buildPasses: true,
    testsPassing: true,
  };
}

/** Check result type for parsing. */
interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly output?: string;
  readonly error?: string;
}

/** Parse lint check for error/warning counts. */
function parseLintCheck(combined: string): { errors: number; warnings: number } {
  const errorMatch = combined.match(/(\d+)\s*error/i);
  const warningMatch = combined.match(/(\d+)\s*warning/i);
  return {
    errors: errorMatch !== null ? parseInt(errorMatch[1] ?? '0', 10) : 0,
    warnings: warningMatch !== null ? parseInt(warningMatch[1] ?? '0', 10) : 0,
  };
}

/** Parse typecheck for error count. */
function parseTypecheckErrors(combined: string, passed: boolean): number {
  const errorMatch = combined.match(/Found\s*(\d+)\s*error/i);
  if (errorMatch !== null) return parseInt(errorMatch[1] ?? '0', 10);
  return passed ? 0 : 1;
}

/** Parse test check for coverage. */
function parseTestCoverage(combined: string): number {
  const coverageMatch = combined.match(/(\d+(?:\.\d+)?)\s*%\s*(?:coverage|lines)/i);
  return coverageMatch !== null ? parseFloat(coverageMatch[1] ?? '0') : 0;
}

/**
 * Parse verification check results into a baseline snapshot.
 */
export function createBaselineFromChecks(checks: readonly CheckResult[]): BaselineSnapshot {
  const state = {
    lint: { errors: 0, warnings: 0 },
    typeErrors: 0,
    buildPasses: true,
    testsPassing: true,
    coverage: 0,
  };

  for (const check of checks) {
    const combined = `${check.output ?? ''}\n${check.error ?? ''}`;
    if (check.name === 'lint') state.lint = parseLintCheck(combined);
    if (check.name === 'typecheck') state.typeErrors = parseTypecheckErrors(combined, check.passed);
    if (check.name === 'build') state.buildPasses = check.passed;
    if (check.name === 'test') {
      state.testsPassing = check.passed;
      state.coverage = parseTestCoverage(combined);
    }
  }

  return {
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    testCoverage: state.coverage,
    lintErrors: state.lint.errors,
    lintWarnings: state.lint.warnings,
    typeErrors: state.typeErrors,
    buildPasses: state.buildPasses,
    testsPassing: state.testsPassing,
  };
}

// =============================================================================
// Comparison
// =============================================================================

interface DeltaContext {
  regressions: string[];
  improvements: string[];
}

/** Record a delta change as regression or improvement. */
function recordDelta(
  delta: number,
  name: string,
  higherIsBetter: boolean,
  ctx: DeltaContext,
  suffix = ''
): void {
  const abs = Math.abs(delta);
  const formatted = suffix === '%' ? abs.toFixed(1) + suffix : String(abs);
  if (higherIsBetter ? delta < 0 : delta > 0)
    ctx.regressions.push(`${name} ${higherIsBetter ? 'decreased' : 'increased'} by ${formatted}`);
  else if (delta !== 0)
    ctx.improvements.push(`${name} ${higherIsBetter ? 'increased' : 'decreased'} by ${formatted}`);
}

/** Record boolean state change as regression or improvement. */
function recordBooleanChange(
  before: boolean,
  after: boolean,
  name: string,
  regressions: string[],
  improvements: string[]
): void {
  const verb = name === 'Tests' ? 'are' : 'is';
  if (before && !after) regressions.push(`${name} ${verb} now failing`);
  else if (!before && after) improvements.push(`${name} ${verb} now passing`);
}

/**
 * Compare before and after metrics.
 * Returns comparison with deltas and regression detection.
 */
export function compareMetrics(
  before: BaselineSnapshot,
  after: BaselineSnapshot
): MetricsComparison {
  const ctx: DeltaContext = { regressions: [], improvements: [] };
  const coverageDelta = after.testCoverage - before.testCoverage;
  const lintErrorDelta = after.lintErrors - before.lintErrors;
  const lintWarningDelta = after.lintWarnings - before.lintWarnings;
  const typeErrorDelta = after.typeErrors - before.typeErrors;

  recordDelta(coverageDelta, 'Coverage', true, ctx, '%');
  recordDelta(lintErrorDelta, 'Lint errors', false, ctx);
  recordDelta(lintWarningDelta, 'Lint warnings', false, ctx);
  recordDelta(typeErrorDelta, 'Type errors', false, ctx);
  recordBooleanChange(
    before.buildPasses,
    after.buildPasses,
    'Build',
    ctx.regressions,
    ctx.improvements
  );
  recordBooleanChange(
    before.testsPassing,
    after.testsPassing,
    'Tests',
    ctx.regressions,
    ctx.improvements
  );

  return {
    passed: ctx.regressions.length === 0,
    coverageDelta,
    lintErrorDelta,
    lintWarningDelta,
    typeErrorDelta,
    hasRegressions: ctx.regressions.length > 0,
    regressions: ctx.regressions,
    improvements: ctx.improvements,
  };
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format comparison as a human-readable report.
 */
export function formatComparisonReport(comparison: MetricsComparison): string {
  const lines = [
    '=== Before/After Metrics Comparison ===',
    '',
    `Coverage Delta: ${comparison.coverageDelta >= 0 ? '+' : ''}${comparison.coverageDelta.toFixed(1)}%`,
    `Lint Error Delta: ${comparison.lintErrorDelta >= 0 ? '+' : ''}${String(comparison.lintErrorDelta)}`,
    `Lint Warning Delta: ${comparison.lintWarningDelta >= 0 ? '+' : ''}${String(comparison.lintWarningDelta)}`,
    `Type Error Delta: ${comparison.typeErrorDelta >= 0 ? '+' : ''}${String(comparison.typeErrorDelta)}`,
  ];

  if (comparison.improvements.length > 0) {
    lines.push('', 'Improvements:');
    for (const improvement of comparison.improvements) {
      lines.push(`  ✓ ${improvement}`);
    }
  }

  if (comparison.regressions.length > 0) {
    lines.push('', 'Regressions:');
    for (const regression of comparison.regressions) {
      lines.push(`  ✗ ${regression}`);
    }
  }

  lines.push('', `Status: ${comparison.passed ? '✓ NO REGRESSIONS' : '✗ REGRESSIONS DETECTED'}`);

  return lines.join('\n');
}

// =============================================================================
// Quality Gates
// =============================================================================

/**
 * Check if metrics comparison passes quality gates.
 */
export function comparisonPassesQualityGates(comparison: MetricsComparison): Result<void, string> {
  if (comparison.hasRegressions) {
    return err(`Quality regressions detected: ${comparison.regressions.join('; ')}`);
  }
  return ok(undefined);
}
