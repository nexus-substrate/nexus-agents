/**
 * Routing Metrics Collector
 *
 * Collects and visualizes routing effectiveness metrics for the CLI adapter system.
 * Enables observability into LinUCB learning, model selection patterns, and task outcomes.
 *
 * @module observability/routing-metrics
 * (Source: Alignment Roadmap Phase 1, Issue #171)
 */

import { createLogger } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import {
  centerText,
  renderModelDistribution,
  renderLearningProgress,
  renderPerformanceSection,
} from './routing-metrics-helpers.js';

const logger = createLogger({ component: 'routing-metrics' });

// =============================================================================
// Types
// =============================================================================

/** Individual routing decision record. */
export interface RoutingRecord {
  readonly timestamp: string;
  readonly traceId: string;
  readonly selectedModel: CliName;
  readonly alternativeModels: readonly CliName[];
  readonly isExploration: boolean;
  readonly taskType?: string;
  readonly contextTokens?: number;
}

/** Outcome record for a routing decision. */
export interface OutcomeRecord {
  readonly timestamp: string;
  readonly traceId: string;
  readonly model: CliName;
  readonly success: boolean;
  readonly reward: number;
  readonly qualityScore?: number;
  readonly latencyMs?: number;
}

/** Aggregated metrics for a single model. */
export interface ModelMetrics {
  readonly model: CliName;
  readonly selectionCount: number;
  readonly selectionPercent: number;
  readonly avgReward: number;
  readonly avgQuality: number;
  readonly avgLatencyMs: number;
  readonly successRate: number;
  readonly explorationCount: number;
}

/** Overall routing metrics. */
export interface RoutingMetrics {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalDecisions: number;
  readonly totalOutcomes: number;
  readonly modelMetrics: readonly ModelMetrics[];
  readonly explorationRate: number;
  readonly avgReward: number;
  readonly avgRewardTrend: number;
  readonly avgRoutingLatencyMs: number;
}

/** Dashboard rendering configuration. */
export interface DashboardConfig {
  readonly width: number;
  readonly showTrends: boolean;
  readonly periodHours: number;
}

const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  width: 65,
  showTrends: true,
  periodHours: 24,
};

// =============================================================================
// RoutingMetricsCollector
// =============================================================================

/** Configuration for the metrics collector. */
export interface RoutingMetricsConfig {
  readonly maxRecords: number;
  readonly retentionHours: number;
}

const DEFAULT_CONFIG: RoutingMetricsConfig = {
  maxRecords: 10000,
  retentionHours: 168, // 1 week
};

/**
 * Collects routing decisions and outcomes to compute effectiveness metrics.
 */
export class RoutingMetricsCollector {
  private readonly config: RoutingMetricsConfig;
  private readonly decisions: RoutingRecord[] = [];
  private readonly outcomes: OutcomeRecord[] = [];

  constructor(config?: Partial<RoutingMetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('RoutingMetricsCollector initialized', {
      maxRecords: this.config.maxRecords,
      retentionHours: this.config.retentionHours,
    });
  }

  /**
   * Record a routing decision.
   */
  recordDecision(record: RoutingRecord): void {
    this.enforceRetention();
    this.decisions.push(record);
    logger.debug('Recorded routing decision', {
      traceId: record.traceId,
      model: record.selectedModel,
      isExploration: record.isExploration,
    });
  }

  /**
   * Record an outcome for a routing decision.
   */
  recordOutcome(record: OutcomeRecord): void {
    this.enforceRetention();
    this.outcomes.push(record);
    logger.debug('Recorded routing outcome', {
      traceId: record.traceId,
      model: record.model,
      success: record.success,
      reward: record.reward,
    });
  }

  /**
   * Get routing metrics for a time period.
   */
  getMetrics(periodHours = 24): RoutingMetrics {
    const now = Date.now();
    const cutoff = now - periodHours * 60 * 60 * 1000;
    const cutoffStr = new Date(cutoff).toISOString();

    const recentDecisions = this.decisions.filter((d) => d.timestamp >= cutoffStr);
    const recentOutcomes = this.outcomes.filter((o) => o.timestamp >= cutoffStr);

    // Aggregate by model
    const modelStats = this.aggregateByModel(recentDecisions, recentOutcomes);

    // Calculate overall metrics
    const totalDecisions = recentDecisions.length;
    const explorationCount = recentDecisions.filter((d) => d.isExploration).length;
    const explorationRate = totalDecisions > 0 ? explorationCount / totalDecisions : 0;

    const avgReward =
      recentOutcomes.length > 0
        ? recentOutcomes.reduce((sum, o) => sum + o.reward, 0) / recentOutcomes.length
        : 0;

    // Calculate trend (compare last period vs previous period)
    const avgRewardTrend = this.calculateRewardTrend(periodHours);

    return {
      periodStart: cutoffStr,
      periodEnd: new Date(now).toISOString(),
      totalDecisions,
      totalOutcomes: recentOutcomes.length,
      modelMetrics: modelStats,
      explorationRate,
      avgReward,
      avgRewardTrend,
      avgRoutingLatencyMs: 8, // Placeholder - would need timing instrumentation
    };
  }

