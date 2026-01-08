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
import type { TraceSpan, AggregatedMetrics, Tracer } from './trace.js';

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

const DEFAULT_VIS_OPTIONS: Required<VisualizationOptions> = {
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
    exportedAt: new Date().toISOString(),
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
    exportedAt: new Date().toISOString(),
    spans,
    metrics,
  };

  return format === 'json-pretty'
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);
}

// =============================================================================
// Tree Building
// =============================================================================

interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
}

/**
 * Builds a tree structure from flat span list.
 */
function buildSpanTree(spans: readonly TraceSpan[]): SpanNode[] {
  const spanMap = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // Create nodes
  for (const span of spans) {
    spanMap.set(span.context.spanId, { span, children: [] });
  }

  // Build tree
  for (const span of spans) {
    const node = spanMap.get(span.context.spanId);
    if (node === undefined) continue;

    if (span.context.parentSpanId !== undefined) {
      const parent = spanMap.get(span.context.parentSpanId);
      if (parent !== undefined) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Sort children by start time
  function sortChildren(node: SpanNode): void {
    node.children.sort((a, b) => a.span.startTime - b.span.startTime);
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  for (const root of roots) {
    sortChildren(root);
  }

  return roots.sort((a, b) => a.span.startTime - b.span.startTime);
}

// =============================================================================
// Visualization
// =============================================================================

/**
 * ANSI color codes for terminal output.
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Formats duration in human-readable form.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${String(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${String(minutes)}m ${seconds}s`;
}

/**
 * Formats cost in USD.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Formats token count.
 */
function formatTokens(input: number, output: number): string {
  return `${input.toLocaleString()} in / ${output.toLocaleString()} out`;
}

/**
 * Gets status indicator with optional color.
 */
function getStatusIndicator(status: string, useColors: boolean): string {
  if (useColors) {
    switch (status) {
      case 'success':
        return `${COLORS.green}✓${COLORS.reset}`;
      case 'error':
        return `${COLORS.red}✗${COLORS.reset}`;
      case 'running':
        return `${COLORS.yellow}●${COLORS.reset}`;
      default:
        return '?';
    }
  }
  switch (status) {
    case 'success':
      return '[OK]';
    case 'error':
      return '[ERR]';
    case 'running':
      return '[RUN]';
    default:
      return '[?]';
  }
}

/**
 * Appends token info to the main line if enabled.
 */
function appendTokenInfo(
  mainLine: string,
  span: TraceSpan,
  opts: Required<VisualizationOptions>
): string {
  if (!opts.showTokens || span.llmMetrics === undefined) {
    return mainLine;
  }
  const tokenStr = formatTokens(span.llmMetrics.inputTokens, span.llmMetrics.outputTokens);
  if (opts.colors) {
    return `${mainLine} ${COLORS.cyan}[${tokenStr}]${COLORS.reset}`;
  }
  return `${mainLine} [${tokenStr}]`;
}

/**
 * Appends cost info to the main line if enabled.
 */
function appendCostInfo(
  mainLine: string,
  span: TraceSpan,
  opts: Required<VisualizationOptions>
): string {
  if (!opts.showCost || span.llmMetrics?.costUsd === undefined) {
    return mainLine;
  }
  const costStr = formatCost(span.llmMetrics.costUsd);
  if (opts.colors) {
    return `${mainLine} ${COLORS.yellow}${costStr}${COLORS.reset}`;
  }
  return `${mainLine} ${costStr}`;
}

/**
 * Renders error message if present.
 */
function renderErrorLine(
  span: TraceSpan,
  errorPrefix: string,
  opts: Required<VisualizationOptions>
): string | null {
  if (span.errorMessage === undefined) {
    return null;
  }
  if (opts.colors) {
    return `${errorPrefix}${COLORS.red}Error: ${span.errorMessage}${COLORS.reset}`;
  }
  return `${errorPrefix}Error: ${span.errorMessage}`;
}

/**
 * Renders a single span node.
 */
function renderSpanNode(
  node: SpanNode,
  prefix: string,
  isLast: boolean,
  opts: Required<VisualizationOptions>
): string[] {
  const lines: string[] = [];
  const { span } = node;

  // Compute duration
  const durationMs = span.endTime !== undefined ? span.endTime - span.startTime : 0;
  const durationStr = span.endTime !== undefined ? formatDuration(durationMs) : 'running';

  // Build main line
  const connector = isLast ? '└── ' : '├── ';
  const status = getStatusIndicator(span.status, opts.colors);
  let mainLine = `${prefix}${connector}${status} ${span.name} (${durationStr})`;
  mainLine = appendTokenInfo(mainLine, span, opts);
  mainLine = appendCostInfo(mainLine, span, opts);
  lines.push(mainLine);

  // Add error message if present
  const errorPrefix = prefix + (isLast ? '    ' : '│   ');
  const errorLine = renderErrorLine(span, errorPrefix, opts);
  if (errorLine !== null) {
    lines.push(errorLine);
  }

  // Render children
  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child !== undefined) {
      const childIsLast = i === node.children.length - 1;
      lines.push(...renderSpanNode(child, childPrefix, childIsLast, opts));
    }
  }

  return lines;
}

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
 * 🔍 Trace: abc123-def456
 * ├── ✓ orchestrate-task (2.34s)
 * │   ├── ✓ analyze (890ms) [1,234 in / 456 out] $0.0052
 * │   └── ✓ review (1.45s) [2,345 in / 789 out] $0.0123
 * └── Total: 2.34s | Tokens: 3,579 in / 1,245 out | Cost: $0.0175
 * ```
 */
/**
 * Renders the trace header line.
 */
function renderHeader(traceId: string, useColors: boolean): string {
  if (useColors) {
    return `${COLORS.bold}🔍 Trace: ${traceId}${COLORS.reset}`;
  }
  return `Trace: ${traceId}`;
}

/**
 * Builds summary parts for the trace.
 */
function buildSummaryParts(
  metrics: AggregatedMetrics,
  opts: Required<VisualizationOptions>
): string[] {
  const parts: string[] = [];
  parts.push(`Total: ${formatDuration(metrics.durationMs)}`);

  if (opts.showTokens && (metrics.totalInputTokens > 0 || metrics.totalOutputTokens > 0)) {
    const tokensIn = metrics.totalInputTokens.toLocaleString();
    const tokensOut = metrics.totalOutputTokens.toLocaleString();
    parts.push(`Tokens: ${tokensIn} in / ${tokensOut} out`);
  }

  if (opts.showCost && metrics.totalCostUsd > 0) {
    parts.push(`Cost: ${formatCost(metrics.totalCostUsd)}`);
  }

  if (metrics.errorSpans > 0) {
    const errCount = String(metrics.errorSpans);
    if (opts.colors) {
      parts.push(`${COLORS.red}Errors: ${errCount}${COLORS.reset}`);
    } else {
      parts.push(`Errors: ${errCount}`);
    }
  }

  return parts;
}

export function visualizeTrace(tracer: Tracer, options?: VisualizationOptions): string[] {
  const opts: Required<VisualizationOptions> = { ...DEFAULT_VIS_OPTIONS, ...options };
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortId = traceId.slice(0, 8);
  return `trace-${timestamp}-${shortId}.json`;
}
