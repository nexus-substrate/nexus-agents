/**
 * Tool usage metrics recorder (Issue #1022)
 *
 * Lightweight, bounded, in-memory store for MCP tool invocation metrics.
 * Records tool name, duration, and success/failure for every tool call.
 * Used by the weather report to surface per-tool analytics.
 *
 * @module mcp/middleware/tool-metrics
 */

import { getTimeProvider } from '../../core/index.js';
import type { Middleware, ToolResult } from './middleware-chain.js';

// ============================================================================
// Types
// ============================================================================

/** A single recorded tool invocation metric. */
export interface ToolMetric {
  readonly toolName: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly timestamp: string;
}

/** Aggregated stats for a single tool. */
export interface ToolStats {
  readonly toolName: string;
  readonly totalCalls: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly errorCount: number;
}

// ============================================================================
// Store
// ============================================================================

const MAX_ENTRIES = 5_000;
const metrics: ToolMetric[] = [];

/** Record a tool invocation metric. */
export function recordToolMetric(metric: ToolMetric): void {
  metrics.push(metric);
  if (metrics.length > MAX_ENTRIES) {
    metrics.splice(0, metrics.length - MAX_ENTRIES);
  }
}

/** Get all recorded tool metrics (read-only snapshot). */
export function getToolMetrics(): readonly ToolMetric[] {
  return [...metrics];
}

/** Aggregate metrics into per-tool stats. */
export function getToolStats(): readonly ToolStats[] {
  const groups = new Map<string, ToolMetric[]>();

  for (const m of metrics) {
    const list = groups.get(m.toolName);
    if (list !== undefined) {
      list.push(m);
    } else {
      groups.set(m.toolName, [m]);
    }
  }

  const stats: ToolStats[] = [];
  for (const [toolName, list] of groups) {
    const sc = list.filter((m) => m.success).length;
    const td = list.reduce((s, m) => s + m.durationMs, 0);
    stats.push({
      toolName,
      totalCalls: list.length,
      successRate: sc / list.length,
      avgDurationMs: td / list.length,
      errorCount: list.length - sc,
    });
  }

  return stats.sort((a, b) => b.totalCalls - a.totalCalls);
}

/** Clear all recorded metrics (for testing). */
export function clearToolMetrics(): void {
  metrics.length = 0;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Creates a middleware that records tool invocation metrics.
 * Should be placed as the outermost middleware (before audit)
 * to capture the full request lifecycle including middleware overhead.
 */
export function createMetricsMiddleware(): Middleware {
  return async (args, ctx, next): Promise<ToolResult> => {
    const startTime = getTimeProvider().now();

    try {
      const result = await next(args, ctx);
      const durationMs = getTimeProvider().now() - startTime;

      recordToolMetric({
        toolName: ctx.requestContext.toolName,
        durationMs,
        success: result.isError !== true,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;

      recordToolMetric({
        toolName: ctx.requestContext.toolName,
        durationMs,
        success: false,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  };
}
