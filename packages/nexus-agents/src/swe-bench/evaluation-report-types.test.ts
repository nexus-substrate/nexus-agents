/**
 * Tests for Evaluation Report Types
 *
 * Validates report generation types and default configurations.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REPORT_CONFIG,
  ReportGenerationError,
  type ReportConfig,
  type ReportFormat,
  type ReportDetailLevel,
  type StatisticalSummary,
  type TimingStatistics,
  type FailureCategory,
  type FailureAnalysis,
  type FailureStatistics,
  type TokenUsageBreakdown,
  type CostEstimate,
  type EvaluationReport,
  type ReportMetadata,
  type ReportSummary,
} from './evaluation-report-types.js';

describe('evaluation-report-types', () => {
  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('ReportConfig', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_REPORT_CONFIG.format).toBe('markdown');
      expect(DEFAULT_REPORT_CONFIG.detailLevel).toBe('standard');
      expect(DEFAULT_REPORT_CONFIG.includeInstanceDetails).toBe(true);
      expect(DEFAULT_REPORT_CONFIG.includeComparison).toBe(true);
      expect(DEFAULT_REPORT_CONFIG.includeCharts).toBe(false);
    });

    it('should allow custom configurations', () => {
      const config: ReportConfig = {
        format: 'html',
        detailLevel: 'verbose',
        includeInstanceDetails: true,
        includeComparison: true,
        includeCharts: true,
        outputPath: './reports/eval-report.html',
        title: 'SWE-Bench Evaluation Report - January 2026',
      };

      expect(config.format).toBe('html');
      expect(config.includeCharts).toBe(true);
    });
  });

  describe('ReportFormat', () => {
    it('should support all output formats', () => {
      const formats: ReportFormat[] = ['json', 'markdown', 'html', 'csv'];
      expect(formats).toHaveLength(4);
    });
  });

  describe('ReportDetailLevel', () => {
    it('should support all detail levels', () => {
      const levels: ReportDetailLevel[] = ['summary', 'standard', 'detailed', 'verbose'];
      expect(levels).toHaveLength(4);
    });
  });

  // ==========================================================================
  // Statistical Summary Tests
  // ==========================================================================

  describe('StatisticalSummary', () => {
    it('should represent distribution statistics', () => {
      const summary: StatisticalSummary = {
        min: 1000,
        max: 300000,
        mean: 96000,
        median: 85000,
        stdDev: 45000,
        p25: 60000,
        p75: 120000,
        p90: 180000,
        p95: 220000,
        count: 300,
      };

      expect(summary.median).toBeLessThan(summary.mean); // Right-skewed distribution
      expect(summary.p25).toBeLessThan(summary.median);
      expect(summary.median).toBeLessThan(summary.p75);
    });
  });

  describe('TimingStatistics', () => {
    it('should track evaluation timing', () => {
      const timing: TimingStatistics = {
        instanceDuration: {
          min: 5000,
          max: 600000,
          mean: 96000,
          median: 80000,
          stdDev: 50000,
          p25: 50000,
          p75: 120000,
          p90: 200000,
          p95: 300000,
          count: 300,
        },
        totalWallTime: 28800000, // 8 hours
        totalCpuTime: 230400000, // 64 hours (8 workers)
        patchApplicationTime: 30000,
        testExecutionTime: 28500000,
      };

      expect(timing.totalWallTime).toBe(28800000);
    });
  });

  // ==========================================================================
  // Failure Analysis Tests
  // ==========================================================================

  describe('FailureCategory', () => {
    it('should support all failure categories', () => {
      const categories: FailureCategory[] = [
        'patch_not_applicable',
        'test_failure',
        'syntax_error',
        'runtime_error',
        'timeout',
        'missing_dependency',
        'wrong_file_modified',
        'incomplete_fix',
        'regression_introduced',
        'unknown',
      ];
      expect(categories).toHaveLength(10);
    });
  });

  describe('FailureAnalysis', () => {
    it('should analyze a patch application failure', () => {
      const analysis: FailureAnalysis = {
        instanceId: 'django__django-12345',
        category: 'patch_not_applicable',
        errorMessage: 'Hunk #1 FAILED at 123. 1 out of 2 hunks FAILED',
        affectedFiles: ['django/core/handlers/base.py'],
        suggestedApproach: 'Check for version differences in file structure',
        similarFailures: ['django__django-12346', 'django__django-12347'],
      };

      expect(analysis.category).toBe('patch_not_applicable');
      expect(analysis.similarFailures).toHaveLength(2);
    });

    it('should analyze a test failure', () => {
      const analysis: FailureAnalysis = {
        instanceId: 'flask__flask-67890',
        category: 'test_failure',
        errorMessage: 'AssertionError: Expected 200, got 500',
        affectedFiles: ['flask/app.py', 'tests/test_app.py'],
      };

      expect(analysis.category).toBe('test_failure');
    });
  });

  describe('FailureStatistics', () => {
    it('should aggregate failure data', () => {
      const stats: FailureStatistics = {
        byCategory: {
          patch_not_applicable: 20,
          test_failure: 80,
          syntax_error: 5,
          runtime_error: 15,
          timeout: 10,
          missing_dependency: 5,
          wrong_file_modified: 10,
          incomplete_fix: 30,
          regression_introduced: 10,
          unknown: 15,
        },
        commonPatterns: [
          {
            description: 'Off-by-one errors in loop bounds',
            occurrences: 12,
            examples: ['sympy__sympy-111', 'sympy__sympy-222'],
            potentialCause: 'Agent not properly understanding loop termination conditions',
          },
        ],
        byRepository: {
          'django/django': 40,
          'flask/flask': 20,
          'sympy/sympy': 30,
        },
      };

      const totalFailures = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
      expect(totalFailures).toBe(200);
    });
  });

  // ==========================================================================
  // Token and Cost Analysis Tests
  // ==========================================================================

  describe('TokenUsageBreakdown', () => {
    it('should break down token usage', () => {
      const usage: TokenUsageBreakdown = {
        totalInputTokens: 15000000,
        totalOutputTokens: 5000000,
        totalTokens: 20000000,
        perInstance: {
          min: 10000,
          max: 200000,
          mean: 66667,
          median: 50000,
          stdDev: 30000,
          p25: 40000,
          p75: 80000,
          p90: 120000,
          p95: 150000,
          count: 300,
        },
        byPhase: {
          exploration: 5000000,
          planning: 2000000,
          implementation: 10000000,
          retry: 3000000,
        },
      };

      expect(usage.totalTokens).toBe(usage.totalInputTokens + usage.totalOutputTokens);
    });
  });

  describe('CostEstimate', () => {
    it('should estimate evaluation costs', () => {
      const cost: CostEstimate = {
        totalCostUsd: 60.0,
        perInstanceCostUsd: 0.2,
        perResolvedInstanceCostUsd: 0.4, // 50% resolution rate
        pricingModel: {
          modelName: 'claude-sonnet-4-20250514',
          inputPricePerMillion: 3.0,
          outputPricePerMillion: 15.0,
          priceDate: '2026-01-01',
        },
      };

      expect(cost.perResolvedInstanceCostUsd).toBe(cost.perInstanceCostUsd * 2);
    });
  });

  // ==========================================================================
  // Report Structure Tests
  // ==========================================================================

  describe('ReportMetadata', () => {
    it('should contain report metadata', () => {
      const metadata: ReportMetadata = {
        title: 'SWE-Bench Evaluation Report',
        generatedAt: '2026-01-17T20:00:00Z',
        variant: 'lite',
        modelName: 'nexus-agents/claude-sonnet-4',
        nexusVersion: '2.5.0',
        reportVersion: '1.0.0',
      };

      expect(metadata.variant).toBe('lite');
    });
  });

  describe('ReportSummary', () => {
    it('should summarize evaluation results', () => {
      const summary: ReportSummary = {
        resolutionRate: 0.52,
        resolvedCount: 156,
        totalCount: 300,
        ranking: 3,
        highlights: [
          'Achieved 52% resolution rate on SWE-bench Lite',
          'Top 3 among agent systems',
          'Best performance on Django repository (60%)',
        ],
        improvementAreas: [
          'sympy repository resolution rate below average',
          'High timeout rate on complex multi-file changes',
        ],
      };

      expect(summary.highlights).toHaveLength(3);
      expect(summary.improvementAreas).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('ReportGenerationError', () => {
    it('should create error with message', () => {
      const error = new ReportGenerationError('Failed to generate markdown report');

      expect(error.name).toBe('ReportGenerationError');
      expect(error.message).toBe('Failed to generate markdown report');
    });

    it('should preserve cause', () => {
      const cause = new Error('File write error');
      const error = new ReportGenerationError('Report save failed', cause);

      expect(error.cause).toBe(cause);
    });
  });

  // ==========================================================================
  // Integration Tests - Full Report Structure
  // ==========================================================================

  describe('EvaluationReport', () => {
    it('should represent a complete evaluation report', () => {
      // This test validates the full report structure compiles correctly
      const report: Partial<EvaluationReport> = {
        metadata: {
          title: 'SWE-Bench Evaluation',
          generatedAt: '2026-01-17T20:00:00Z',
          variant: 'lite',
          modelName: 'nexus-agents/claude-sonnet-4',
          nexusVersion: '2.5.0',
          reportVersion: '1.0.0',
        },
        summary: {
          resolutionRate: 0.52,
          resolvedCount: 156,
          totalCount: 300,
          ranking: 3,
          highlights: ['Top 3 performance'],
          improvementAreas: ['Improve sympy handling'],
        },
      };

      expect(report.metadata?.variant).toBe('lite');
      expect(report.summary?.resolutionRate).toBe(0.52);
    });
  });
});
