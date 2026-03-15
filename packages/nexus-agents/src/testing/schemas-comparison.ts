/**
 * nexus-agents/testing - Comparison Schemas
 *
 * Zod schemas for baseline comparison and regression tracking.
 */

import { z } from 'zod';

/**
 * Schema for regression item.
 */
export const RegressionItemSchema = z.object({
  metric: z.string().describe('Metric name'),
  baseline: z.number().describe('Baseline value'),
  current: z.number().describe('Current value'),
  percentChange: z.number().describe('Percentage change'),
  severity: z.enum(['minor', 'moderate', 'severe']).describe('Severity level'),
});

export type RegressionItem = z.infer<typeof RegressionItemSchema>;

/**
 * Schema for improvement item.
 */
export const ImprovementItemSchema = z.object({
  metric: z.string().describe('Metric name'),
  baseline: z.number().describe('Baseline value'),
  current: z.number().describe('Current value'),
  percentChange: z.number().describe('Percentage change'),
});

export type ImprovementItem = z.infer<typeof ImprovementItemSchema>;

/**
 * Schema for metric deltas.
 */
export const MetricDeltasSchema = z.object({
  qualityScore: z.number().describe('Quality score delta'),
  passRate: z.number().describe('Pass rate delta'),
  routingOptimalRate: z.number().describe('Routing optimal rate delta'),
  latencyP95: z.number().describe('Latency p95 delta'),
  successRate: z.number().describe('Success rate delta'),
});

export type MetricDeltas = z.infer<typeof MetricDeltasSchema>;

/**
 * Schema for baseline comparison.
 */
export const BaselineComparisonSchema = z.object({
  baselineRunId: z.string().describe('Baseline run ID'),
  baselineTimestamp: z.iso.datetime().describe('Baseline run timestamp'),
  improved: z.boolean().describe('Whether current run is better overall'),
  regressions: z.array(RegressionItemSchema).describe('Regressions detected'),
  improvements: z.array(ImprovementItemSchema).describe('Improvements detected'),
  deltas: MetricDeltasSchema.describe('Metric deltas'),
});

export type BaselineComparison = z.infer<typeof BaselineComparisonSchema>;

/**
 * Schema for reliability metrics.
 */
export const ReliabilityMetricsSchema = z.object({
  successRate: z.number().min(0).max(1).describe('Overall success rate'),
  totalRetries: z.number().nonnegative().describe('Total retry count'),
  timeoutCount: z.number().nonnegative().describe('Timeout count'),
  errorCount: z.number().nonnegative().describe('Error count'),
  circuitBreakerTrips: z.number().nonnegative().describe('Circuit breaker trip count'),
});

export type ReliabilityMetrics = z.infer<typeof ReliabilityMetricsSchema>;

/**
 * Schema for token metrics.
 */
export const TokenMetricsSchema = z.object({
  totalInputTokens: z.number().nonnegative().describe('Total input tokens'),
  totalOutputTokens: z.number().nonnegative().describe('Total output tokens'),
  totalTokens: z.number().nonnegative().describe('Total tokens'),
  averagePerTask: z.number().nonnegative().describe('Average tokens per task'),
});

export type TokenMetrics = z.infer<typeof TokenMetricsSchema>;
