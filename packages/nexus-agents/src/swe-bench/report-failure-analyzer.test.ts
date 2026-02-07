/**
 * Tests for Report Failure Analyzer
 *
 * @module swe-bench/report-failure-analyzer.test
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeFailure,
  categorizeFailuresByType,
  normalizeErrorMessage,
  detectFailurePatterns,
  groupFailuresByRepository,
  generateFailureStatistics,
  generateInstanceDetails,
  groupByFailureCategory,
} from './report-failure-analyzer.js';
import type { InstanceEvaluationResult, EvaluationRunResult } from './evaluation-harness-types.js';
import type { FailureAnalysis, ReportConfig } from './evaluation-report-types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeInstance(overrides: Partial<InstanceEvaluationResult> = {}) {
  return {
    instanceId: 'django__django-12345',
    modelNameOrPath: 'claude-3',
    resolved: false,
    status: 'unresolved' as const,
    testResults: [],
    testsPassed: 0,
    testsFailed: 1,
    testsTotal: 1,
    patchApplied: true,
    durationMs: 1000,
    ...overrides,
  } satisfies InstanceEvaluationResult;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRunResult(instances: InstanceEvaluationResult[]) {
  return {
    runId: 'run-1',
    datasetName: 'lite' as const,
    modelNameOrPath: 'claude-3',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
    metrics: {
      totalInstances: instances.length,
      predictedInstances: instances.length,
      resolvedInstances: instances.filter((i) => i.resolved).length,
      resolutionRate: 0,
      patchesApplied: 0,
      patchApplicationRate: 0,
      timeouts: 0,
      errors: 0,
      avgDurationMs: 0,
      totalDurationMs: 0,
    },
    repositoryMetrics: [],
    instanceResults: instances,
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
  } satisfies EvaluationRunResult;
}

// ============================================================================
// categorizeFailure
// ============================================================================

describe('categorizeFailure', () => {
  it('returns patch_not_applicable when patch not applied', () => {
    expect(categorizeFailure(makeInstance({ patchApplied: false }))).toBe('patch_not_applicable');
  });

  it('returns timeout for timeout status', () => {
    expect(categorizeFailure(makeInstance({ status: 'timeout' }))).toBe('timeout');
  });

  it('returns runtime_error for error status', () => {
    expect(categorizeFailure(makeInstance({ status: 'error' }))).toBe('runtime_error');
  });

  it('returns test_failure when tests failed > 0', () => {
    expect(categorizeFailure(makeInstance({ testsFailed: 3 }))).toBe('test_failure');
  });

  it('returns unknown when no specific category matches', () => {
    expect(categorizeFailure(makeInstance({ status: 'unresolved', testsFailed: 0 }))).toBe(
      'unknown'
    );
  });

  it('prioritizes patch_not_applicable over other categories', () => {
    expect(categorizeFailure(makeInstance({ patchApplied: false, status: 'timeout' }))).toBe(
      'patch_not_applicable'
    );
  });
});

// ============================================================================
// categorizeFailuresByType
// ============================================================================

describe('categorizeFailuresByType', () => {
  it('returns zero counts for empty array', () => {
    const result = categorizeFailuresByType([]);
    expect(result.patch_not_applicable).toBe(0);
    expect(result.test_failure).toBe(0);
    expect(result.unknown).toBe(0);
  });

  it('counts failures by category', () => {
    const failures = [
      makeInstance({ patchApplied: false }),
      makeInstance({ status: 'timeout' }),
      makeInstance({ status: 'timeout' }),
      makeInstance({ testsFailed: 2 }),
    ];
    const result = categorizeFailuresByType(failures);
    expect(result.patch_not_applicable).toBe(1);
    expect(result.timeout).toBe(2);
    expect(result.test_failure).toBe(1);
  });

  it('includes all category keys', () => {
    const result = categorizeFailuresByType([]);
    const expectedKeys = [
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
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});

// ============================================================================
// normalizeErrorMessage
// ============================================================================

describe('normalizeErrorMessage', () => {
  it('replaces line numbers with N', () => {
    expect(normalizeErrorMessage('Error at line 42: syntax error')).toBe(
      'Error at line N: syntax error'
    );
  });

  it('replaces hunk counts with N', () => {
    expect(normalizeErrorMessage('3 hunk FAILED')).toBe('N hunk FAILED');
  });

  it('replaces multiple occurrences', () => {
    const result = normalizeErrorMessage('line 10 failed, also line 20');
    expect(result).toBe('line N failed, also line N');
  });

  it('truncates to 100 characters', () => {
    const longMsg = 'A'.repeat(200);
    expect(normalizeErrorMessage(longMsg)).toHaveLength(100);
  });

  it('preserves short messages', () => {
    expect(normalizeErrorMessage('simple error')).toBe('simple error');
  });
});

// ============================================================================
// detectFailurePatterns
// ============================================================================

describe('detectFailurePatterns', () => {
  it('returns empty for no failures', () => {
    expect(detectFailurePatterns([])).toEqual([]);
  });

  it('returns empty when no patchError present', () => {
    const failures = [makeInstance(), makeInstance()];
    expect(detectFailurePatterns(failures)).toEqual([]);
  });

  it('groups by normalized error message', () => {
    const failures = [
      makeInstance({ instanceId: 'a', patchError: 'Error at line 10' }),
      makeInstance({ instanceId: 'b', patchError: 'Error at line 20' }),
    ];
    const patterns = detectFailurePatterns(failures);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.description).toBe('Error at line N');
    expect(patterns[0]?.occurrences).toBe(2);
  });

  it('requires at least 2 occurrences', () => {
    const failures = [
      makeInstance({ instanceId: 'a', patchError: 'Unique error A' }),
      makeInstance({ instanceId: 'b', patchError: 'Unique error B' }),
    ];
    expect(detectFailurePatterns(failures)).toEqual([]);
  });

  it('limits examples to 3', () => {
    const failures = Array.from({ length: 5 }, (_, i) =>
      makeInstance({ instanceId: `inst-${String(i)}`, patchError: 'same error' })
    );
    const patterns = detectFailurePatterns(failures);
    expect(patterns[0]?.examples).toHaveLength(3);
  });
});

// ============================================================================
// groupFailuresByRepository
// ============================================================================

describe('groupFailuresByRepository', () => {
  it('returns empty for no failures', () => {
    expect(groupFailuresByRepository([])).toEqual({});
  });

  it('groups by extracted repo name', () => {
    const failures = [
      makeInstance({ instanceId: 'django__django-12345' }),
      makeInstance({ instanceId: 'django__django-67890' }),
      makeInstance({ instanceId: 'flask__flask-111' }),
    ];
    const result = groupFailuresByRepository(failures);
    expect(result['django/django']).toBe(2);
    expect(result['flask/flask']).toBe(1);
  });
});

// ============================================================================
// generateFailureStatistics
// ============================================================================

describe('generateFailureStatistics', () => {
  it('analyzes failures from run result', () => {
    const run = makeRunResult([
      makeInstance({ resolved: false, patchApplied: false }),
      makeInstance({ resolved: false, status: 'timeout' }),
      makeInstance({ resolved: true }),
    ]);
    const stats = generateFailureStatistics(run);
    expect(stats.byCategory.patch_not_applicable).toBe(1);
    expect(stats.byCategory.timeout).toBe(1);
    expect(stats.byRepository).toBeDefined();
    expect(stats.commonPatterns).toBeDefined();
  });

  it('excludes resolved instances', () => {
    const run = makeRunResult([makeInstance({ resolved: true }), makeInstance({ resolved: true })]);
    const stats = generateFailureStatistics(run);
    // All zeros since everything resolved
    expect(stats.byCategory.test_failure).toBe(0);
    expect(stats.byCategory.timeout).toBe(0);
  });
});

// ============================================================================
// generateInstanceDetails
// ============================================================================

describe('generateInstanceDetails', () => {
  const defaultConfig: ReportConfig = {
    format: 'markdown',
    detailLevel: 'detailed',
    includeInstanceDetails: true,
    includeComparison: false,
    includeCharts: false,
    outputPath: '/tmp/report.md',
  };

  it('returns undefined when includeInstanceDetails is false', () => {
    const run = makeRunResult([makeInstance()]);
    const result = generateInstanceDetails(run, {
      ...defaultConfig,
      includeInstanceDetails: false,
    });
    expect(result).toBeUndefined();
  });

  it('separates resolved and unresolved', () => {
    const run = makeRunResult([
      makeInstance({ resolved: true, instanceId: 'resolved-1' }),
      makeInstance({ resolved: false, instanceId: 'unresolved-1' }),
    ]);
    const result = generateInstanceDetails(run, defaultConfig);
    expect(result).toBeDefined();
    expect(result?.resolved).toHaveLength(1);
    expect(result?.unresolved).toHaveLength(1);
  });

  it('categorizes unresolved instances', () => {
    const run = makeRunResult([makeInstance({ resolved: false, patchApplied: false })]);
    const result = generateInstanceDetails(run, defaultConfig);
    expect(result?.unresolved[0]?.category).toBe('patch_not_applicable');
  });

  it('uses patchError or default message', () => {
    const run = makeRunResult([
      makeInstance({ resolved: false, patchError: 'Hunk failed' }),
      makeInstance({ resolved: false, instanceId: 'no-error' }),
    ]);
    const result = generateInstanceDetails(run, defaultConfig);
    expect(result?.unresolved[0]?.errorMessage).toBe('Hunk failed');
    expect(result?.unresolved[1]?.errorMessage).toBe('Test failures');
  });
});

// ============================================================================
// groupByFailureCategory
// ============================================================================

describe('groupByFailureCategory', () => {
  it('returns empty arrays for all categories', () => {
    const result = groupByFailureCategory([]);
    expect(result.patch_not_applicable).toEqual([]);
    expect(result.test_failure).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('groups analyses by category', () => {
    const analyses: FailureAnalysis[] = [
      { instanceId: 'a', category: 'timeout', errorMessage: 'timeout', affectedFiles: [] },
      { instanceId: 'b', category: 'timeout', errorMessage: 'timeout', affectedFiles: [] },
      { instanceId: 'c', category: 'test_failure', errorMessage: 'fail', affectedFiles: [] },
    ];
    const result = groupByFailureCategory(analyses);
    expect(result.timeout).toHaveLength(2);
    expect(result.test_failure).toHaveLength(1);
  });
});
