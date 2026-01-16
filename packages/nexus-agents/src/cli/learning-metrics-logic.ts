/**
 * nexus-agents/cli - Learning Metrics Dashboard Logic
 *
 * Aggregates learning metrics from LinUCB bandit, routing metrics collector,
 * and feedback integration into a unified dashboard view.
 *
 * (Source: Issue #284 - Learning metrics dashboard)
 */

import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { RoutingMetricsCollector } from '../observability/routing-metrics.js';
import type { FeedbackIntegration } from '../learning/feedback-integration.js';
import type {
  LearningMetricsOptions,
  LearningMetricsResult,
  ModelLearningStats,
  BanditProgress,
  RewardTrend,
  FeedbackLoopStats,
  FeatureImportance,
} from './learning-metrics-types.js';

/** Feature names used by LinUCB bandit */
const FEATURE_NAMES = [
  'taskComplexity',
  'contextLength',
  'isCodeTask',
  'isReasoningTask',
  'budgetUtilization',
  'timePressure',
];

/**
 * Gathers and aggregates learning metrics from all data sources.
 */
export function gatherLearningMetrics(
  bandit: LinUCBBandit | undefined,
  metricsCollector: RoutingMetricsCollector | undefined,
  feedbackIntegration: FeedbackIntegration | undefined,
  options: LearningMetricsOptions
): LearningMetricsResult {
  const timestamp = new Date().toISOString();
  const periodHours = options.period;

  // Gather bandit statistics
  const banditStats = bandit?.getDetailedStats() ?? [];
  const explorationStats = bandit?.getExplorationStats() ?? {
    totalPulls: 0,
    explorationRatio: 0,
    armDistribution: [],
  };

  // Gather routing metrics
  const routingMetrics = metricsCollector?.getMetrics(periodHours);

  // Gather feedback stats
  const feedbackStats = feedbackIntegration?.getStats();

  // Aggregate per-model statistics
  const models = aggregateModelStats(banditStats, routingMetrics);

  // Compute bandit progress
  const banditProgress = computeBanditProgress(banditStats, explorationStats);

  // Compute reward trend
  const rewardTrend = computeRewardTrend(routingMetrics);

  // Compute feedback loop stats
  const feedbackLoop = computeFeedbackLoopStats(feedbackStats, routingMetrics);

  // Compute summary
  const summary = computeSummary(models, banditProgress, feedbackLoop);

  return {
    timestamp,
    periodHours,
    models,
    banditProgress,
    rewardTrend,
    feedbackLoop,
    summary,
  };
}

/** Bandit arm stats input type. */
type BanditArmStats = {
  name: string;
  pullCount: number;
  avgReward: number;
  cumulativeReward: number;
};

/** Routing model metrics input type. */
type RoutingModelMetric = {
  model: string;
  selectionCount: number;
  selectionPercent: number;
  avgReward: number;
  successRate: number;
  avgQuality: number;
  avgLatencyMs: number;
};

/** Convert bandit stat to model learning stats. */
function banditToModelStats(
  stat: BanditArmStats,
  routingModel: RoutingModelMetric | undefined
): ModelLearningStats {
  return {
    name: stat.name,
    pullCount: stat.pullCount,
    avgReward: stat.avgReward,
    cumulativeReward: stat.cumulativeReward,
    successRate: routingModel?.successRate ?? 0,
    avgLatencyMs: routingModel?.avgLatencyMs ?? 0,
    avgQuality: routingModel?.avgQuality ?? 0,
    selectionPercent: routingModel?.selectionPercent ?? 0,
  };
}

/** Convert routing metric to model learning stats. */
function routingToModelStats(metric: RoutingModelMetric): ModelLearningStats {
  return {
    name: metric.model,
    pullCount: metric.selectionCount,
    avgReward: metric.avgReward,
    cumulativeReward: metric.avgReward * metric.selectionCount,
    successRate: metric.successRate,
    avgLatencyMs: metric.avgLatencyMs,
    avgQuality: metric.avgQuality,
    selectionPercent: metric.selectionPercent,
  };
}

/** Aggregates model statistics from bandit and routing metrics. */
function aggregateModelStats(
  banditStats: ReadonlyArray<BanditArmStats>,
  routingMetrics?: { modelMetrics: ReadonlyArray<RoutingModelMetric> }
): ModelLearningStats[] {
  const modelMap = new Map<string, ModelLearningStats>();

  for (const stat of banditStats) {
    const routing = routingMetrics?.modelMetrics.find((m) => m.model === stat.name);
    modelMap.set(stat.name, banditToModelStats(stat, routing));
  }

  for (const metric of routingMetrics?.modelMetrics ?? []) {
    if (!modelMap.has(metric.model)) {
      modelMap.set(metric.model, routingToModelStats(metric));
    }
  }

  return [...modelMap.values()].sort((a, b) => b.cumulativeReward - a.cumulativeReward);
}

/** Bandit stat entry for feature importance aggregation. */
interface BanditStatEntry {
  readonly featureImportance: readonly { feature: string; importance: number }[];
}

