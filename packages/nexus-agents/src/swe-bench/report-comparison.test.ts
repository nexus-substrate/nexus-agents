/**
 * Tests for report-comparison.ts
 *
 * Covers comparison report generation, ranking, gap calculation,
 * strength/weakness identification, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { generateComparison, identifyStrengths, identifyWeaknesses } from './report-comparison.js';
import type { EvaluationRunResult, CompetitorResult } from './evaluation-harness-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeMetrics(overrides: Record<string, number> = {}): EvaluationRunResult['metrics'] {
  return {
    totalInstances: 100,
    predictedInstances: 100,
    resolvedInstances: 50,
    resolutionRate: 0.5,
    patchesApplied: 90,
    patchApplicationRate: 0.9,
    timeouts: 5,
    errors: 5,
    avgDurationMs: 1000,
    totalDurationMs: 100000,
    ...overrides,
  } as EvaluationRunResult['metrics'];
}

function makeResult(overrides: Partial<EvaluationRunResult> = {}): EvaluationRunResult {
  return {
    runId: 'run-1',
    datasetName: 'lite',
    modelNameOrPath: 'nexus-agents',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
    metrics: makeMetrics(),
    repositoryMetrics: [],
    instanceResults: [],
    ...overrides,
  } as EvaluationRunResult;
}

function makeCompetitor(name: string, rate: number): CompetitorResult {
  return {
    system: name as never,
    displayName: name,
    variant: 'lite',
    resolutionRate: rate,
    resolvedInstances: Math.round(rate * 100),
  } as unknown as CompetitorResult;
}

// ============================================================================
// generateComparison
// ============================================================================

describe('generateComparison', () => {
  it('calculates ranking among competitors', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.3 }) });
    const competitors = [makeCompetitor('A', 0.5), makeCompetitor('B', 0.2)];
    const comparison = generateComparison(result, competitors);
    // Sorted: A(0.5), nexus(0.3), B(0.2)
    expect(comparison.nexusRanking).toBe(2);
  });

  it('ranks first when best performer', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.9 }) });
    const competitors = [makeCompetitor('A', 0.5), makeCompetitor('B', 0.3)];
    const comparison = generateComparison(result, competitors);
    expect(comparison.nexusRanking).toBe(1);
  });

  it('calculates gap from top correctly', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.4 }) });
    const competitors = [makeCompetitor('A', 0.6)];
    const comparison = generateComparison(result, competitors);
    expect(comparison.gapFromTop).toBeCloseTo(0.2);
  });

  it('gap from top is 0 when top ranked', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.8 }) });
    const competitors = [makeCompetitor('A', 0.5)];
    const comparison = generateComparison(result, competitors);
    expect(comparison.gapFromTop).toBeCloseTo(0);
  });

  it('calculates difference from average', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.5 }) });
    const competitors = [makeCompetitor('A', 0.3), makeCompetitor('B', 0.7)];
    const comparison = generateComparison(result, competitors);
    // Average: (0.5 + 0.3 + 0.7) / 3 = 0.5
    expect(comparison.differenceFromAverage).toBeCloseTo(0);
  });

  it('includes competitors in result', () => {
    const competitors = [makeCompetitor('A', 0.5)];
    const comparison = generateComparison(makeResult(), competitors);
    expect(comparison.competitors).toBe(competitors);
  });

  it('handles empty competitors list', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.5 }) });
    const comparison = generateComparison(result, []);
    expect(comparison.nexusRanking).toBe(1);
    expect(comparison.gapFromTop).toBeCloseTo(0);
  });

  it('includes strengths and weaknesses', () => {
    const comparison = generateComparison(makeResult(), [makeCompetitor('A', 0.3)]);
    expect(Array.isArray(comparison.strengths)).toBe(true);
    expect(Array.isArray(comparison.weaknesses)).toBe(true);
  });
});

// ============================================================================
// identifyStrengths
// ============================================================================

describe('identifyStrengths', () => {
  it('identifies above average resolution rate', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.7 }) });
    const competitors = [makeCompetitor('A', 0.3), makeCompetitor('B', 0.4)];
    const strengths = identifyStrengths(result, competitors);
    expect(strengths).toContain('Above average resolution rate');
  });

  it('identifies high patch application rate', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.1, patchApplicationRate: 0.95 }),
    });
    const strengths = identifyStrengths(result, [makeCompetitor('A', 0.5)]);
    expect(strengths).toContain('High patch application success rate');
  });

  it('returns empty when below average and low patch rate', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.2, patchApplicationRate: 0.5 }),
    });
    const strengths = identifyStrengths(result, [makeCompetitor('A', 0.5)]);
    expect(strengths).toHaveLength(0);
  });

  it('handles empty competitors', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.5, patchApplicationRate: 0.5 }),
    });
    const strengths = identifyStrengths(result, []);
    // Average is 0 when no competitors, so 0.5 > 0 → strength
    expect(strengths).toContain('Above average resolution rate');
  });
});

// ============================================================================
// identifyWeaknesses
// ============================================================================

describe('identifyWeaknesses', () => {
  it('identifies below average resolution rate', () => {
    const result = makeResult({ metrics: makeMetrics({ resolutionRate: 0.2 }) });
    const competitors = [makeCompetitor('A', 0.5), makeCompetitor('B', 0.6)];
    const weaknesses = identifyWeaknesses(result, competitors);
    expect(weaknesses).toContain('Below average resolution rate');
  });

  it('identifies high error rate', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.8, totalInstances: 100, errors: 15 }),
    });
    const weaknesses = identifyWeaknesses(result, [makeCompetitor('A', 0.5)]);
    expect(weaknesses).toContain('High error rate during evaluation');
  });

  it('returns empty when above average and low errors', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.8, totalInstances: 100, errors: 5 }),
    });
    const weaknesses = identifyWeaknesses(result, [makeCompetitor('A', 0.5)]);
    expect(weaknesses).toHaveLength(0);
  });

  it('error threshold is 10% of total instances', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.8, totalInstances: 100, errors: 10 }),
    });
    // 10 is not > 100 * 0.1, so no weakness
    const weaknesses = identifyWeaknesses(result, [makeCompetitor('A', 0.5)]);
    expect(weaknesses).not.toContain('High error rate during evaluation');
  });

  it('handles empty competitors', () => {
    const result = makeResult({
      metrics: makeMetrics({ resolutionRate: 0.5, totalInstances: 100, errors: 5 }),
    });
    const weaknesses = identifyWeaknesses(result, []);
    // Average is 0 when no competitors, 0.5 is not < 0
    expect(weaknesses).not.toContain('Below average resolution rate');
  });
});
