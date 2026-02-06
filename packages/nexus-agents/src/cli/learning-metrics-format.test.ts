/**
 * Tests for learning-metrics-format utilities
 *
 * Verifies formatting functions for the learning metrics dashboard output.
 * (Source: Issue #284, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import { formatAsciiOutput, formatJsonOutput } from './learning-metrics-format.js';
import type { LearningMetricsResult, LearningMetricsOptions } from './learning-metrics-types.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeResult(overrides?: Partial<LearningMetricsResult>) {
  const base: LearningMetricsResult = {
    timestamp: '2026-02-06T12:00:00-05:00',
    periodHours: 24,
    models: [
      {
        name: 'claude',
        pullCount: 50,
        avgReward: 0.82,
        cumulativeReward: 41,
        successRate: 0.9,
        avgLatencyMs: 1200,
        avgQuality: 0.88,
        selectionPercent: 60,
      },
      {
        name: 'gemini',
        pullCount: 30,
        avgReward: 0.65,
        cumulativeReward: 19.5,
        successRate: 0.75,
        avgLatencyMs: 800,
        avgQuality: 0.72,
        selectionPercent: 35,
      },
    ],
    banditProgress: {
      totalPulls: 80,
      explorationRatio: 0.15,
      armDistribution: [
        { name: 'claude', percent: 60 },
        { name: 'gemini', percent: 35 },
      ],
      topFeatures: [
        { feature: 'taskComplexity', importance: 0.45, direction: 'positive' },
        { feature: 'contextLength', importance: 0.3, direction: 'negative' },
      ],
    },
    rewardTrend: {
      current: 0.82,
      previous: 0.75,
      direction: 'improving',
      changePercent: 9.3,
    },
    feedbackLoop: {
      totalDecisions: 100,
      totalOutcomes: 85,
      correlationRate: 0.78,
      avgReward: 0.76,
      outcomeDistribution: { success: 60, partial: 15, failure: 10 },
    },
    summary: {
      totalRoutings: 100,
      overallSuccessRate: 0.85,
      avgReward: 0.76,
      learningStatus: 'exploiting',
    },
  };
  return { ...base, ...overrides };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOptions(overrides?: Partial<LearningMetricsOptions>) {
  const base: LearningMetricsOptions = {
    period: 24,
    format: 'ascii',
    banditStats: false,
    showTrends: true,
  };
  return { ...base, ...overrides };
}

describe('learning-metrics-format', () => {
  describe('formatAsciiOutput', () => {
    it('should include header with period hours', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions());
      expect(output).toContain('Learning Metrics Dashboard');
      expect(output).toContain('24h');
    });

    it('should include summary section with status', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions());
      expect(output).toContain('Summary:');
      expect(output).toContain('exploiting');
      expect(output).toContain('100');
      expect(output).toContain('85.0%');
      expect(output).toContain('0.760');
    });

    it('should include model stats', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions());
      expect(output).toContain('Model Performance:');
      expect(output).toContain('claude');
      expect(output).toContain('gemini');
      expect(output).toContain('60.0');
      expect(output).toContain('35.0');
    });

    it('should include feedback loop section', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions());
      expect(output).toContain('Feedback Loop:');
      expect(output).toContain('Decisions:');
      expect(output).toContain('Outcomes:');
      expect(output).toContain('Correlation Rate:');
    });

    it('should include reward trend when showTrends is true', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions({ showTrends: true }));
      expect(output).toContain('Reward Trend:');
      expect(output).toContain('0.820');
      expect(output).toContain('0.750');
      expect(output).toContain('improving');
      expect(output).toContain('+9.3%');
    });

    it('should omit reward trend when showTrends is false', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions({ showTrends: false }));
      expect(output).not.toContain('Reward Trend:');
    });

    it('should include bandit progress when banditStats is true', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions({ banditStats: true }));
      expect(output).toContain('LinUCB Bandit Progress:');
      expect(output).toContain('Total Pulls:');
      expect(output).toContain('Exploration Ratio:');
      expect(output).toContain('Top Feature Importances:');
    });

    it('should omit bandit progress when banditStats is false', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions({ banditStats: false }));
      expect(output).not.toContain('LinUCB Bandit Progress:');
      expect(output).not.toContain('Top Feature Importances:');
    });

    it('should show exploring status emoji', () => {
      const result = makeResult({
        summary: {
          totalRoutings: 10,
          overallSuccessRate: 0.5,
          avgReward: 0.4,
          learningStatus: 'exploring',
        },
      });
      const output = formatAsciiOutput(result, makeOptions());
      expect(output).toContain('exploring');
    });

    it('should show balanced status emoji', () => {
      const result = makeResult({
        summary: {
          totalRoutings: 50,
          overallSuccessRate: 0.7,
          avgReward: 0.6,
          learningStatus: 'balanced',
        },
      });
      const output = formatAsciiOutput(result, makeOptions());
      expect(output).toContain('balanced');
    });

    it('should handle empty models array', () => {
      const result = makeResult({ models: [] });
      const output = formatAsciiOutput(result, makeOptions());
      expect(output).toContain('No model data available');
    });

    it('should handle empty arm distribution', () => {
      const result = makeResult({
        banditProgress: {
          totalPulls: 0,
          explorationRatio: 0,
          armDistribution: [],
          topFeatures: [],
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ banditStats: true }));
      expect(output).toContain('LinUCB Bandit Progress:');
      expect(output).not.toContain('Arm Distribution:');
    });

    it('should handle empty features array', () => {
      const result = makeResult({
        banditProgress: {
          totalPulls: 5,
          explorationRatio: 0.2,
          armDistribution: [],
          topFeatures: [],
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ banditStats: true }));
      expect(output).toContain('No feature data available');
    });

    it('should show healthy exploration ratio', () => {
      const result = makeResult({
        banditProgress: {
          totalPulls: 80,
          explorationRatio: 0.2,
          armDistribution: [],
          topFeatures: [],
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ banditStats: true }));
      expect(output).toContain('healthy');
    });

    it('should show adjust for unhealthy exploration ratio', () => {
      const result = makeResult({
        banditProgress: {
          totalPulls: 80,
          explorationRatio: 0.05,
          armDistribution: [],
          topFeatures: [],
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ banditStats: true }));
      expect(output).toContain('adjust');
    });

    it('should show declining trend arrow', () => {
      const result = makeResult({
        rewardTrend: {
          current: 0.6,
          previous: 0.8,
          direction: 'declining',
          changePercent: -25.0,
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ showTrends: true }));
      expect(output).toContain('declining');
      expect(output).toContain('-25.0%');
    });

    it('should show stable trend arrow', () => {
      const result = makeResult({
        rewardTrend: {
          current: 0.75,
          previous: 0.75,
          direction: 'stable',
          changePercent: 0,
        },
      });
      const output = formatAsciiOutput(result, makeOptions({ showTrends: true }));
      expect(output).toContain('stable');
      expect(output).toContain('+0.0%');
    });

    it('should skip distribution breakdown when total is zero', () => {
      const result = makeResult({
        feedbackLoop: {
          totalDecisions: 0,
          totalOutcomes: 0,
          correlationRate: 0,
          avgReward: 0,
          outcomeDistribution: { success: 0, partial: 0, failure: 0 },
        },
      });
      const output = formatAsciiOutput(result, makeOptions());
      expect(output).toContain('Feedback Loop:');
      expect(output).toContain('Decisions: 0');
      // The percentage distribution line with symbols is omitted
      expect(output).not.toContain('~');
    });

    it('should show feature direction arrows', () => {
      const output = formatAsciiOutput(makeResult(), makeOptions({ banditStats: true }));
      expect(output).toContain('taskComplexity');
      expect(output).toContain('contextLength');
    });

    it('should handle boundary selection percentages (0% and 100%)', () => {
      const zeroResult = makeResult({
        models: [
          {
            name: 'idle',
            pullCount: 0,
            avgReward: 0,
            cumulativeReward: 0,
            successRate: 0,
            avgLatencyMs: 0,
            avgQuality: 0,
            selectionPercent: 0,
          },
        ],
      });
      expect(formatAsciiOutput(zeroResult, makeOptions())).toContain('idle');
      const fullResult = makeResult({
        models: [
          {
            name: 'dominant',
            pullCount: 100,
            avgReward: 0.95,
            cumulativeReward: 95,
            successRate: 1.0,
            avgLatencyMs: 500,
            avgQuality: 0.99,
            selectionPercent: 100,
          },
        ],
      });
      expect(formatAsciiOutput(fullResult, makeOptions())).toContain('100.0');
    });

    it('should handle large totalRoutings with locale formatting', () => {
      const result = makeResult({
        summary: {
          totalRoutings: 1000000,
          overallSuccessRate: 0.9,
          avgReward: 0.8,
          learningStatus: 'exploiting',
        },
      });
      const output = formatAsciiOutput(result, makeOptions());
      expect(output).toContain('1,000,000');
    });
  });

  describe('formatJsonOutput', () => {
    it('should return valid JSON', () => {
      const result = makeResult();
      const output = formatJsonOutput(result);
      const parsed = JSON.parse(output) as LearningMetricsResult;
      expect(parsed.timestamp).toBe(result.timestamp);
      expect(parsed.periodHours).toBe(24);
    });

    it('should include all top-level fields', () => {
      const output = formatJsonOutput(makeResult());
      const parsed = JSON.parse(output) as LearningMetricsResult;
      expect(parsed.models).toBeDefined();
      expect(parsed.banditProgress).toBeDefined();
      expect(parsed.rewardTrend).toBeDefined();
      expect(parsed.feedbackLoop).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('should be pretty-printed', () => {
      const output = formatJsonOutput(makeResult());
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('should preserve nested model data', () => {
      const result = makeResult();
      const output = formatJsonOutput(result);
      const parsed = JSON.parse(output) as LearningMetricsResult;
      expect(parsed.models).toHaveLength(2);
      expect(parsed.models[0]!.name).toBe('claude');
      expect(parsed.models[1]!.avgReward).toBe(0.65);
    });
  });
});
