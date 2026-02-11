/**
 * nexus-agents/core - Trace Helpers
 *
 * Utility functions for trace management and global tracer access.
 */

import { randomUUID } from 'node:crypto';
import type {
  TraceContext,
  TracerConfig,
  LLMMetrics,
  TraceSpan as TraceSpanType,
  AggregatedMetrics as AggregatedMetricsType,
} from './trace-types.js';
import { getErrorMessage } from './errors.js';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generates a UUID-based trace ID.
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Generates a UUID-based span ID.
 */
export function generateSpanId(): string {
  return randomUUID();
}

// =============================================================================
// Global Tracer Management
// =============================================================================

/**
 * Aggregated metrics across multiple spans.
 * Duplicated here to avoid circular dependency with trace-types.
 */
interface AggregatedMetrics {
  totalSpans: number;
  successfulSpans: number;
  errorSpans: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  durationMs: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  byProvider: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

/**
 * A single trace span representing a unit of work.
 * Duplicated here to avoid circular dependency with trace-types.
 */
interface TraceSpan {
  context: TraceContext;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'success' | 'error';
  attributes: Record<string, unknown>;
  llmMetrics?: LLMMetrics;
  errorMessage?: string;
}

/**
 * Interface for the Tracer class to avoid circular dependency.
 * This matches the public API of the Tracer class.
 */
export interface ITracer {
  isEnabled(): boolean;
  startTrace(name: string, attributes?: Record<string, unknown>): TraceSpan | undefined;
  startSpan(
    name: string,
    attributes?: Record<string, unknown>,
    parentSpanId?: string
  ): TraceSpan | undefined;
  startChildSpan(
    parentSpanId: string,
    name: string,
    attributes?: Record<string, unknown>
  ): TraceSpan | undefined;
  endSpan(spanId: string, status: 'success' | 'error', errorMessage?: string): void;
  recordLLMMetrics(spanId: string, metrics: Omit<LLMMetrics, 'costUsd'>): void;
  addAttributes(spanId: string, attributes: Record<string, unknown>): void;
  getSpan(spanId: string): TraceSpan | undefined;
  getAllSpans(): TraceSpan[];
  getTraceId(): string | undefined;
  getCurrentContext(): TraceContext | undefined;
  getAggregatedMetrics(): AggregatedMetrics;
  clear(): void;
}

/** Global tracer instance */
let globalTracer: ITracer | undefined;

/** Factory function to create a tracer (set by trace.ts to break circular dependency) */
let tracerFactory: ((config?: TracerConfig) => ITracer) | undefined;

/**
 * Sets the tracer factory function.
 * This is called by trace.ts during module initialization.
 *
 * @internal
 */
export function setTracerFactory(factory: (config?: TracerConfig) => ITracer): void {
  tracerFactory = factory;
}

/**
 * Gets or creates the global tracer instance.
 *
 * @param config - Optional configuration for creating the tracer
 * @returns The global tracer instance
 */
export function getTracer(config?: TracerConfig): ITracer {
  if (globalTracer === undefined) {
    if (tracerFactory === undefined) {
      throw new Error(
        'Tracer factory not initialized. Import from trace.ts before calling getTracer.'
      );
    }
    globalTracer = tracerFactory(config);
  }
  return globalTracer;
}

/**
 * Sets the global tracer instance.
 *
 * @param tracer - The tracer to use globally
 */
export function setTracer(tracer: ITracer): void {
  globalTracer = tracer;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Wraps a function in a span, automatically tracking duration and errors.
 *
 * @param name - Name for the span
 * @param fn - Async function to wrap
 * @param attributes - Optional attributes to attach to the span
 * @returns Result of the wrapped function
 *
 * @example
 * ```typescript
 * const result = await withSpan('process-request', async () => {
 *   return await processRequest(data);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, attributes);

  if (span === undefined) {
    // Tracing disabled, just run the function
    return fn();
  }

  try {
    const result = await fn();
    tracer.endSpan(span.context.spanId, 'success');
    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    tracer.endSpan(span.context.spanId, 'error', errorMessage);
    throw error;
  }
}

/**
 * Records LLM metrics on the global tracer.
 *
 * @param spanId - ID of the span to record metrics for
 * @param metrics - LLM metrics to record
 */
export function recordLLMMetrics(spanId: string, metrics: Omit<LLMMetrics, 'costUsd'>): void {
  const tracer = getTracer();
  tracer.recordLLMMetrics(spanId, metrics);
}

/**
 * Gets the current trace context from the global tracer.
 *
 * @returns Current trace context, or undefined if no trace is active
 */
export function getTraceContext(): TraceContext | undefined {
  const tracer = getTracer();
  return tracer.getCurrentContext();
}

// =============================================================================
// Aggregation Helpers
// =============================================================================

/**
 * Token bucket entry for model or provider aggregation.
 */
export interface TokenBucketEntry {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Result of span time bounds calculation.
 */
export interface SpanTimeBounds {
  minStartTime: number;
  maxEndTime: number;
}

/**
 * Counts span by its status, incrementing the appropriate counter.
 *
 * @param span - The span to count
 * @param metrics - The metrics object to update
 */
export function countSpanStatus(span: TraceSpanType, metrics: AggregatedMetricsType): void {
  if (span.status === 'success') {
    metrics.successfulSpans++;
  } else if (span.status === 'error') {
    metrics.errorSpans++;
  }
}

/**
 * Aggregates metrics into a keyed bucket (model or provider).
 *
 * @param bucket - The bucket to aggregate into
 * @param key - The key (model name or provider)
 * @param llm - The LLM metrics to aggregate
 */
export function aggregateByKey(
  bucket: Record<string, TokenBucketEntry>,
  key: string,
  llm: LLMMetrics
): void {
  let entry = bucket[key];
  if (entry === undefined) {
    entry = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    bucket[key] = entry;
  }
  entry.inputTokens += llm.inputTokens;
  entry.outputTokens += llm.outputTokens;
  entry.costUsd += llm.costUsd ?? 0;
}

/**
 * Aggregates LLM metrics from a span into the aggregated metrics.
 *
 * @param span - The span containing LLM metrics
 * @param metrics - The metrics object to update
 */
export function aggregateLLMMetrics(span: TraceSpanType, metrics: AggregatedMetricsType): void {
  if (span.llmMetrics === undefined) {
    return;
  }

  const llm = span.llmMetrics;
  metrics.totalInputTokens += llm.inputTokens;
  metrics.totalOutputTokens += llm.outputTokens;
  metrics.totalCostUsd += llm.costUsd ?? 0;

  aggregateByKey(metrics.byModel, llm.model, llm);
  aggregateByKey(metrics.byProvider, llm.provider, llm);
}

/**
 * Calculates the total duration from time bounds.
 *
 * @param metrics - The metrics object to update
 * @param minStartTime - The earliest start time
 * @param maxEndTime - The latest end time
 */
export function calculateDuration(
  metrics: AggregatedMetricsType,
  minStartTime: number,
  maxEndTime: number
): void {
  if (minStartTime !== Infinity && maxEndTime > 0) {
    metrics.durationMs = maxEndTime - minStartTime;
  }
}

/**
 * Aggregates individual span metrics into the aggregated metrics object.
 *
 * @param spans - Array of spans to aggregate
 * @param metrics - The metrics object to update
 * @returns The time bounds (min start, max end)
 */
export function aggregateSpanMetrics(
  spans: TraceSpanType[],
  metrics: AggregatedMetricsType
): SpanTimeBounds {
  let minStartTime = Infinity;
  let maxEndTime = 0;

  for (const span of spans) {
    countSpanStatus(span, metrics);
    minStartTime = Math.min(minStartTime, span.startTime);
    if (span.endTime !== undefined) {
      maxEndTime = Math.max(maxEndTime, span.endTime);
    }
    aggregateLLMMetrics(span, metrics);
  }

  return { minStartTime, maxEndTime };
}

/**
 * Finds the most recent running span from a collection.
 *
 * @param spans - Iterator of spans to search
 * @returns The latest running span, or undefined if none found
 */
export function findLatestRunningSpan(spans: Iterable<TraceSpanType>): TraceSpanType | undefined {
  let latestSpan: TraceSpanType | undefined;
  for (const span of spans) {
    if (span.status === 'running') {
      if (latestSpan === undefined || span.startTime > latestSpan.startTime) {
        latestSpan = span;
      }
    }
  }
  return latestSpan;
}

/**
 * Identifies span IDs to prune based on age, keeping running spans.
 *
 * @param entries - Span entries as [spanId, span] pairs
 * @param prunePercent - Percentage of completed spans to remove (0-1)
 * @returns Array of span IDs to delete
 */
export function getSpansToPrune(
  entries: Iterable<[string, TraceSpanType]>,
  prunePercent: number = 0.1
): string[] {
  const completedSpans = Array.from(entries)
    .filter(([, span]) => span.status !== 'running')
    .sort((a, b) => a[1].startTime - b[1].startTime);

  const toRemove = Math.ceil(completedSpans.length * prunePercent);
  const idsToDelete: string[] = [];

  for (let i = 0; i < toRemove && i < completedSpans.length; i++) {
    const entry = completedSpans[i];
    if (entry !== undefined) {
      idsToDelete.push(entry[0]);
    }
  }

  return idsToDelete;
}
