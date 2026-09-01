/**
 * nexus-agents/cli - Learning Metrics Command Tests
 *
 * Tests for the learning metrics CLI command including argument parsing,
 * metrics gathering, and output formatting.
 *
 * (Source: Issue #284 - Learning metrics dashboard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseLearningMetricsArgs,
  learningMetricsCommand,
  runLearningMetrics,
  DEFAULT_LEARNING_METRICS_OPTIONS,
  type LearningMetricsContext,
} from './learning-metrics-command.js';
import type { LearningMetricsOptions } from './learning-metrics-types.js';

describe('parseLearningMetricsArgs', () => {
  it('should return defaults for empty args', () => {
    const result = parseLearningMetricsArgs([]);
    expect(result).toEqual({
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
  });

  it('should parse --period flag', () => {
    const result = parseLearningMetricsArgs(['--period', '48']);
    expect(result.period).toBe(48);
  });

  it('should parse -p shorthand', () => {
    const result = parseLearningMetricsArgs(['-p', '72']);
    expect(result.period).toBe(72);
  });

  it('should ignore invalid period values', () => {
    const result = parseLearningMetricsArgs(['--period', 'invalid']);
    expect(result.period).toBe(DEFAULT_LEARNING_METRICS_OPTIONS.period);
  });

  it('should ignore negative period values', () => {
    const result = parseLearningMetricsArgs(['--period', '-5']);
    expect(result.period).toBe(DEFAULT_LEARNING_METRICS_OPTIONS.period);
  });

  it('should parse --json flag', () => {
    const result = parseLearningMetricsArgs(['--json']);
    expect(result.format).toBe('json');
  });

  it('should parse --bandit-stats flag', () => {
    const result = parseLearningMetricsArgs(['--bandit-stats']);
    expect(result.banditStats).toBe(true);
  });

  it('should parse --no-trends flag', () => {
    const result = parseLearningMetricsArgs(['--no-trends']);
    expect(result.showTrends).toBe(false);
  });

  it('should parse --export flag and set format to json', () => {
    const result = parseLearningMetricsArgs(['--export', '/tmp/metrics.json']);
    expect(result.exportPath).toBe('/tmp/metrics.json');
    expect(result.format).toBe('json');
  });

  it('should handle multiple flags combined', () => {
    const result = parseLearningMetricsArgs([
      '--period',
      '168',
      '--json',
      '--bandit-stats',
      '--no-trends',
    ]);
    expect(result.period).toBe(168);
    expect(result.format).toBe('json');
    expect(result.banditStats).toBe(true);
    expect(result.showTrends).toBe(false);
  });
});

describe('learningMetricsCommand', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let stdoutOutput: string;

  beforeEach(() => {
    stdoutOutput = '';
    originalStdoutWrite = process.stdout.write;

    // Mock stdout
    process.stdout.write = vi.fn((chunk: unknown) => {
      stdoutOutput += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  it('should return 0 for successful execution', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    };
    const exitCode = learningMetricsCommand(options);
    expect(exitCode).toBe(0);
  });

  it('should output ASCII format by default', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    };
    learningMetricsCommand(options);
    expect(stdoutOutput).toContain('Learning Metrics Dashboard');
  });

  it('should output JSON format when requested', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'json',
      banditStats: false,
      showTrends: true,
    };
    learningMetricsCommand(options);
    const parsed = JSON.parse(stdoutOutput.trim()) as unknown;
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('periodHours', 24);
  });

  it('should include model metrics in output', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'json',
      banditStats: false,
      showTrends: true,
    };
    learningMetricsCommand(options);
    const parsed = JSON.parse(stdoutOutput.trim()) as { models: unknown[] };
    expect(parsed.models).toBeDefined();
    expect(Array.isArray(parsed.models)).toBe(true);
  });

  it('should include feedback loop stats', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'json',
      banditStats: false,
      showTrends: true,
    };
    learningMetricsCommand(options);
    const parsed = JSON.parse(stdoutOutput.trim()) as { feedbackLoop: unknown };
    expect(parsed.feedbackLoop).toBeDefined();
  });

  it('should include reward trend when showTrends is true', () => {
    const options: LearningMetricsOptions = {
      period: 24,
      format: 'json',
      banditStats: false,
      showTrends: true,
    };
    learningMetricsCommand(options);
    const parsed = JSON.parse(stdoutOutput.trim()) as { rewardTrend: unknown };
    expect(parsed.rewardTrend).toBeDefined();
  });

  it('should handle context with mock bandit', () => {
    const mockBandit = {
      getDetailedStats: vi.fn().mockReturnValue([
        {
          name: 'claude',
          pullCount: 100,
          avgReward: 0.8,
          cumulativeReward: 80,
          learnedWeights: [0.5, 0.3, 0.2],
          featureImportance: [{ feature: 'taskComplexity', importance: 0.5 }],
        },
      ]),
      getExplorationStats: vi.fn().mockReturnValue({
        totalPulls: 100,
        explorationRatio: 0.3,
        armDistribution: [{ name: 'claude', proportion: 0.6 }],
      }),
    };

    const context: LearningMetricsContext = {
      bandit: mockBandit as never,
    };

    const options: LearningMetricsOptions = {
      period: 24,
      format: 'json',
      banditStats: true,
      showTrends: true,
    };

    learningMetricsCommand(options, context);
    expect(mockBandit.getDetailedStats).toHaveBeenCalled();
    expect(mockBandit.getExplorationStats).toHaveBeenCalled();
  });
});

describe('runLearningMetrics', () => {
  it('should return metrics result with defaults', () => {
    const result = runLearningMetrics();
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('periodHours', 24);
    expect(result).toHaveProperty('models');
    expect(result).toHaveProperty('banditProgress');
    expect(result).toHaveProperty('rewardTrend');
    expect(result).toHaveProperty('feedbackLoop');
    expect(result).toHaveProperty('summary');
  });

  it('should respect custom period option', () => {
    const result = runLearningMetrics(undefined, { period: 48 });
    expect(result.periodHours).toBe(48);
  });

  it('should include summary with learning status', () => {
    const result = runLearningMetrics();
    expect(result.summary).toHaveProperty('totalRoutings');
    expect(result.summary).toHaveProperty('overallSuccessRate');
    expect(result.summary).toHaveProperty('avgReward');
    expect(result.summary).toHaveProperty('learningStatus');
    // 'unmeasured' joined the union in #5267. This list omitted it, so the
    // assertion would have failed on the honest value while passing on the
    // fabricated 'exploiting' — a whitelist that excluded the truth.
    expect(['exploring', 'exploiting', 'balanced', 'unmeasured']).toContain(
      result.summary.learningStatus
    );
  });

  // #5267: this asserted `topFeatures.length > 0` with no bandit supplied,
  // which pinned the fabricated five-entry default as intended behaviour.
  it('reports no bandit features when nothing was observed', () => {
    const result = runLearningMetrics();
    expect(result.banditProgress.topFeatures).toEqual([]);
  });
});

describe('DEFAULT_LEARNING_METRICS_OPTIONS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_LEARNING_METRICS_OPTIONS.period).toBe(24);
    expect(DEFAULT_LEARNING_METRICS_OPTIONS.format).toBe('ascii');
    expect(DEFAULT_LEARNING_METRICS_OPTIONS.banditStats).toBe(false);
    expect(DEFAULT_LEARNING_METRICS_OPTIONS.showTrends).toBe(true);
  });
});