  /**
   * Generate ASCII dashboard output.
   */
  renderDashboard(config?: Partial<DashboardConfig>): string {
    const cfg = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
    const metrics = this.getMetrics(cfg.periodHours);
    const w = cfg.width;

    const lines: string[] = [
      '╭' + '─'.repeat(w - 2) + '╮',
      centerText(`Routing Effectiveness Dashboard (last ${String(cfg.periodHours)}h)`, w),
      '├' + '─'.repeat(w - 2) + '┤',
      ...renderModelDistribution(metrics, w),
      '├' + '─'.repeat(w - 2) + '┤',
      ...renderLearningProgress(metrics, w, cfg.showTrends),
      '├' + '─'.repeat(w - 2) + '┤',
      ...renderPerformanceSection(metrics, w),
      '╰' + '─'.repeat(w - 2) + '╯',
    ];

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON for machine-readable output.
   */
  toJSON(periodHours = 24): string {
    return JSON.stringify(this.getMetrics(periodHours), null, 2);
  }

  /**
   * Clear all collected data.
   */
  reset(): void {
    this.decisions.length = 0;
    this.outcomes.length = 0;
    logger.info('RoutingMetricsCollector reset');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private enforceRetention(): void {
    const cutoff = new Date(Date.now() - this.config.retentionHours * 60 * 60 * 1000).toISOString();

    // Remove old decisions
    while (this.decisions.length > 0) {
      const first = this.decisions[0];
      if (first === undefined || first.timestamp >= cutoff) break;
      this.decisions.shift();
    }

    // Remove old outcomes
    while (this.outcomes.length > 0) {
      const first = this.outcomes[0];
      if (first === undefined || first.timestamp >= cutoff) break;
      this.outcomes.shift();
    }

    // Enforce max records
    while (this.decisions.length > this.config.maxRecords) {
      this.decisions.shift();
    }
    while (this.outcomes.length > this.config.maxRecords) {
      this.outcomes.shift();
    }
  }

  private aggregateByModel(decisions: RoutingRecord[], outcomes: OutcomeRecord[]): ModelMetrics[] {
    const models = new Set<CliName>();
    for (const d of decisions) models.add(d.selectedModel);
    for (const o of outcomes) models.add(o.model);

    const totalDecisions = decisions.length;
    const result: ModelMetrics[] = [];

    for (const model of models) {
      const modelDecisions = decisions.filter((d) => d.selectedModel === model);
      const modelOutcomes = outcomes.filter((o) => o.model === model);

      const selectionCount = modelDecisions.length;
      const selectionPercent = totalDecisions > 0 ? selectionCount / totalDecisions : 0;
      const explorationCount = modelDecisions.filter((d) => d.isExploration).length;

      const successCount = modelOutcomes.filter((o) => o.success).length;
      const successRate = modelOutcomes.length > 0 ? successCount / modelOutcomes.length : 0;

      const avgReward =
        modelOutcomes.length > 0
          ? modelOutcomes.reduce((sum, o) => sum + o.reward, 0) / modelOutcomes.length
          : 0;

      const qualityOutcomes = modelOutcomes.filter((o) => o.qualityScore !== undefined);
      const avgQuality =
        qualityOutcomes.length > 0
          ? qualityOutcomes.reduce((sum, o) => sum + (o.qualityScore ?? 0), 0) /
            qualityOutcomes.length
          : 0;

      const latencyOutcomes = modelOutcomes.filter((o) => o.latencyMs !== undefined);
      const avgLatencyMs =
        latencyOutcomes.length > 0
          ? latencyOutcomes.reduce((sum, o) => sum + (o.latencyMs ?? 0), 0) / latencyOutcomes.length
          : 0;

      result.push({
        model,
        selectionCount,
        selectionPercent,
        avgReward,
        avgQuality,
        avgLatencyMs,
        successRate,
        explorationCount,
      });
    }

    // Sort by selection count descending
    return result.sort((a, b) => b.selectionCount - a.selectionCount);
  }

  private calculateRewardTrend(periodHours: number): number {
    const now = Date.now();
    const currentCutoff = now - periodHours * 60 * 60 * 1000;
    const previousCutoff = currentCutoff - periodHours * 60 * 60 * 1000;

    const currentCutoffStr = new Date(currentCutoff).toISOString();
    const previousCutoffStr = new Date(previousCutoff).toISOString();

    const currentOutcomes = this.outcomes.filter((o) => o.timestamp >= currentCutoffStr);
    const previousOutcomes = this.outcomes.filter(
      (o) => o.timestamp >= previousCutoffStr && o.timestamp < currentCutoffStr
    );

    const currentAvg =
      currentOutcomes.length > 0
        ? currentOutcomes.reduce((sum, o) => sum + o.reward, 0) / currentOutcomes.length
        : 0;

    const previousAvg =
      previousOutcomes.length > 0
        ? previousOutcomes.reduce((sum, o) => sum + o.reward, 0) / previousOutcomes.length
        : 0;

    return currentAvg - previousAvg;
  }
}

/**
 * Create a RoutingMetricsCollector instance.
 */
export function createRoutingMetricsCollector(
  config?: Partial<RoutingMetricsConfig>
): RoutingMetricsCollector {
  return new RoutingMetricsCollector(config);
}

// Re-export helpers for backward compatibility
export {
  centerText,
  padText,
  renderModelDistribution,
  renderLearningProgress,
  renderPerformanceSection,
} from './routing-metrics-helpers.js';
