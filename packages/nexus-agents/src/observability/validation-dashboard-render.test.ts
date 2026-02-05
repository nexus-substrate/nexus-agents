/**
 * Tests for Validation Dashboard Rendering Helpers
 * @module observability/validation-dashboard-render.test
 */

import { describe, it, expect } from 'vitest';
import type {
  DashboardSummary,
  DashboardRenderOptions,
  DashboardHealthIndicators,
  LearningProgress,
  ModelPerformanceSummary,
  TaskTypePerformance,
} from './validation-dashboard-types.js';
import {
  renderProgressBar,
  renderHeader,
  renderOverview,
  renderModelPerformance,
  renderTaskTypePerformance,
  renderLearningProgress,
  renderHealthIndicators,
} from './validation-dashboard-render.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCI(lower: number, estimate: number, upper: number) {
  return { lower, estimate, upper, n: 100, confidence: 0.95, standardError: 0.05 };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDistStats() {
  return {
    mean: 0.8,
    median: 0.75,
    stdDev: 0.1,
    variance: 0.01,
    min: 0.5,
    max: 1.0,
    n: 100,
    percentiles: { p5: 0.55, p25: 0.65, p50: 0.75, p75: 0.85, p95: 0.95 },
  };
}

function makeModelSummary(overrides?: Partial<ModelPerformanceSummary>): ModelPerformanceSummary {
  return {
    model: 'claude',
    n: 100,
    successRate: 0.85,
    successRateCI: makeCI(0.78, 0.85, 0.92),
    avgReward: 0.8,
    rewardStats: makeDistStats(),
    avgLatencyMs: 1500,
    winRate: 0.65,
    winRateCI: makeCI(0.55, 0.65, 0.75),
    costEfficiency: 0.5,
    ...overrides,
  };
}

function makeSummary(overrides?: Partial<DashboardSummary>): DashboardSummary {
  return {
    period: '24h',
    periodStart: '2026-02-04T00:00:00.000Z',
    periodEnd: '2026-02-05T00:00:00.000Z',
    totalDecisions: 200,
    totalOutcomes: 180,
    overallSuccessRate: 0.85,
    overallSuccessRateCI: makeCI(0.8, 0.85, 0.9),
    overallAvgReward: 0.75,
    modelPerformance: [],
    taskTypePerformance: [],
    learningProgress: {
      explorationRate: 0.15,
      explorationRateTrend: -0.02,
      cumulativeRegret: 5.2,
      avgRegret: 0.026,
      optimalRate: 0.82,
      featureImportance: [],
      convergenceScore: 0.9,
    },
    healthIndicators: {
      hasMinimumData: true,
      isLearning: true,
      healthyExploration: true,
      noUnderperformers: true,
      healthScore: 1.0,
      warnings: [],
    },
    ...overrides,
  };
}

// ============================================================================
// renderProgressBar
// ============================================================================

describe('renderProgressBar', () => {
  it('renders empty bar for 0 value', () => {
    const bar = renderProgressBar(0, 1, 10);
    expect(bar).toBe('[░░░░░░░░░░]');
  });

  it('renders full bar for max value', () => {
    const bar = renderProgressBar(1, 1, 10);
    expect(bar).toBe('[██████████]');
  });

  it('renders half-filled bar', () => {
    const bar = renderProgressBar(0.5, 1, 10);
    expect(bar).toBe('[█████░░░░░]');
  });

  it('uses default width of 20', () => {
    const bar = renderProgressBar(0.5, 1);
    // Total chars = '[' + 10 filled + 10 empty + ']' = 22
    expect(bar.length).toBe(22);
  });

  it('handles width 1', () => {
    const bar = renderProgressBar(0.5, 1, 1);
    expect(bar).toBe('[█]');
  });
});

// ============================================================================
// renderHeader
// ============================================================================

describe('renderHeader', () => {
  it('contains the dashboard title', () => {
    const summary = makeSummary();
    const header = renderHeader(summary, 80);
    expect(header).toContain('Learning Validation Dashboard');
  });

  it('centers the title with padding', () => {
    const summary = makeSummary();
    const header = renderHeader(summary, 100);
    expect(header.startsWith(' ')).toBe(true);
  });

  it('handles maxWidth smaller than title', () => {
    const summary = makeSummary();
    const header = renderHeader(summary, 10);
    expect(header).toContain('Learning Validation Dashboard');
  });
});

// ============================================================================
// renderOverview
// ============================================================================

describe('renderOverview', () => {
  it('shows period info', () => {
    const overview = renderOverview(makeSummary());
    expect(overview).toContain('Period: 24h');
    expect(overview).toContain('2026-02-04');
    expect(overview).toContain('2026-02-05');
  });

  it('shows total decisions', () => {
    const overview = renderOverview(makeSummary());
    expect(overview).toContain('Total Decisions: 200');
  });

  it('shows success rate with CI', () => {
    const overview = renderOverview(makeSummary());
    expect(overview).toContain('Success Rate: 85.0%');
    expect(overview).toContain('95% CI');
  });

  it('shows average reward', () => {
    const overview = renderOverview(makeSummary());
    expect(overview).toContain('Average Reward: 0.750');
  });
});

// ============================================================================
// renderModelPerformance
// ============================================================================

