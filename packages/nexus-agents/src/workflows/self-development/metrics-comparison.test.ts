/**
 * Metrics Comparison Tests
 *
 * @module workflows/self-development/metrics-comparison.test
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyBaseline,
  createBaselineFromChecks,
  compareMetrics,
  formatComparisonReport,
  comparisonPassesQualityGates,
} from './metrics-comparison.js';

describe('metrics-comparison', () => {
  describe('createEmptyBaseline', () => {
    it('creates baseline with all zeros and passing', () => {
      const baseline = createEmptyBaseline();

      expect(baseline.testCoverage).toBe(0);
      expect(baseline.lintErrors).toBe(0);
      expect(baseline.lintWarnings).toBe(0);
      expect(baseline.typeErrors).toBe(0);
      expect(baseline.buildPasses).toBe(true);
      expect(baseline.testsPassing).toBe(true);
      expect(baseline.timestamp).toBeTruthy();
    });
  });

  describe('createBaselineFromChecks', () => {
    it('parses lint errors and warnings', () => {
      const checks = [
        {
          name: 'lint',
          passed: false,
          output: '✖ 5 errors and 3 warnings',
        },
      ];

      const baseline = createBaselineFromChecks(checks);

      expect(baseline.lintErrors).toBe(5);
      expect(baseline.lintWarnings).toBe(3);
    });

    it('parses type errors from TypeScript output', () => {
      const checks = [
        {
          name: 'typecheck',
          passed: false,
          error: 'Found 12 errors in 4 files.',
        },
      ];

      const baseline = createBaselineFromChecks(checks);

      expect(baseline.typeErrors).toBe(12);
    });

    it('defaults to 1 type error when typecheck fails without count', () => {
      const checks = [
        {
          name: 'typecheck',
          passed: false,
          error: 'Type error occurred',
        },
      ];

      const baseline = createBaselineFromChecks(checks);

      expect(baseline.typeErrors).toBe(1);
    });

    it('captures build status', () => {
      const passingChecks = [{ name: 'build', passed: true }];
      const failingChecks = [{ name: 'build', passed: false }];

      expect(createBaselineFromChecks(passingChecks).buildPasses).toBe(true);
      expect(createBaselineFromChecks(failingChecks).buildPasses).toBe(false);
    });

    it('captures test status and coverage', () => {
      const checks = [
        {
          name: 'test',
          passed: true,
          output: 'All tests passed. 85.5% coverage',
        },
      ];

      const baseline = createBaselineFromChecks(checks);

      expect(baseline.testsPassing).toBe(true);
      expect(baseline.testCoverage).toBe(85.5);
    });
  });

  describe('compareMetrics', () => {
    it('detects coverage regression', () => {
      const before = { ...createEmptyBaseline(), testCoverage: 90 };
      const after = { ...createEmptyBaseline(), testCoverage: 85 };

      const comparison = compareMetrics(before, after);

      expect(comparison.coverageDelta).toBe(-5);
      expect(comparison.hasRegressions).toBe(true);
      expect(comparison.regressions).toContain('Coverage decreased by 5.0%');
    });

    it('detects coverage improvement', () => {
      const before = { ...createEmptyBaseline(), testCoverage: 80 };
      const after = { ...createEmptyBaseline(), testCoverage: 85 };

      const comparison = compareMetrics(before, after);

      expect(comparison.coverageDelta).toBe(5);
      expect(comparison.hasRegressions).toBe(false);
      expect(comparison.improvements).toContain('Coverage increased by 5.0%');
    });

    it('detects lint error regression', () => {
      const before = { ...createEmptyBaseline(), lintErrors: 2 };
      const after = { ...createEmptyBaseline(), lintErrors: 5 };

      const comparison = compareMetrics(before, after);

      expect(comparison.lintErrorDelta).toBe(3);
      expect(comparison.hasRegressions).toBe(true);
      expect(comparison.regressions).toContain('Lint errors increased by 3');
    });

    it('detects type error improvement', () => {
      const before = { ...createEmptyBaseline(), typeErrors: 10 };
      const after = { ...createEmptyBaseline(), typeErrors: 5 };

      const comparison = compareMetrics(before, after);

      expect(comparison.typeErrorDelta).toBe(-5);
      expect(comparison.hasRegressions).toBe(false);
      expect(comparison.improvements).toContain('Type errors decreased by 5');
    });

    it('detects build regression', () => {
      const before = { ...createEmptyBaseline(), buildPasses: true };
      const after = { ...createEmptyBaseline(), buildPasses: false };

      const comparison = compareMetrics(before, after);

      expect(comparison.hasRegressions).toBe(true);
      expect(comparison.regressions).toContain('Build is now failing');
    });

    it('detects test improvement', () => {
      const before = { ...createEmptyBaseline(), testsPassing: false };
      const after = { ...createEmptyBaseline(), testsPassing: true };

      const comparison = compareMetrics(before, after);

      expect(comparison.hasRegressions).toBe(false);
      expect(comparison.improvements).toContain('Tests are now passing');
    });

    it('reports no changes correctly', () => {
      const before = createEmptyBaseline();
      const after = createEmptyBaseline();

      const comparison = compareMetrics(before, after);

      expect(comparison.passed).toBe(true);
      expect(comparison.hasRegressions).toBe(false);
      expect(comparison.regressions).toHaveLength(0);
      expect(comparison.improvements).toHaveLength(0);
    });
  });

  describe('formatComparisonReport', () => {
    it('formats report with improvements and regressions', () => {
      const comparison = {
        passed: false,
        coverageDelta: 5,
        lintErrorDelta: 2,
        lintWarningDelta: -1,
        typeErrorDelta: 0,
        hasRegressions: true,
        regressions: ['Lint errors increased by 2'],
        improvements: ['Coverage increased by 5.0%', 'Lint warnings decreased by 1'],
      };

      const report = formatComparisonReport(comparison);

      expect(report).toContain('Coverage Delta: +5.0%');
      expect(report).toContain('Lint Error Delta: +2');
      expect(report).toContain('Improvements:');
      expect(report).toContain('✓ Coverage increased');
      expect(report).toContain('Regressions:');
      expect(report).toContain('✗ Lint errors increased');
      expect(report).toContain('REGRESSIONS DETECTED');
    });

    it('formats clean report when no regressions', () => {
      const comparison = {
        passed: true,
        coverageDelta: 0,
        lintErrorDelta: 0,
        lintWarningDelta: 0,
        typeErrorDelta: 0,
        hasRegressions: false,
        regressions: [],
        improvements: [],
      };

      const report = formatComparisonReport(comparison);

      expect(report).toContain('NO REGRESSIONS');
    });
  });

  describe('comparisonPassesQualityGates', () => {
    it('passes when no regressions', () => {
      const comparison = {
        passed: true,
        coverageDelta: 0,
        lintErrorDelta: 0,
        lintWarningDelta: 0,
        typeErrorDelta: 0,
        hasRegressions: false,
        regressions: [],
        improvements: [],
      };

      const result = comparisonPassesQualityGates(comparison);

      expect(result.ok).toBe(true);
    });

    it('fails when regressions exist', () => {
      const comparison = {
        passed: false,
        coverageDelta: -5,
        lintErrorDelta: 0,
        lintWarningDelta: 0,
        typeErrorDelta: 0,
        hasRegressions: true,
        regressions: ['Coverage decreased by 5.0%'],
        improvements: [],
      };

      const result = comparisonPassesQualityGates(comparison);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Quality regressions detected');
        expect(result.error).toContain('Coverage decreased');
      }
    });
  });
});
