/**
 * nexus-agents/testing - Routing Schemas
 *
 * Zod schemas for routing-related test results.
 */

import { z } from 'zod';

/**
 * Schema for routing result.
 */
export const RoutingResultSchema = z.object({
  selectedCli: z.enum(['claude', 'gemini', 'codex']).describe('CLI that was selected'),
  optimalCli: z.enum(['claude', 'gemini', 'codex']).describe('Optimal CLI for this task'),
  isOptimal: z.boolean().describe('Whether routing was optimal'),
  isAcceptable: z.boolean().describe('Whether routing was acceptable'),
  confidence: z.number().min(0).max(1).describe('Routing confidence score (0.0 - 1.0)'),
  reasoning: z.string().optional().describe('Routing reasoning'),
});

export type RoutingResult = z.infer<typeof RoutingResultSchema>;

/**
 * Schema for category routing metrics.
 */
export const CategoryRoutingMetricsSchema = z.object({
  taskCount: z.number().nonnegative().describe('Number of tasks in category'),
  optimalRate: z.number().min(0).max(1).describe('Optimal routing rate'),
  acceptableRate: z.number().min(0).max(1).describe('Acceptable routing rate'),
  averageConfidence: z.number().min(0).max(1).describe('Average routing confidence'),
});

export type CategoryRoutingMetrics = z.infer<typeof CategoryRoutingMetricsSchema>;

/**
 * Schema for CLI routing metrics.
 */
export const CliRoutingMetricsSchema = z.object({
  selectedCount: z.number().nonnegative().describe('Times this CLI was selected'),
  optimalCount: z.number().nonnegative().describe('Times this CLI was optimal choice'),
  selectionRate: z.number().min(0).max(1).describe('Selection rate'),
  accuracyWhenSelected: z.number().min(0).max(1).describe('Accuracy when selected'),
});

export type CliRoutingMetrics = z.infer<typeof CliRoutingMetricsSchema>;

/**
 * Schema for CLI-specific latency metrics.
 */
export const CliLatencyMetricsSchema = z.object({
  requestCount: z.number().nonnegative().describe('Number of requests'),
  p50: z.number().nonnegative().describe('50th percentile in milliseconds'),
  p95: z.number().nonnegative().describe('95th percentile in milliseconds'),
  mean: z.number().nonnegative().describe('Mean latency in milliseconds'),
});

export type CliLatencyMetrics = z.infer<typeof CliLatencyMetricsSchema>;
