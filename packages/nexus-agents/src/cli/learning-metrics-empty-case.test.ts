/**
 * learning-metrics: the empty case is not a measurement (#7180).
 *
 * The 11.0.0 e2e run printed `Total Routings: 0 / Success Rate: 0.0% / Avg
 * Reward: 0.000` beside "reconstructed (192 empirical outcomes)", and per model
 * `reward: 0.70 | success: 0%`. The two halves of that per-model line come from
 * different instruments: `reward` is the LinUCB arm's mean reward (populated by
 * outcome replay), while `success` and `selection %` come from the routing
 * metrics collector, which the standalone CLI never supplies — so they were a
 * `?? 0` default rendered as a measured 0%.
 *
 * Empty case, named: zero routing samples means the routing-sourced fields are
 * `unmeasured`; zero bandit pulls means the bandit reward is `unmeasured`.
 */

import { describe, it, expect } from 'vitest';
import { formatAsciiOutput, formatJsonOutput } from './learning-metrics-format.js';
import { gatherLearningMetrics } from './learning-metrics-logic.js';
import type {
  LearningMetricsOptions,
  LearningMetricsResult,
  ModelLearningStats,
} from './learning-metrics-types.js';
import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import { RoutingMetricsCollector } from '../observability/routing-metrics.js';

const OPTIONS: LearningMetricsOptions = {
  period: 24,
  format: 'ascii',
  banditStats: false,
  showTrends: false,
};

