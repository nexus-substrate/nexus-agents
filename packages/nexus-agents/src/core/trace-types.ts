/**
 * nexus-agents/core - Trace Type Definitions
 *
 * Type definitions for the lightweight trace module.
 */

import type { ILogger } from './logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Trace context for correlating spans across operations.
 */
export interface TraceContext {
  /** Unique identifier for the entire trace */
  traceId: string;
  /** Span ID of the parent span (if nested) */
  parentSpanId?: string;
  /** Unique identifier for this span */
  spanId: string;
}

/**
 * Status of a trace span.
 */
export type SpanStatus = 'running' | 'success' | 'error';

/**
 * LLM-specific metrics collected during a span.
 */
export interface LLMMetrics {
  /** Number of input tokens processed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Model identifier used */
  model: string;
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  provider: string;
  /** Calculated cost in USD (optional) */
  costUsd?: number;
}

/**
 * A single trace span representing a unit of work.
 */
export interface TraceSpan {
  /** Trace context for this span */
  context: TraceContext;
  /** Human-readable name for this span */
  name: string;
  /** Start time in milliseconds since epoch */
  startTime: number;
  /** End time in milliseconds since epoch (set when span ends) */
  endTime?: number;
  /** Current status of the span */
  status: SpanStatus;
  /** Arbitrary attributes attached to the span */
  attributes: Record<string, unknown>;
  /** LLM metrics if this span involves model calls */
  llmMetrics?: LLMMetrics;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

/**
 * Aggregated metrics across multiple spans.
 */
export interface AggregatedMetrics {
  /** Total spans created */
  totalSpans: number;
  /** Spans completed successfully */
  successfulSpans: number;
  /** Spans that ended in error */
  errorSpans: number;
  /** Total input tokens across all LLM calls */
  totalInputTokens: number;
  /** Total output tokens across all LLM calls */
  totalOutputTokens: number;
  /** Total cost in USD across all LLM calls */
  totalCostUsd: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Breakdown by model */
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  /** Breakdown by provider */
  byProvider: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

/**
 * Configuration for the Tracer.
 */
export interface TracerConfig {
  /** Whether tracing is enabled (default: true) */
  enabled?: boolean;
  /** Logger to use for trace output */
  logger?: ILogger;
  /** Maximum number of spans to retain in memory */
  maxSpans?: number;
  /** Whether to log span events */
  logSpans?: boolean;
}
