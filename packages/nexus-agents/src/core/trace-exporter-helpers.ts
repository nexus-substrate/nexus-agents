/**
 * nexus-agents/core - Trace Exporter Helpers
 *
 * Pure helper functions for trace visualization.
 * Extracted from trace-exporter.ts to maintain file size limits.
 */

import type { TraceSpan, AggregatedMetrics } from './trace.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for trace visualization (resolved with defaults).
 */
export interface ResolvedVisualizationOptions {
  /** Show cost information */
  readonly showCost: boolean;
  /** Show token counts */
  readonly showTokens: boolean;
  /** Indent size for tree structure */
  readonly indentSize: number;
  /** Use colors in output */
  readonly colors: boolean;
}

/**
 * Tree node for span hierarchy.
 */
export interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
}

// =============================================================================
// ANSI Colors
// =============================================================================

/**
 * ANSI color codes for terminal output.
 */
export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Formats duration in human-readable form.
 * Supports milliseconds, seconds, minutes, and hours.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "150ms", "2.5s", "3m 45s", or "2h 15m"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${String(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${String(minutes)}m ${String(seconds)}s`;
  }
  // Hours format
  const hours = Math.floor(ms / 3600000);
  const remainMins = Math.floor((ms % 3600000) / 60000);
  return `${String(hours)}h ${String(remainMins)}m`;
}

/**
 * Formats duration in a simplified format (minutes only after 1min).
 * Useful for compact displays.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "150ms", "2.5s", or "3.5min"
 */
export function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * Formats cost in USD.
 */
export function formatCost(cost: number): string {
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
export function formatTokens(input: number, output: number): string {
  return `${input.toLocaleString()} in / ${output.toLocaleString()} out`;
}

// =============================================================================
// Status Indicators
// =============================================================================

/**
 * Gets status indicator with optional color.
 */
export function getStatusIndicator(status: string, useColors: boolean): string {
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

// =============================================================================
// Line Builders
// =============================================================================

/**
 * Appends token info to the main line if enabled.
 */
export function appendTokenInfo(
  mainLine: string,
  span: TraceSpan,
  opts: ResolvedVisualizationOptions
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
export function appendCostInfo(
  mainLine: string,
  span: TraceSpan,
  opts: ResolvedVisualizationOptions
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
export function renderErrorLine(
  span: TraceSpan,
  errorPrefix: string,
  opts: ResolvedVisualizationOptions
): string | null {
  if (span.errorMessage === undefined) {
    return null;
  }
  if (opts.colors) {
    return `${errorPrefix}${COLORS.red}Error: ${span.errorMessage}${COLORS.reset}`;
  }
  return `${errorPrefix}Error: ${span.errorMessage}`;
}

// =============================================================================
// Tree Building
// =============================================================================

/**
 * Sorts children of a span node by start time (recursive).
 */
function sortChildren(node: SpanNode): void {
  node.children.sort((a, b) => a.span.startTime - b.span.startTime);
  for (const child of node.children) {
    sortChildren(child);
  }
}

/**
 * Builds a tree structure from flat span list.
 */
export function buildSpanTree(spans: readonly TraceSpan[]): SpanNode[] {
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
  for (const root of roots) {
    sortChildren(root);
  }

  return roots.sort((a, b) => a.span.startTime - b.span.startTime);
}

// =============================================================================
// Span Rendering
// =============================================================================

/**
 * Renders a single span node.
 */
export function renderSpanNode(
  node: SpanNode,
  prefix: string,
  isLast: boolean,
  opts: ResolvedVisualizationOptions
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

// =============================================================================
// Header and Summary
// =============================================================================

/**
 * Renders the trace header line.
 */
export function renderHeader(traceId: string, useColors: boolean): string {
  if (useColors) {
    return `${COLORS.bold}🔍 Trace: ${traceId}${COLORS.reset}`;
  }
  return `Trace: ${traceId}`;
}

/**
 * Builds summary parts for the trace.
 */
export function buildSummaryParts(
  metrics: AggregatedMetrics,
  opts: ResolvedVisualizationOptions
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
