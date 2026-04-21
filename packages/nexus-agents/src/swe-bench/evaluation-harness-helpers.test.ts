/**
 * Tests for Evaluation Harness Helpers
 * @module swe-bench/evaluation-harness-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { InstanceEvaluationResult } from './evaluation-result-types.js';
import type { EvaluationPhase } from './evaluation-interface-types.js';
import {
  calculateMetrics,
  calculateRepositoryMetrics,
  extractRepoFromInstanceId,
  extractModelName,
  mapStateToPhase,
  transformHarnessProgress,
  createProgressAdapter,
} from './evaluation-harness-helpers.js';
import type { RawHarnessProgress } from './evaluation-harness-helpers.js';
import type { SWEBenchPrediction } from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeResult(overrides: Partial<InstanceEvaluationResult> = {}): InstanceEvaluationResult {
  return {
    instanceId: 'owner__repo-123',
    modelNameOrPath: 'test-model',
    resolved: false,
    status: 'unresolved',
    testResults: [],
    testsPassed: 0,
    testsFailed: 0,
    testsTotal: 0,
    patchApplied: false,
    durationMs: 1000,
    ...overrides,
  };
}

function makeProgress(overrides: Partial<RawHarnessProgress> = {}): RawHarnessProgress {
  return {
    completedCount: 5,
    totalCount: 10,
    resolvedCount: 3,
    elapsedMs: 5000,
    state: 'running',
    ...overrides,
  };
}

// ============================================================================
// extractRepoFromInstanceId
// ============================================================================

describe('extractRepoFromInstanceId', () => {
  it('extracts owner/repo from standard format', () => {
    expect(extractRepoFromInstanceId('django__django-12345')).toBe('django/django');
  });

  it('handles hyphenated repo names', () => {
    expect(extractRepoFromInstanceId('scikit-learn__scikit-learn-9876')).toBe(
      'scikit-learn/scikit-learn'
    );
  });

  it('returns unknown for invalid format', () => {
    expect(extractRepoFromInstanceId('nodoubleunscore')).toBe('unknown');
  });

  it('handles complex owner names', () => {
    expect(extractRepoFromInstanceId('my-org__my-project-42')).toBe('my-org/my-project');
  });
});

// ============================================================================
// extractModelName
// ============================================================================

describe('extractModelName', () => {
  it('extracts model name from first prediction', () => {
    const predictions = [{ model_name_or_path: 'gpt-4' }] as SWEBenchPrediction[];
    expect(extractModelName(predictions)).toBe('gpt-4');
  });

  it('returns unknown for empty predictions', () => {
    expect(extractModelName([])).toBe('unknown');
  });
});

// ============================================================================
// calculateMetrics
// ============================================================================

describe('calculateMetrics', () => {
  it('returns zeroes for empty results', () => {
    const metrics = calculateMetrics([]);
    expect(metrics.totalInstances).toBe(0);
    expect(metrics.resolvedInstances).toBe(0);
    expect(metrics.avgDurationMs).toBe(0);
    expect(metrics.resolutionRate).toBe(0);
  });

  it('computes correct metrics', () => {
    const results = [
      makeResult({ resolved: true, patchApplied: true, durationMs: 2000 }),
      makeResult({ resolved: false, patchApplied: true, durationMs: 1000, status: 'timeout' }),
      makeResult({ resolved: false, patchApplied: false, durationMs: 500, status: 'error' }),
    ];
    const metrics = calculateMetrics(results);
    expect(metrics.totalInstances).toBe(3);
    expect(metrics.resolvedInstances).toBe(1);
    expect(metrics.resolutionRate).toBeCloseTo(1 / 3);
    expect(metrics.patchesApplied).toBe(2);
    expect(metrics.patchApplicationRate).toBeCloseTo(2 / 3);
    expect(metrics.timeouts).toBe(1);
    expect(metrics.errors).toBe(1);
    expect(metrics.totalDurationMs).toBe(3500);
    expect(metrics.avgDurationMs).toBe(Math.round(3500 / 3));
  });
});

// ============================================================================
// calculateRepositoryMetrics
// ============================================================================

describe('calculateRepositoryMetrics', () => {
  it('returns empty for no results', () => {
    expect(calculateRepositoryMetrics([])).toEqual([]);
  });

  it('groups by repository', () => {
    const results = [
      makeResult({ instanceId: 'django__django-1', resolved: true }),
      makeResult({ instanceId: 'django__django-2', resolved: false }),
      makeResult({ instanceId: 'flask__flask-1', resolved: true }),
    ];
    const repoMetrics = calculateRepositoryMetrics(results);
    expect(repoMetrics).toHaveLength(2);

    const django = repoMetrics.find((r) => r.repository === 'django/django');
    expect(django?.totalInstances).toBe(2);
    expect(django?.resolvedInstances).toBe(1);
    expect(django?.resolutionRate).toBeCloseTo(0.5);

    const flask = repoMetrics.find((r) => r.repository === 'flask/flask');
    expect(flask?.totalInstances).toBe(1);
    expect(flask?.resolvedInstances).toBe(1);
  });
});

// ============================================================================
// mapStateToPhase
// ============================================================================

describe('mapStateToPhase', () => {
  it('maps idle to initializing', () => {
    expect(mapStateToPhase('idle')).toBe('initializing');
  });

  it('maps starting to loading_predictions', () => {
    expect(mapStateToPhase('starting')).toBe('loading_predictions');
  });

  it('maps running to evaluating', () => {
    expect(mapStateToPhase('running')).toBe('evaluating');
  });

  it('maps completed to complete', () => {
    expect(mapStateToPhase('completed')).toBe('complete');
  });

  it('maps failed to complete', () => {
    expect(mapStateToPhase('failed')).toBe('complete');
  });

  it('defaults to evaluating for unknown state', () => {
    expect(mapStateToPhase('unknown-state')).toBe('evaluating');
  });
});

// ============================================================================
// transformHarnessProgress
// ============================================================================

describe('transformHarnessProgress', () => {
  it('transforms raw progress', () => {
    const raw = makeProgress();
    const result = transformHarnessProgress(raw, 20);
    expect(result.currentIndex).toBe(5);
    expect(result.totalInstances).toBe(10);
    expect(result.completedInstances).toBe(5);
    expect(result.resolvedSoFar).toBe(3);
    expect(result.currentResolutionRate).toBeCloseTo(3 / 5);
    expect(result.phase).toBe('evaluating');
  });

  it('uses totalPredictions when totalCount is 0', () => {
    const raw = makeProgress({ totalCount: 0 });
    const result = transformHarnessProgress(raw, 20);
    expect(result.totalInstances).toBe(20);
  });

  it('returns 0 resolution rate when no completions', () => {
    const raw = makeProgress({ completedCount: 0, resolvedCount: 0 });
    const result = transformHarnessProgress(raw, 10);
    expect(result.currentResolutionRate).toBe(0);
  });

  it('defaults estimatedRemainingMs to 0', () => {
    const raw = makeProgress();
    const result = transformHarnessProgress(raw, 10);
    expect(result.estimatedRemainingMs).toBe(0);
  });

  it('includes currentInstanceId when provided', () => {
    const raw = makeProgress({ currentInstanceId: 'inst-1' });
    const result = transformHarnessProgress(raw, 10);
    expect(result.currentInstanceId).toBe('inst-1');
  });
});

// ============================================================================
// createProgressAdapter
// ============================================================================

describe('createProgressAdapter', () => {
  it('returns undefined when no callback', () => {
    expect(createProgressAdapter(10)).toBeUndefined();
  });

  it('creates adapter that transforms and forwards progress', () => {
    const received: Array<{ phase: EvaluationPhase }> = [];
    const adapter = createProgressAdapter(10, (progress) => {
      received.push({ phase: progress.phase });
    });
    expect(adapter).toBeDefined();
    adapter!(makeProgress({ state: 'running' }));
    expect(received).toHaveLength(1);
    expect(received[0]?.phase).toBe('evaluating');
  });
});
