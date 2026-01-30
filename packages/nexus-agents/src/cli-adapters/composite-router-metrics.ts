/**
 * CompositeRouter Metrics Helpers
 *
 * Helper functions for recording routing metrics.
 * Extracted from composite-router.ts to reduce file size.
 *
 * @module cli-adapters/composite-router-metrics
 * (Source: Issue #559 - Wire RoutingMetricsCollector to CompositeRouter)
 */

import type { ILogger } from '../core/index.js';
import { getTimeProvider, getRandomProvider } from '../core/index.js';
import type { CliName } from './types.js';
import type {
  CompositeRoutingDecision,
  IRoutingMetricsCollector,
} from './composite-router-types.js';

/**
 * Options for recording a routing outcome.
 */
export interface RecordOutcomeOptions {
  readonly traceId: string;
  readonly cliName: CliName;
  readonly success: boolean;
  readonly reward: number;
  readonly qualityScore?: number;
  readonly latencyMs?: number;
}

/**
 * Dependencies for metrics recording functions.
 */
export interface MetricsRecordingDeps {
  readonly metricsCollector: IRoutingMetricsCollector | undefined;
  readonly logger: ILogger;
}

/**
 * Records a routing decision to the metrics collector.
 *
 * @param decision - The routing decision to record
 * @param traceId - Unique trace ID for correlation
 * @param deps - Dependencies (metrics collector and logger)
 */
export function recordDecisionToMetrics(
  decision: CompositeRoutingDecision,
  traceId: string,
  deps: MetricsRecordingDeps
): void {
  if (deps.metricsCollector === undefined) return;

  deps.metricsCollector.recordDecision({
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    traceId,
    selectedModel: decision.cliName,
    alternativeModels: decision.alternatives,
    isExploration: decision.ucbScore !== undefined && decision.ucbScore > 0.5,
    taskType: decision.taskProfile.taskType,
    contextTokens: decision.taskProfile.contextRequired,
    routingLatencyMs: decision.decisionTimeMs,
  });

  deps.logger.debug('Recorded routing decision to metrics', {
    traceId,
    selectedModel: decision.cliName,
  });
}

/**
 * Records an outcome to the metrics collector.
 *
 * @param opts - Outcome options
 * @param deps - Dependencies (metrics collector and logger)
 */
export function recordOutcomeToMetrics(
  opts: RecordOutcomeOptions,
  deps: MetricsRecordingDeps
): void {
  if (deps.metricsCollector === undefined) return;

  // Build record inline with conditional spread for readonly interface
  deps.metricsCollector.recordOutcome({
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    traceId: opts.traceId,
    model: opts.cliName,
    success: opts.success,
    reward: opts.reward,
    ...(opts.qualityScore !== undefined && { qualityScore: opts.qualityScore }),
    ...(opts.latencyMs !== undefined && { latencyMs: opts.latencyMs }),
  });

  deps.logger.debug('Recorded outcome to metrics', {
    traceId: opts.traceId,
    model: opts.cliName,
    success: opts.success,
    reward: opts.reward,
  });
}

/**
 * Generates a unique trace ID for metrics correlation.
 *
 * @returns A unique trace ID string
 */
export function generateTraceId(): string {
  return `rt-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`;
}
