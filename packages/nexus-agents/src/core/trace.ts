/**
 * nexus-agents/core - Lightweight Trace Module
 *
 * Token counting, cost tracking, and span management without OpenTelemetry.
 * Provides minimal overhead tracing for LLM operations.
 */

import type { ILogger, LogContext } from './logger.js';
import { createLogger } from './logger.js';
import type {
  TraceContext,
  LLMMetrics,
  TraceSpan,
  AggregatedMetrics,
  TracerConfig,
} from './trace-types.js';
import { calculateCost } from './trace-pricing.js';
import { generateTraceId, generateSpanId, setTracerFactory } from './trace-helpers.js';

// =============================================================================
// Tracer Class
// =============================================================================

/**
 * Lightweight tracer for managing spans and collecting LLM metrics.
 *
 * The tracer creates and manages spans, supports parent-child relationships,
 * collects LLM metrics, and can aggregate data across a trace.
 *
 * @example
 * ```typescript
 * const tracer = new Tracer({ enabled: true });
 *
 * // Create a root span
 * const span = tracer.startSpan('orchestrate-task');
 *
 * // Record LLM metrics
 * tracer.recordLLMMetrics(span.context.spanId, {
 *   inputTokens: 1000,
 *   outputTokens: 500,
 *   model: 'claude-sonnet-4',
 *   provider: 'anthropic',
 * });
 *
 * // End the span
 * tracer.endSpan(span.context.spanId, 'success');
 *
 * // Get aggregated metrics
 * const metrics = tracer.getAggregatedMetrics();
 * ```
 */
export class Tracer {
  private readonly enabled: boolean;
  private readonly logger: ILogger;
  private readonly maxSpans: number;
  private readonly logSpans: boolean;
  private readonly spans: Map<string, TraceSpan> = new Map();
  private currentTraceId: string | undefined;

  /**
   * Creates a new Tracer instance.
   *
   * @param config - Tracer configuration
   */
  constructor(config: TracerConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.logger = config.logger ?? createLogger({ component: 'tracer' });
    this.maxSpans = config.maxSpans ?? 1000;
    this.logSpans = config.logSpans ?? false;
  }

  /**
   * Checks if tracing is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Starts a new trace with a root span.
   *
   * @param name - Name for the root span
   * @param attributes - Optional attributes to attach
   * @returns The created span, or undefined if tracing is disabled
   */
  startTrace(name: string, attributes: Record<string, unknown> = {}): TraceSpan | undefined {
    if (!this.enabled) {
      return undefined;
    }

    this.currentTraceId = generateTraceId();
    return this.startSpan(name, attributes);
  }

  /**
   * Starts a new span within the current trace.
   *
   * @param name - Name for the span
   * @param attributes - Optional attributes to attach
   * @param parentSpanId - Optional parent span ID for nesting
   * @returns The created span, or undefined if tracing is disabled
   */
  startSpan(
    name: string,
    attributes: Record<string, unknown> = {},
    parentSpanId?: string
  ): TraceSpan | undefined {
    if (!this.enabled) {
      return undefined;
    }

    // Ensure we have a trace ID
    this.currentTraceId ??= generateTraceId();
    const traceId = this.currentTraceId;

    const spanId = generateSpanId();
    const context: TraceContext = {
      traceId,
      spanId,
    };
    // Only set parentSpanId if defined (exactOptionalPropertyTypes compliance)
    if (parentSpanId !== undefined) {
      context.parentSpanId = parentSpanId;
    }
    const span: TraceSpan = {
      context,
      name,
      startTime: Date.now(),
      status: 'running',
      attributes,
    };

    // Enforce max spans limit
    if (this.spans.size >= this.maxSpans) {
      this.pruneOldestSpans();
    }

    this.spans.set(spanId, span);

    if (this.logSpans) {
      this.logger.debug('Span started', {
        spanId,
        traceId,
        name,
        parentSpanId,
      });
    }

    return span;
  }