/** Aggregates feature importance across all models. */
function aggregateFeatureImportance(
  banditStats: ReadonlyArray<BanditStatEntry>
): FeatureImportance[] {
  const featureMap = new Map<string, { sum: number; count: number }>();

  for (const stat of banditStats) {
    for (const fi of stat.featureImportance) {
      const existing = featureMap.get(fi.feature) ?? { sum: 0, count: 0 };
      featureMap.set(fi.feature, { sum: existing.sum + fi.importance, count: existing.count + 1 });
    }
  }

  const topFeatures = Array.from(featureMap.entries())
    .map(
      ([feature, { sum, count }]): FeatureImportance => ({
        feature,
        importance: sum / count,
        direction: sum >= 0 ? 'positive' : 'negative',
      })
    )
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 5);

  // Fill with defaults if no data
  if (topFeatures.length === 0) {
    return FEATURE_NAMES.slice(0, 5).map((feature) => ({
      feature,
      importance: 0,
      direction: 'positive',
    }));
  }
  return topFeatures;
}

/**
 * Computes bandit learning progress metrics.
 */
function computeBanditProgress(
  banditStats: ReadonlyArray<BanditStatEntry>,
  explorationStats: {
    totalPulls: number;
    explorationRatio: number;
    armDistribution: ReadonlyArray<{ name: string; proportion: number }>;
  }
): BanditProgress {
  const topFeatures = aggregateFeatureImportance(banditStats);
  const armDistributionWithPercent = explorationStats.armDistribution.map((arm) => ({
    name: arm.name,
    percent: arm.proportion * 100,
  }));

  return {
    totalPulls: explorationStats.totalPulls,
    explorationRatio: explorationStats.explorationRatio,
    armDistribution: armDistributionWithPercent,
    topFeatures,
  };
}

/**
 * Computes reward trend analysis.
 */
function computeRewardTrend(routingMetrics?: {
  avgReward: number;
  avgRewardTrend: number;
}): RewardTrend {
  const current = routingMetrics?.avgReward ?? 0;
  // avgRewardTrend is the change from previous period (can be positive or negative)
  const trendChange = routingMetrics?.avgRewardTrend ?? 0;
  const previous = current - trendChange;

  let direction: 'improving' | 'declining' | 'stable';

  if (trendChange > 0.05) {
    direction = 'improving';
  } else if (trendChange < -0.05) {
    direction = 'declining';
  } else {
    direction = 'stable';
  }

  // Calculate percentage change
  const changePercent = previous !== 0 ? (trendChange / Math.abs(previous)) * 100 : 0;

  return { current, previous, direction, changePercent };
}

/** Extract outcome distribution from feedback stats. */
function extractOutcomeDistribution(
  outcomesByClass: Record<string, number> | undefined
): FeedbackLoopStats['outcomeDistribution'] {
  const classes = outcomesByClass ?? {};
  return {
    success: classes['success'] ?? 0,
    partial: classes['partial'] ?? 0,
    failure: classes['failure'] ?? 0,
  };
}

/** Feedback stats input for computing loop stats. */
interface FeedbackStatsInput {
  totalDecisions: number;
  totalOutcomes: number;
  outcomesByClass?: Record<string, number>;
  avgReward: number;
}

/** Get a numeric value from primary or fallback source. */
function getNumericValue(
  primary: FeedbackStatsInput | undefined,
  fallback: FeedbackStatsInput | undefined,
  key: keyof Omit<FeedbackStatsInput, 'outcomesByClass'>
): number {
  return primary?.[key] ?? fallback?.[key] ?? 0;
}

/**
 * Computes feedback loop statistics.
 */
function computeFeedbackLoopStats(
  feedbackStats?: FeedbackStatsInput,
  routingMetrics?: FeedbackStatsInput
): FeedbackLoopStats {
  const totalDecisions = getNumericValue(feedbackStats, routingMetrics, 'totalDecisions');
  const totalOutcomes = getNumericValue(feedbackStats, routingMetrics, 'totalOutcomes');
  const avgReward = getNumericValue(feedbackStats, routingMetrics, 'avgReward');
  const correlationRate = totalDecisions > 0 ? totalOutcomes / totalDecisions : 0;
  const outcomeDistribution = extractOutcomeDistribution(feedbackStats?.outcomesByClass);

  return { totalDecisions, totalOutcomes, correlationRate, avgReward, outcomeDistribution };
}

/**
 * Computes summary metrics.
 */
function computeSummary(
  models: ModelLearningStats[],
  banditProgress: BanditProgress,
  feedbackLoop: FeedbackLoopStats
): LearningMetricsResult['summary'] {
  const totalRoutings = feedbackLoop.totalDecisions;
  const overallSuccessRate =
    models.length > 0
      ? models.reduce((sum, m) => sum + m.successRate * m.selectionPercent, 0) / 100
      : 0;
  const avgReward = feedbackLoop.avgReward;

  // Determine learning status based on exploration ratio
  let learningStatus: 'exploring' | 'exploiting' | 'balanced';
  if (banditProgress.explorationRatio > 0.6) {
    learningStatus = 'exploring';
  } else if (banditProgress.explorationRatio < 0.3) {
    learningStatus = 'exploiting';
  } else {
    learningStatus = 'balanced';
  }

  return {
    totalRoutings,
    overallSuccessRate,
    avgReward,
    learningStatus,
  };
}