describe('renderModelPerformance', () => {
  it('returns no data message for empty models', () => {
    const result = renderModelPerformance([], { showConfidenceIntervals: true });
    expect(result).toBe('Model Performance: No data');
  });

  it('renders model rows', () => {
    const models = [makeModelSummary()];
    const result = renderModelPerformance(models, { showConfidenceIntervals: false });
    expect(result).toContain('claude');
    expect(result).toContain('85.0%');
  });

  it('includes CI when showConfidenceIntervals is true', () => {
    const models = [makeModelSummary()];
    const result = renderModelPerformance(models, { showConfidenceIntervals: true });
    expect(result).toContain('95% CI');
  });

  it('renders multiple models', () => {
    const models = [
      makeModelSummary({ model: 'claude', successRate: 0.85 }),
      makeModelSummary({ model: 'gemini', successRate: 0.78, n: 50 }),
    ];
    const result = renderModelPerformance(models, { showConfidenceIntervals: false });
    expect(result).toContain('claude');
    expect(result).toContain('gemini');
  });

  it('includes separator lines', () => {
    const models = [makeModelSummary()];
    const result = renderModelPerformance(models, { showConfidenceIntervals: false });
    expect(result).toContain('-'.repeat(80));
  });
});

// ============================================================================
// renderTaskTypePerformance
// ============================================================================

describe('renderTaskTypePerformance', () => {
  it('renders task type header', () => {
    const result = renderTaskTypePerformance([]);
    expect(result).toContain('Task Type Performance:');
  });

  it('renders task type rows', () => {
    const taskTypes: TaskTypePerformance[] = [
      {
        taskType: 'code_review',
        modelPerformance: [],
        bestModel: 'claude',
        worstModel: 'codex',
      },
    ];
    const result = renderTaskTypePerformance(taskTypes);
    expect(result).toContain('code_review');
    expect(result).toContain('Best=claude');
    expect(result).toContain('Worst=codex');
  });
});

// ============================================================================
// renderLearningProgress
// ============================================================================

describe('renderLearningProgress', () => {
  const progress: LearningProgress = {
    explorationRate: 0.15,
    explorationRateTrend: -0.02,
    cumulativeRegret: 5.2,
    avgRegret: 0.026,
    optimalRate: 0.82,
    featureImportance: [
      { feature: 'task_complexity', importance: 0.8 },
      { feature: 'context_length', importance: 0.6 },
    ],
    convergenceScore: 0.9,
  };

  it('shows exploration rate', () => {
    const result = renderLearningProgress(progress, {});
    expect(result).toContain('Exploration Rate:');
    expect(result).toContain('15.0%');
  });

  it('shows optimal decision rate', () => {
    const result = renderLearningProgress(progress, {});
    expect(result).toContain('Optimal Decision Rate:');
    expect(result).toContain('82.0%');
  });

  it('shows cumulative regret', () => {
    const result = renderLearningProgress(progress, {});
    expect(result).toContain('Cumulative Regret: 5.20');
  });

  it('shows convergence score', () => {
    const result = renderLearningProgress(progress, {});
    expect(result).toContain('Convergence Score: 90%');
  });

  it('shows feature importance when enabled', () => {
    const opts: DashboardRenderOptions = { showFeatureImportance: true };
    const result = renderLearningProgress(progress, opts);
    expect(result).toContain('Top Features:');
    expect(result).toContain('task_complexity');
  });

  it('hides feature importance when disabled', () => {
    const opts: DashboardRenderOptions = { showFeatureImportance: false };
    const result = renderLearningProgress(progress, opts);
    expect(result).not.toContain('Top Features:');
  });
});

// ============================================================================
// renderHealthIndicators
// ============================================================================

describe('renderHealthIndicators', () => {
  it('shows all healthy indicators', () => {
    const health: DashboardHealthIndicators = {
      hasMinimumData: true,
      isLearning: true,
      healthyExploration: true,
      noUnderperformers: true,
      healthScore: 1.0,
      warnings: [],
    };
    const result = renderHealthIndicators(health);
    expect(result).toContain('Health Indicators:');
    expect((result.match(/✓/g) ?? []).length).toBe(4);
    expect(result).toContain('Overall Health: 100%');
  });

  it('shows failing indicators', () => {
    const health: DashboardHealthIndicators = {
      hasMinimumData: false,
      isLearning: false,
      healthyExploration: false,
      noUnderperformers: false,
      healthScore: 0.5,
      warnings: [],
    };
    const result = renderHealthIndicators(health);
    expect((result.match(/✗/g) ?? []).length).toBe(4);
    expect(result).toContain('Overall Health: 50%');
  });

  it('shows warnings when present', () => {
    const health: DashboardHealthIndicators = {
      hasMinimumData: true,
      isLearning: true,
      healthyExploration: false,
      noUnderperformers: true,
      healthScore: 0.9,
      warnings: ['Exploration rate too low'],
    };
    const result = renderHealthIndicators(health);
    expect(result).toContain('Warnings:');
    expect(result).toContain('Exploration rate too low');
  });

  it('omits warnings section when empty', () => {
    const health: DashboardHealthIndicators = {
      hasMinimumData: true,
      isLearning: true,
      healthyExploration: true,
      noUnderperformers: true,
      healthScore: 1.0,
      warnings: [],
    };
    const result = renderHealthIndicators(health);
    expect(result).not.toContain('Warnings:');
  });
});