  /**
   * Creates a child span under an existing parent span.
   *
   * @param parentSpanId - ID of the parent span
   * @param name - Name for the child span
   * @param attributes - Optional attributes to attach
   * @returns The created child span, or undefined if parent not found or tracing disabled
   */
  startChildSpan(
    parentSpanId: string,
    name: string,
    attributes: Record<string, unknown> = {}
  ): TraceSpan | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const parentSpan = this.spans.get(parentSpanId);
    if (parentSpan === undefined) {
      this.logger.warn('Parent span not found', { parentSpanId });
      return undefined;
    }

    return this.startSpan(name, attributes, parentSpanId);
  }

  /**
   * Ends a span with a final status.
   *
   * @param spanId - ID of the span to end
   * @param status - Final status ('success' or 'error')
   * @param errorMessage - Optional error message if status is 'error'
   */
  endSpan(spanId: string, status: 'success' | 'error', errorMessage?: string): void {
    if (!this.enabled) {
      return;
    }

    const span = this.spans.get(spanId);
    if (span === undefined) {
      this.logger.warn('Span not found', { spanId });
      return;
    }

    span.endTime = Date.now();
    span.status = status;
    if (errorMessage !== undefined) {
      span.errorMessage = errorMessage;
    }

    if (this.logSpans) {
      const durationMs = span.endTime - span.startTime;
      const context: LogContext = {
        spanId,
        name: span.name,
        status,
        durationMs,
      };
      if (span.llmMetrics !== undefined) {
        context['inputTokens'] = span.llmMetrics.inputTokens;
        context['outputTokens'] = span.llmMetrics.outputTokens;
        if (span.llmMetrics.costUsd !== undefined) {
          context['costUsd'] = span.llmMetrics.costUsd;
        }
      }
      if (errorMessage !== undefined) {
        context['error'] = errorMessage;
      }
      this.logger.debug('Span ended', context);
    }
  }

  /**
   * Records LLM metrics for a span.
   *
   * @param spanId - ID of the span to record metrics for
   * @param metrics - LLM metrics to record
   */
  recordLLMMetrics(spanId: string, metrics: Omit<LLMMetrics, 'costUsd'>): void {
    if (!this.enabled) {
      return;
    }

    const span = this.spans.get(spanId);
    if (span === undefined) {
      this.logger.warn('Span not found for LLM metrics', { spanId });
      return;
    }

    // Calculate cost
    const costUsd = calculateCost(metrics.model, metrics.inputTokens, metrics.outputTokens);

    // Build LLMMetrics with exactOptionalPropertyTypes compliance
    const llmMetrics: LLMMetrics = {
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      model: metrics.model,
      provider: metrics.provider,
    };
    if (costUsd !== undefined) {
      llmMetrics.costUsd = costUsd;
    }
    span.llmMetrics = llmMetrics;

    if (this.logSpans) {
      this.logger.debug('LLM metrics recorded', {
        spanId,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        model: metrics.model,
        provider: metrics.provider,
        costUsd,
      });
    }
  }

  /**
   * Adds attributes to an existing span.
   *
   * @param spanId - ID of the span to update
   * @param attributes - Attributes to add/update
   */
  addAttributes(spanId: string, attributes: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }

    const span = this.spans.get(spanId);
    if (span === undefined) {
      this.logger.warn('Span not found for attributes', { spanId });
      return;
    }

    span.attributes = { ...span.attributes, ...attributes };
  }

  /**
   * Gets a span by ID.
   *
   * @param spanId - ID of the span to retrieve
   * @returns The span, or undefined if not found
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Gets all spans in the current trace.
   *
   * @returns Array of all spans
   */
  getAllSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  /**
   * Gets the current trace ID.
   *
   * @returns Current trace ID, or undefined if no trace is active
   */
  getTraceId(): string | undefined {
    return this.currentTraceId;
  }

  /**
   * Gets the current trace context.
   *
   * @returns Current trace context with the most recent span, or undefined
   */
  getCurrentContext(): TraceContext | undefined {
    if (!this.enabled || this.currentTraceId === undefined) {
      return undefined;
    }

    // Find the most recent running span
    let latestSpan: TraceSpan | undefined;
    for (const span of this.spans.values()) {
      if (span.status === 'running') {
        if (latestSpan === undefined || span.startTime > latestSpan.startTime) {
          latestSpan = span;
        }
      }
    }

    return latestSpan?.context;
  }

  /**
   * Aggregates metrics across all spans in the trace.
   *
   * @returns Aggregated metrics
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const spans = this.getAllSpans();
    const metrics: AggregatedMetrics = {
      totalSpans: spans.length,
      successfulSpans: 0,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
      byModel: {},
      byProvider: {},
    };

    const { minStartTime, maxEndTime } = this.aggregateSpanMetrics(spans, metrics);
    this.calculateDuration(metrics, minStartTime, maxEndTime);

    return metrics;
  }

  /**
   * Aggregates individual span metrics into the aggregated metrics object.
   */
  private aggregateSpanMetrics(
    spans: TraceSpan[],
    metrics: AggregatedMetrics
  ): { minStartTime: number; maxEndTime: number } {
    let minStartTime = Infinity;
    let maxEndTime = 0;

    for (const span of spans) {
      this.countSpanStatus(span, metrics);
      minStartTime = Math.min(minStartTime, span.startTime);
      if (span.endTime !== undefined) {
        maxEndTime = Math.max(maxEndTime, span.endTime);
      }
      this.aggregateLLMMetrics(span, metrics);
    }

    return { minStartTime, maxEndTime };
  }

  /**
   * Counts span by its status.
   */
  private countSpanStatus(span: TraceSpan, metrics: AggregatedMetrics): void {
    if (span.status === 'success') {
      metrics.successfulSpans++;
    } else if (span.status === 'error') {
      metrics.errorSpans++;
    }
  }

  /**
   * Aggregates LLM metrics from a span into the aggregated metrics.
   */
  private aggregateLLMMetrics(span: TraceSpan, metrics: AggregatedMetrics): void {
    if (span.llmMetrics === undefined) {
      return;
    }

    const llm = span.llmMetrics;
    metrics.totalInputTokens += llm.inputTokens;
    metrics.totalOutputTokens += llm.outputTokens;
    metrics.totalCostUsd += llm.costUsd ?? 0;

    this.aggregateByKey(metrics.byModel, llm.model, llm);
    this.aggregateByKey(metrics.byProvider, llm.provider, llm);
  }

  /**
   * Aggregates metrics into a keyed bucket (model or provider).
   */
  private aggregateByKey(
    bucket: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>,
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
   * Calculates the total duration from time bounds.
   */
  private calculateDuration(
    metrics: AggregatedMetrics,
    minStartTime: number,
    maxEndTime: number
  ): void {
    if (minStartTime !== Infinity && maxEndTime > 0) {
      metrics.durationMs = maxEndTime - minStartTime;
    }
  }

  /**
   * Clears all spans and resets the trace.
   */
  clear(): void {
    this.spans.clear();
    this.currentTraceId = undefined;
  }

  /**
   * Prunes oldest completed spans to stay under maxSpans limit.
   */
  private pruneOldestSpans(): void {
    const completedSpans = Array.from(this.spans.entries())
      .filter(([, span]) => span.status !== 'running')
      .sort((a, b) => a[1].startTime - b[1].startTime);

    // Remove oldest 10% of completed spans
    const toRemove = Math.ceil(completedSpans.length * 0.1);
    for (let i = 0; i < toRemove && i < completedSpans.length; i++) {
      const entry = completedSpans[i];
      if (entry !== undefined) {
        this.spans.delete(entry[0]);
      }
    }
  }
}

// =============================================================================
// Initialize tracer factory (breaks circular dependency)
// =============================================================================

// Register the Tracer factory so trace-helpers can create instances
setTracerFactory((config?: TracerConfig) => new Tracer(config));

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export * from './trace-types.js';
export * from './trace-pricing.js';
export * from './trace-helpers.js';
