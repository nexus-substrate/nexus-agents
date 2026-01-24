/**
 * Routing Metrics Types
 *
 * Type definitions for routing metrics collection and visualization.
 * Extracted to break circular dependency between routing-metrics.ts
 * and routing-metrics-helpers.ts.
 *
 * @module observability/routing-metrics-types
 * (Source: Alignment Roadmap Phase 1, Issue #171)
 * (Source: Issue #392 - Circular dependency resolution)
 */

import type { CliName } from '../cli-adapters/types.js';

// =============================================================================
// Routing Record Types
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
  /** Time taken to make the routing decision (ms). */
  readonly routingLatencyMs?: number;
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

// =============================================================================
// Aggregated Metrics Types
// =============================================================================

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

// =============================================================================
// Dashboard Types
// =============================================================================

/** Dashboard rendering configuration. */
export interface DashboardConfig {
  readonly width: number;
  readonly showTrends: boolean;
  readonly periodHours: number;
}

/** Default dashboard configuration. */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  width: 80,
  showTrends: true,
  periodHours: 24,
};