/** Strips ANSI so assertions read the text a terminal shows. */
function plain(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function model(overrides: Partial<ModelLearningStats>): ModelLearningStats {
  return {
    name: 'claude',
    pullCount: 12,
    avgReward: 0.7,
    cumulativeReward: 8.4,
    successRate: 0,
    avgLatencyMs: 0,
    avgQuality: 0,
    selectionPercent: 0,
    rewardSource: 'bandit',
    routingSelectionCount: 0,
    ...overrides,
  };
}

function result(
  summary: Partial<LearningMetricsResult['summary']>,
  models: readonly ModelLearningStats[]
): LearningMetricsResult {
  return {
    timestamp: '2026-10-06T12:00:00-04:00',
    periodHours: 24,
    models,
    banditProgress: {
      totalPulls: 0,
      explorationRatio: 0,
      armDistribution: [],
      topFeatures: [],
      interceptFeatures: [],
    },
    rewardTrend: { current: 0, previous: 0, direction: 'stable', changePercent: 0 },
    feedbackLoop: {
      totalDecisions: 0,
      totalOutcomes: 0,
      correlationRate: 0,
      avgReward: 0,
      outcomeDistribution: { success: 0, partial: 0, failure: 0 },
    },
    summary: {
      totalRoutings: 0,
      overallSuccessRate: 0,
      avgReward: 0,
      learningStatus: 'unmeasured',
      ...summary,
    },
  };
}

function lineWith(output: string, needle: string): string {
  const line = plain(output)
    .split('\n')
    .find((l) => l.includes(needle));
  expect(line, `no line containing ${needle}`).toBeDefined();
  return line ?? '';
}

describe('summary over zero routings (#7180)', () => {
  it('renders success rate and avg reward as unmeasured, not 0.0% / 0.000', () => {
    const out = formatAsciiOutput(result({ totalRoutings: 0 }, []), OPTIONS);
    expect(lineWith(out, 'Success Rate:')).toContain('unmeasured (0 routings)');
    expect(lineWith(out, 'Avg Reward:')).toContain('unmeasured (0 routings)');
    expect(plain(out)).not.toContain('0.0%');
    expect(plain(out)).not.toContain('0.000');
  });

  it('renders the correlation rate over zero decisions as unmeasured', () => {
    const out = formatAsciiOutput(result({ totalRoutings: 0 }, []), OPTIONS);
    expect(lineWith(out, 'Correlation Rate:')).toContain('unmeasured (0 decisions)');
  });

  it('still renders measured values when routings exist', () => {
    const out = formatAsciiOutput(
      result({ totalRoutings: 100, overallSuccessRate: 0.85, avgReward: 0.76 }, []),
      OPTIONS
    );
    expect(lineWith(out, 'Success Rate:')).toContain('85.0%');
    expect(lineWith(out, 'Avg Reward:')).toContain('0.760');
    expect(plain(out)).not.toContain('unmeasured (0 routings)');
  });
});

describe('per-model line is self-consistent (#7180)', () => {
  it('labels a bandit reward and leaves routing success unmeasured with no routings', () => {
    const out = formatAsciiOutput(result({}, [model({})]), OPTIONS);
    const line = lineWith(out, 'reward:');
    expect(line).toContain('reward: 0.70 (bandit, 12 pulls)');
    expect(line).toContain('success: unmeasured (0 routings)');
    expect(line).not.toMatch(/success:\s+0%/);
    // The selection share is routing-sourced too.
    expect(lineWith(out, 'claude')).toContain('unmeasured (0 routings)');
  });

  it('renders a bandit arm with no pulls as unmeasured reward', () => {
    const out = formatAsciiOutput(
      result({}, [model({ pullCount: 0, avgReward: 0, cumulativeReward: 0 })]),
      OPTIONS
    );
    expect(lineWith(out, 'reward:')).toContain('reward: unmeasured (0 bandit pulls)');
  });

  it('renders both sides when both are measured, each with its source', () => {
    const out = formatAsciiOutput(
      result({ totalRoutings: 50 }, [
        model({ successRate: 0.9, selectionPercent: 60, routingSelectionCount: 50 }),
      ]),
      OPTIONS
    );
    const line = lineWith(out, 'reward:');
    expect(line).toContain('reward: 0.70 (bandit, 12 pulls)');
    expect(line).toContain('success: 90% (routing, 50 routings)');
    expect(lineWith(out, 'claude')).toContain('60.0%');
  });

  it('labels a routing-only model reward as routing-sourced', () => {
    const out = formatAsciiOutput(
      result({ totalRoutings: 20 }, [
        model({
          name: 'gemini',
          rewardSource: 'routing',
          pullCount: 20,
          avgReward: 0.5,
          successRate: 0.75,
          selectionPercent: 100,
          routingSelectionCount: 20,
        }),
      ]),
      OPTIONS
    );
    const line = lineWith(out, 'reward:');
    expect(line).toContain('reward: 0.50 (routing, 20 routings)');
    expect(line).toContain('success: 75% (routing, 20 routings)');
  });
});

describe('gatherLearningMetrics records each per-model source (#7180)', () => {
  const bandit = {
    getDetailedStats: () => [
      {
        name: 'claude',
        pullCount: 12,
        avgReward: 0.7,
        cumulativeReward: 8.4,
        learnedWeights: [],
        featureImportance: [],
      },
    ],
    getExplorationStats: () => ({ totalPulls: 12, explorationRatio: 0.2, armDistribution: [] }),
  } as unknown as LinUCBBandit;

  it('marks a bandit arm with no routing metric as having zero routing samples', () => {
    const r = gatherLearningMetrics(bandit, undefined, undefined, OPTIONS);
    expect(r.models[0]).toMatchObject({
      name: 'claude',
      rewardSource: 'bandit',
      routingSelectionCount: 0,
    });
  });

  it('carries the routing sample count when the collector has the model', () => {
    const collector = {
      getMetrics: () => ({
        totalDecisions: 30,
        totalOutcomes: 30,
        avgReward: 0.6,
        avgRewardTrend: 0,
        modelMetrics: [
          {
            model: 'claude',
            selectionCount: 25,
            selectionPercent: 83,
            avgReward: 0.6,
            successRate: 0.8,
            avgQuality: 0.7,
            avgLatencyMs: 900,
          },
          {
            model: 'gemini',
            selectionCount: 5,
            selectionPercent: 17,
            avgReward: 0.4,
            successRate: 0.6,
            avgQuality: 0.5,
            avgLatencyMs: 700,
          },
        ],
      }),
    } as unknown as RoutingMetricsCollector;
    const r = gatherLearningMetrics(bandit, collector, undefined, OPTIONS);
    expect(r.models.find((m) => m.name === 'claude')).toMatchObject({
      rewardSource: 'bandit',
      routingSelectionCount: 25,
    });
    expect(r.models.find((m) => m.name === 'gemini')).toMatchObject({
      rewardSource: 'routing',
      routingSelectionCount: 5,
    });
  });
});

describe('trend and JSON name missing measurements (#7242)', () => {
  const options = { ...OPTIONS, showTrends: true };

  it.each([undefined, new RoutingMetricsCollector()])(
    'renders an absent or empty collector trend as unmeasured',
    (collector) => {
      const r = gatherLearningMetrics(undefined, collector, undefined, options);
      const out = plain(formatAsciiOutput(r, options));
      expect(out).toContain('Reward Trend:');
      expect(out).toContain('unmeasured (0 routing outcomes)');
      expect(out).not.toContain('stable');
      expect(out).not.toContain('+0.0%');
      expect(out).not.toContain('Current: 0.000');
    }
  );

  it.each([undefined, new RoutingMetricsCollector()])(
    'serializes absent overall and trend measurements explicitly',
    (collector) => {
      const r = gatherLearningMetrics(undefined, collector, undefined, options);
      const json: unknown = JSON.parse(formatJsonOutput(r));
      expect(json).toMatchObject({
        summary: { totalRoutings: 0, overallSuccessRate: null, avgReward: null },
        rewardTrend: {
          current: null,
          previous: null,
          changePercent: null,
          direction: 'unmeasured',
          sampleCount: 0,
          measurementStatus: 'unmeasured',
        },
        models: [],
      });
    }
  );

  it('does not treat routing decisions without outcomes as reward samples', () => {
    const collector = {
      getMetrics: () => ({
        totalDecisions: 10,
        totalOutcomes: 0,
        avgReward: 0,
        avgRewardTrend: 0,
        modelMetrics: [],
      }),
    } as unknown as RoutingMetricsCollector;
    const r = gatherLearningMetrics(undefined, collector, undefined, options);
    const json: unknown = JSON.parse(formatJsonOutput(r));
    expect(json).toMatchObject({
      rewardTrend: { current: null, direction: 'unmeasured', sampleCount: 0 },
    });
    expect(plain(formatAsciiOutput(r, options))).toContain('unmeasured (0 routing outcomes)');
  });

  it.each([0, 12])('does not use %i bandit pulls as routing evidence', (pullCount) => {
    const bandit = {
      getDetailedStats: () => [{ ...model({ pullCount }), featureImportance: [] }],
      getExplorationStats: () => ({
        totalPulls: pullCount,
        explorationRatio: 0.2,
        armDistribution: [],
      }),
    } as unknown as LinUCBBandit;
    const r = gatherLearningMetrics(bandit, undefined, undefined, options);
    const json: unknown = JSON.parse(formatJsonOutput(r));
    expect(json).toMatchObject({
      summary: { totalRoutings: 0, overallSuccessRate: null },
      rewardTrend: { direction: 'unmeasured', sampleCount: 0 },
      models: [
        {
          routingSelectionCount: 0,
          successRate: null,
          selectionPercent: null,
          avgQuality: null,
          avgLatencyMs: null,
          avgReward: pullCount === 0 ? null : 0.7,
          cumulativeReward: pullCount === 0 ? null : 8.4,
        },
      ],
    });
    expect(plain(formatAsciiOutput(r, options))).not.toContain('stable');
  });

  it.each([0, 0.8])('preserves a measured reward of %f in text and JSON', (reward) => {
    const collector = {
      getMetrics: () => ({
        totalDecisions: 10,
        totalOutcomes: 10,
        avgReward: reward,
        avgRewardTrend: 0,
        modelMetrics: [
          {
            model: 'claude',
            selectionCount: 10,
            selectionPercent: 100,
            avgReward: reward,
            successRate: reward,
            avgQuality: reward,
            avgLatencyMs: 500,
          },
        ],
      }),
    } as unknown as RoutingMetricsCollector;
    const r = gatherLearningMetrics(undefined, collector, undefined, options);
    const json: unknown = JSON.parse(formatJsonOutput(r));
    expect(json).toMatchObject({
      summary: { totalRoutings: 10, overallSuccessRate: reward, avgReward: reward },
      rewardTrend: {
        current: reward,
        previous: reward,
        changePercent: 0,
        direction: 'stable',
        sampleCount: 10,
        measurementStatus: 'measured',
      },
      models: [{ successRate: reward, routingSelectionCount: 10, avgReward: reward }],
    });
    const out = plain(formatAsciiOutput(r, options));
    expect(out).toContain('stable (+0.0%)');
    expect(out).toContain(`Current: ${reward.toFixed(3)}`);
    expect(out).not.toContain('unmeasured (0 routings)');
  });
});
