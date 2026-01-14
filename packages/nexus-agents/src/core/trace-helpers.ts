/**
 * nexus-agents/core - Trace Helpers
 *
 * Utility functions for trace management and global tracer access.
 */

import { randomUUID } from 'node:crypto';
import type { TraceContext, TracerConfig, LLMMetrics } from './trace-types.js';

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
    const errorMessage = error instanceof Error ? error.message : String(error);
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
