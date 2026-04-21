/**
 * Tests for Report Renderer
 *
 * @module swe-bench/report-renderer.test
 */

import { describe, it, expect } from 'vitest';
import { renderReport, renderMarkdown, renderHtml, renderCsv } from './report-renderer.js';
import type { EvaluationReport } from './evaluation-report-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  const djangoRepo = {
    repository: 'django/django',
    totalInstances: 3,
    resolvedInstances: 2,
    resolutionRate: 0.667,
  };
  const flaskRepo = {
    repository: 'flask/flask',
    totalInstances: 1,
    resolvedInstances: 1,
    resolutionRate: 1.0,
  };

  return {
    metadata: {
      title: 'Test Report',
      generatedAt: '2026-01-15T12:00:00Z',
      modelName: 'claude-3',
      variant: 'lite' as const,
      nexusVersion: '2.3.0',
      reportVersion: '1.0.0',
    },
    summary: {
      resolutionRate: 0.75,
      resolvedCount: 3,
      totalCount: 4,
      highlights: ['Good performance on Django'],
      improvementAreas: [],
    },
    metrics: {
      evaluation: {
        totalInstances: 4,
        predictedInstances: 4,
        resolvedInstances: 3,
        resolutionRate: 0.75,
        patchesApplied: 4,
        patchApplicationRate: 1.0,
        timeouts: 0,
        errors: 0,
        avgDurationMs: 30000,
        totalDurationMs: 120000,
      },
      timing: {
        totalWallTime: 120000,
        instanceDuration: {
          mean: 30000,
          median: 28000,
          p95: 45000,
          min: 10000,
          max: 50000,
          stdDev: 8000,
          p25: 20000,
          p75: 38000,
          p90: 43000,
          count: 4,
        },
        patchApplicationTime: 5000,
        testExecutionTime: 25000,
      },
      resources: {
        peakMemory: 536870912,
        avgMemory: 268435456,
        diskSpaceUsed: 2254857830,
        containersCreated: 4,
      },
    },
    repositoryBreakdown: {
      repositories: [djangoRepo, flaskRepo],
      bestRepository: flaskRepo,
      worstRepository: djangoRepo,
      performanceVariance: 0.111,
    },
    failureAnalysis: {
      byCategory: {
        patch_not_applicable: 1,
        test_failure: 0,
        syntax_error: 0,
        runtime_error: 0,
        timeout: 0,
        missing_dependency: 0,
        wrong_file_modified: 0,
        incomplete_fix: 0,
        regression_introduced: 0,
        unknown: 0,
      },
      commonPatterns: [],
      byRepository: {},
    },
    rawResult: {
      runId: 'run-1',
      datasetName: 'lite' as const,
      modelNameOrPath: 'claude-3',
      startedAt: '2026-01-15T11:00:00Z',
      completedAt: '2026-01-15T12:00:00Z',
      metrics: {
        totalInstances: 4,
        predictedInstances: 4,
        resolvedInstances: 3,
        resolutionRate: 0.75,
        patchesApplied: 4,
        patchApplicationRate: 1.0,
        timeouts: 0,
        errors: 0,
        avgDurationMs: 30000,
        totalDurationMs: 120000,
      },
      repositoryMetrics: [],
      instanceResults: [
        {
          instanceId: 'django__django-12345',
          modelNameOrPath: 'claude-3',
          resolved: true,
          status: 'resolved' as const,
          testResults: [],
          testsPassed: 5,
          testsFailed: 0,
          testsTotal: 5,
          patchApplied: true,
          durationMs: 25000,
        },
        {
          instanceId: 'django__django-67890',
          modelNameOrPath: 'claude-3',
          resolved: false,
          status: 'unresolved' as const,
          testResults: [],
          testsPassed: 2,
          testsFailed: 3,
          testsTotal: 5,
          patchApplied: true,
          durationMs: 35000,
        },
      ],
      config: {
        datasetName: 'lite' as const,
        predictionsPath: './preds.jsonl',
        maxWorkers: 4,
        runId: 'run-1',
        cacheLevel: 'env' as const,
        mode: 'docker' as const,
        timeoutSeconds: 1800,
        outputDir: './logs',
        useModal: false,
      },
    },
    ...overrides,
  };
}

// ============================================================================
// renderMarkdown
// ============================================================================

describe('renderMarkdown', () => {
  it('includes title as h1', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('# Test Report');
  });

  it('includes model and dataset info', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('**Model:** claude-3');
    expect(md).toContain('**Dataset:** lite');
  });

  it('includes summary section with resolution rate', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('## Summary');
    expect(md).toContain('75.0%');
    expect(md).toContain('3 / 4');
  });

  it('includes highlights', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('Good performance on Django');
  });

  it('includes ranking when present', () => {
    const report = makeReport();
    const withRanking = makeReport({
      summary: { ...report.summary, ranking: 5 },
    });
    const md = renderMarkdown(withRanking);
    expect(md).toContain('#5');
  });

  it('includes metrics section', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('## Metrics');
    expect(md).toContain('Total Duration');
    expect(md).toContain('Avg per Instance');
  });

  it('includes repository breakdown', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('## Repository Performance');
    expect(md).toContain('django/django');
    expect(md).toContain('flask/flask');
  });

  it('includes failure analysis', () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain('## Failure Analysis');
    expect(md).toContain('patch_not_applicable');
  });

  it('omits zero-count failure categories', () => {
    const md = renderMarkdown(makeReport());
    // test_failure has 0 count, should not appear as a row
    const lines = md.split('\n');
    const failureRows = lines.filter((l) => l.includes('test_failure'));
    expect(failureRows).toHaveLength(0);
  });
});

// ============================================================================
// renderHtml
// ============================================================================

describe('renderHtml', () => {
  it('includes DOCTYPE', () => {
    const html = renderHtml(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('includes title in head', () => {
    const html = renderHtml(makeReport());
    expect(html).toContain('<title>Test Report</title>');
  });

  it('contains markdown content inside pre tag', () => {
    const html = renderHtml(makeReport());
    expect(html).toContain('<pre>');
    expect(html).toContain('# Test Report');
  });
});

// ============================================================================
// renderCsv
// ============================================================================

describe('renderCsv', () => {
  it('includes header row', () => {
    const csv = renderCsv(makeReport());
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('instance_id,resolved,status,tests_passed,tests_failed,duration_ms');
  });

  it('includes instance data rows', () => {
    const csv = renderCsv(makeReport());
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 instances
    expect(lines[1]).toContain('django__django-12345');
    expect(lines[1]).toContain('true');
  });

  it('handles empty instances', () => {
    const report = makeReport();
    const empty = makeReport({
      rawResult: { ...report.rawResult, instanceResults: [] },
    });
    const csv = renderCsv(empty);
    expect(csv.split('\n')).toHaveLength(1); // header only
  });
});

// ============================================================================
// renderReport (dispatch)
// ============================================================================

describe('renderReport', () => {
  it('dispatches to markdown', () => {
    const result = renderReport(makeReport(), 'markdown');
    expect(result).toContain('# Test Report');
  });

  it('dispatches to html', () => {
    const result = renderReport(makeReport(), 'html');
    expect(result).toContain('<!DOCTYPE html>');
  });

  it('dispatches to csv', () => {
    const result = renderReport(makeReport(), 'csv');
    expect(result).toContain('instance_id,resolved');
  });

  it('defaults to JSON for unknown format', () => {
    const result = renderReport(makeReport(), 'json');
    expect(result).toContain('"metadata"');
    expect(result).toContain('"summary"');
  });
});
