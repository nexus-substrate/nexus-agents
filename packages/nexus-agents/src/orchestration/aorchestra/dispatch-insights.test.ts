import { describe, it, expect } from 'vitest';
import {
  analyzeDispatch,
  OUTLIER_RATIO_THRESHOLD,
  type DispatchInsights,
  type RoleProfile,
} from './dispatch-insights.js';
import type { WorkerResult } from './worker-dispatcher.js';

function makeResult(
  role: string,
  status: 'success' | 'error' | 'skipped',
  durationMs: number,
  overrides?: Partial<WorkerResult>
): WorkerResult {
  return {
    role,
    subTask: `task-${role}`,
    output: status === 'success' ? 'output content here' : '',
    status,
    durationMs,
    ...overrides,
  };
}

describe('analyzeDispatch', () => {
  it('returns empty insights for empty results', () => {
    const insights = analyzeDispatch([]);
    expect(insights.totalWorkers).toBe(0);
    expect(insights.overallSuccessRate).toBe(0);
    expect(insights.roleProfiles).toEqual([]);
    expect(insights.errorClusters).toEqual([]);
    expect(insights.durationOutliers).toEqual([]);
    expect(insights.dominantErrorType).toBeUndefined();
  });

  it('computes overall success rate correctly', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'success', 100),
      makeResult('security', 'error', 50, { error: 'failed', errorType: 'timeout' }),
      makeResult('testing', 'success', 200),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.overallSuccessRate).toBeCloseTo(2 / 3);
    expect(insights.totalWorkers).toBe(3);
  });

  it('excludes skipped workers from analysis', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'success', 100),
      makeResult('security', 'skipped', 0),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.totalWorkers).toBe(1);
    expect(insights.overallSuccessRate).toBe(1);
  });

  // ---- Role Profiles ----

  it('groups results by role with correct stats', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'success', 100),
      makeResult('code', 'success', 200),
      makeResult('security', 'error', 50, { error: 'timeout', errorType: 'timeout' }),
    ];
    const insights = analyzeDispatch(results);
    const codeProfile = insights.roleProfiles.find((p: RoleProfile) => p.role === 'code');
    expect(codeProfile).toBeDefined();
    expect(codeProfile?.total).toBe(2);
    expect(codeProfile?.successes).toBe(2);
    expect(codeProfile?.errors).toBe(0);
    expect(codeProfile?.successRate).toBe(1);
    expect(codeProfile?.avgDurationMs).toBe(150);

    const secProfile = insights.roleProfiles.find((p: RoleProfile) => p.role === 'security');
    expect(secProfile?.successRate).toBe(0);
    expect(secProfile?.errors).toBe(1);
  });

  // ---- Error Clusters ----

  it('clusters errors by type sorted by count', () => {
    const results: WorkerResult[] = [
      makeResult('a', 'error', 10, { error: 'timed out', errorType: 'timeout' }),
      makeResult('b', 'error', 20, { error: '429 rate limit', errorType: 'rate_limit' }),
      makeResult('c', 'error', 30, { error: 'timed out again', errorType: 'timeout' }),
      makeResult('d', 'success', 100),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.errorClusters).toHaveLength(2);
    expect(insights.errorClusters[0]?.errorType).toBe('timeout');
    expect(insights.errorClusters[0]?.count).toBe(2);
    expect(insights.errorClusters[1]?.errorType).toBe('rate_limit');
    expect(insights.errorClusters[1]?.count).toBe(1);
  });

  it('identifies dominant error type', () => {
    const results: WorkerResult[] = [
      makeResult('a', 'error', 10, { error: 'rate limit', errorType: 'rate_limit' }),
      makeResult('b', 'error', 20, { error: 'rate limit', errorType: 'rate_limit' }),
      makeResult('c', 'error', 30, { error: 'logic fail', errorType: 'logic_error' }),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.dominantErrorType).toBe('rate_limit');
  });

  it('truncates error sample to 200 chars', () => {
    const longError = 'x'.repeat(300);
    const results: WorkerResult[] = [
      makeResult('a', 'error', 10, { error: longError, errorType: 'logic_error' }),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.errorClusters[0]?.sample.length).toBe(200);
  });

  // ---- Duration Outliers ----

  it('finds duration outliers above threshold', () => {
    const results: WorkerResult[] = [
      makeResult('fast1', 'success', 100),
      makeResult('fast2', 'success', 100),
      makeResult('slow', 'success', 500),
    ];
    const insights = analyzeDispatch(results);
    // Median of [100, 100, 500] = 100. 500/100 = 5x > 2x threshold
    expect(insights.durationOutliers).toHaveLength(1);
    expect(insights.durationOutliers[0]?.role).toBe('slow');
    expect(insights.durationOutliers[0]?.ratio).toBe(5);
  });

  it('returns no outliers when all durations are similar', () => {
    const results: WorkerResult[] = [
      makeResult('a', 'success', 100),
      makeResult('b', 'success', 110),
      makeResult('c', 'success', 90),
    ];
    const insights = analyzeDispatch(results);
    expect(insights.durationOutliers).toHaveLength(0);
  });

  it('ignores error results for duration outlier analysis', () => {
    const results: WorkerResult[] = [
      makeResult('a', 'success', 100),
      makeResult('b', 'error', 9999, { error: 'fail', errorType: 'timeout' }),
    ];
    const insights = analyzeDispatch(results);
    // Only 1 success → median is 100, no outliers possible
    expect(insights.durationOutliers).toHaveLength(0);
  });

  it('exports OUTLIER_RATIO_THRESHOLD constant', () => {
    expect(OUTLIER_RATIO_THRESHOLD).toBe(2.0);
  });

  // ---- Comprehensive scenario ----

  it('handles mixed results with all insight types', () => {
    const results: WorkerResult[] = [
      makeResult('code', 'success', 100),
      makeResult('security', 'success', 120),
      makeResult('testing', 'success', 800),
      makeResult('docs', 'error', 50, { error: 'rate limit hit', errorType: 'rate_limit' }),
      makeResult('architecture', 'skipped', 0),
    ];
    const insights: DispatchInsights = analyzeDispatch(results);
    expect(insights.totalWorkers).toBe(4); // excludes skipped
    expect(insights.overallSuccessRate).toBe(0.75);
    expect(insights.roleProfiles).toHaveLength(4);
    expect(insights.errorClusters).toHaveLength(1);
    expect(insights.dominantErrorType).toBe('rate_limit');
    // Median of [100, 120, 800] = 120. 800/120 ≈ 6.67 > 2.0 threshold
    expect(insights.durationOutliers).toHaveLength(1);
    expect(insights.durationOutliers[0]?.role).toBe('testing');
  });
});
