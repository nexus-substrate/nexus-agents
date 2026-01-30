/**
 * nexus-agents/core - Trace Exporter
 *
 * Export and visualize trace data for debugging and analysis.
 * Provides JSON file export and console pretty-printing.
 *
 * (Source: Issue #132)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTimeProvider } from './index.js';
import type { TraceSpan, AggregatedMetrics, Tracer } from './trace.js';
import {
  type ResolvedVisualizationOptions,
  COLORS,
  buildSpanTree,
  renderSpanNode,
  renderHeader,
  buildSummaryParts,
} from './trace-exporter-helpers.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Export format options.
 */
export type ExportFormat = 'json' | 'json-pretty';

/**
 * Exported trace data structure.
 */
export interface ExportedTrace {
  /** Trace ID */
  readonly traceId: string;
  /** Export timestamp (ISO format) */
  readonly exportedAt: string;
  /** All spans in the trace */
  readonly spans: readonly TraceSpan[];
  /** Aggregated metrics */
  readonly metrics: AggregatedMetrics;
}

/**
 * Options for trace visualization.
 */
export interface VisualizationOptions {
  /** Show cost information */
  readonly showCost?: boolean;
  /** Show token counts */
  readonly showTokens?: boolean;
  /** Indent size for tree structure */
  readonly indentSize?: number;
  /** Use colors in output */
  readonly colors?: boolean;
}

const DEFAULT_VIS_OPTIONS: ResolvedVisualizationOptions = {
  showCost: true,
  showTokens: true,
  indentSize: 2,
  colors: true,
};

// =============================================================================
// Trace Exporter
// =============================================================================

/**
 * Exports trace data to JSON file.
 *
 * @param tracer - Tracer instance to export from
 * @param filepath - Destination file path
 * @param format - Export format (default: 'json-pretty')
 */
export function exportTraceToFile(
  tracer: Tracer,
  filepath: string,
  format: ExportFormat = 'json-pretty'
): void {
  const traceId = tracer.getTraceId() ?? 'unknown';
  const spans = tracer.getAllSpans();
  const metrics = tracer.getAggregatedMetrics();

  const exportData: ExportedTrace = {
    traceId,
    exportedAt: new Date(getTimeProvider().now()).toISOString(),
    spans,
    metrics,
  };

  const content =
    format === 'json-pretty' ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);

  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, content, 'utf-8');
}

/**
 * Exports trace data to JSON string.
 *
 * @param tracer - Tracer instance to export from
 * @param format - Export format (default: 'json-pretty')
 * @returns JSON string of trace data
 */
export function exportTraceToString(tracer: Tracer, format: ExportFormat = 'json-pretty'): string {
  const traceId = tracer.getTraceId() ?? 'unknown';
  const spans = tracer.getAllSpans();
  const metrics = tracer.getAggregatedMetrics();

  const exportData: ExportedTrace = {
    traceId,
    exportedAt: new Date(getTimeProvider().now()).toISOString(),
    spans,
    metrics,
  };

  return format === 'json-pretty'
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);
}

// =============================================================================
// Visualization
// =============================================================================

/**
 * Generates a pretty-printed trace visualization.
 *
 * @param tracer - Tracer instance to visualize
 * @param options - Visualization options
 * @returns Array of lines for the visualization
 *
 * @example
 * ```typescript
 * const lines = visualizeTrace(tracer);
 * console.log(lines.join('\n'));
 * ```
 *
 * Output example:
 * ```
 * Trace: abc123-def456
 * +-- [OK] orchestrate-task (2.34s)
 * |   +-- [OK] analyze (890ms) [1,234 in / 456 out] $0.0052
 * |   +-- [OK] review (1.45s) [2,345 in / 789 out] $0.0123
 * +-- Total: 2.34s | Tokens: 3,579 in / 1,245 out | Cost: $0.0175
 * ```
 */
export function visualizeTrace(tracer: Tracer, options?: VisualizationOptions): string[] {
  const opts: ResolvedVisualizationOptions = { ...DEFAULT_VIS_OPTIONS, ...options };
  const spans = tracer.getAllSpans();
  const metrics = tracer.getAggregatedMetrics();
  const traceId = tracer.getTraceId() ?? 'unknown';

  const lines: string[] = [];
  lines.push(renderHeader(traceId, opts.colors));

  // Build and render tree
  const tree = buildSpanTree(spans);
  for (let i = 0; i < tree.length; i++) {
    const root = tree[i];
    if (root !== undefined) {
      const isLast = i === tree.length - 1;
      lines.push(...renderSpanNode(root, '', isLast, opts));
    }
  }

  // Summary line
  const summaryParts = buildSummaryParts(metrics, opts);
  lines.push('');
  const summary = summaryParts.join(' | ');
  if (opts.colors) {
    lines.push(`${COLORS.dim}${summary}${COLORS.reset}`);
  } else {
    lines.push(summary);
  }

  return lines;
}

/**
 * Prints trace visualization to console.
 *
 * @param tracer - Tracer instance to visualize
 * @param options - Visualization options
 */
export function printTrace(tracer: Tracer, options?: VisualizationOptions): void {
  const lines = visualizeTrace(tracer, options);
  for (const line of lines) {
    // eslint-disable-next-line no-console -- intentional console output for trace visualization
    console.log(line);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Generates a default filename for trace export.
 *
 * @param traceId - Trace ID to include in filename
 * @returns Filename with timestamp
 */
export function generateTraceFilename(traceId: string): string {
  const timestamp = new Date(getTimeProvider().now()).toISOString().replace(/[:.]/g, '-');
  const shortId = traceId.slice(0, 8);
  return `trace-${timestamp}-${shortId}.json`;
}
