/**
 * Tracer Tests
 *
 * Comprehensive tests for the lightweight trace module.
 * Covers span lifecycle, metrics recording, and aggregation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Tracer } from './trace.js';
import type { TraceSpan } from './trace-types.js';
import type { ILogger } from './logger.js';

/**
 * Creates a mock logger that implements ILogger interface.
 */
function createMockLogger(): ILogger & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const mock: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
  return mock as ILogger & {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-23T12:00:00.000Z'));
    tracer = new Tracer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create tracer with default config', () => {
      const t = new Tracer();
      expect(t.isEnabled()).toBe(true);
    });

    it('should create tracer with enabled=true', () => {
      const t = new Tracer({ enabled: true });
      expect(t.isEnabled()).toBe(true);
    });

    it('should create tracer with enabled=false', () => {
      const t = new Tracer({ enabled: false });
      expect(t.isEnabled()).toBe(false);
    });

    it('should create tracer with custom logger', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      const span = t.startSpan('test-span');
      expect(span).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('Span started', expect.any(Object));
    });

    it('should create tracer with custom maxSpans', () => {
      const t = new Tracer({ maxSpans: 5 });

      // Create 6 spans to trigger pruning
      for (let i = 0; i < 6; i++) {
        const span = t.startSpan('span-' + String(i));
        if (span && i < 5) {
          t.endSpan(span.context.spanId, 'success');
        }
      }

      // Should have pruned to stay under limit
      expect(t.getAllSpans().length).toBeLessThanOrEqual(6);
    });

    it('should create tracer with logSpans=true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      t.startSpan('test-span');
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should create tracer with logSpans=false (default)', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger });

      t.startSpan('test-span');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // isEnabled Tests
  // ===========================================================================

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const t = new Tracer({ enabled: true });
      expect(t.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const t = new Tracer({ enabled: false });
      expect(t.isEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // Disabled Mode Tests
  // ===========================================================================

  describe('disabled mode', () => {
    let disabledTracer: Tracer;

    beforeEach(() => {
      disabledTracer = new Tracer({ enabled: false });
    });

    it('startTrace should return undefined', () => {
      const span = disabledTracer.startTrace('test');
      expect(span).toBeUndefined();
    });

    it('startSpan should return undefined', () => {
      const span = disabledTracer.startSpan('test');
      expect(span).toBeUndefined();
    });

    it('startChildSpan should return undefined', () => {
      const span = disabledTracer.startChildSpan('parent-id', 'child');
      expect(span).toBeUndefined();
    });

    it('endSpan should return early without error', () => {
      expect(() => {
        disabledTracer.endSpan('span-id', 'success');
      }).not.toThrow();
    });

    it('recordLLMMetrics should return early without error', () => {
      expect(() => {
        disabledTracer.recordLLMMetrics('span-id', {
          inputTokens: 100,
          outputTokens: 50,
          model: 'claude-sonnet-4',
          provider: 'anthropic',
        });
      }).not.toThrow();
    });

    it('addAttributes should return early without error', () => {
      expect(() => {
        disabledTracer.addAttributes('span-id', { key: 'value' });
      }).not.toThrow();
    });

    it('getCurrentContext should return undefined', () => {
      const context = disabledTracer.getCurrentContext();
      expect(context).toBeUndefined();
    });

    it('getAllSpans should return empty array', () => {
      expect(disabledTracer.getAllSpans()).toEqual([]);
    });

    it('getAggregatedMetrics should return zero values', () => {
      const metrics = disabledTracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(0);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalCostUsd).toBe(0);
    });
  });

  // ===========================================================================
  // startTrace Tests
  // ===========================================================================

  describe('startTrace', () => {
    it('should create root span with unique trace ID', () => {
      const span = tracer.startTrace('root-span');

      expect(span).toBeDefined();
      expect(span?.name).toBe('root-span');
      expect(span?.context.traceId).toBeDefined();
      expect(span?.context.spanId).toBeDefined();
      expect(span?.context.parentSpanId).toBeUndefined();
      expect(span?.status).toBe('running');
    });

    it('should set current trace ID', () => {
      const span = tracer.startTrace('root-span');

      expect(tracer.getTraceId()).toBe(span?.context.traceId);
    });

    it('should create span with attributes', () => {
      const span = tracer.startTrace('root-span', { task: 'test', priority: 1 });

      expect(span?.attributes).toEqual({ task: 'test', priority: 1 });
    });

    it('should set startTime to current time', () => {
      const span = tracer.startTrace('root-span');

      expect(span?.startTime).toBe(Date.now());
    });

    it('should return undefined when disabled', () => {
      const disabled = new Tracer({ enabled: false });
      const span = disabled.startTrace('root');

      expect(span).toBeUndefined();
    });
  });

  // ===========================================================================
  // startSpan Tests
  // ===========================================================================

  describe('startSpan', () => {
    it('should create span with generated trace ID if none exists', () => {
      const span = tracer.startSpan('new-span');

      expect(span).toBeDefined();
      expect(span?.context.traceId).toBeDefined();
      expect(tracer.getTraceId()).toBe(span?.context.traceId);
    });

    it('should create span with existing trace ID', () => {
      const root = tracer.startTrace('root');
      const child = tracer.startSpan('child');

      expect(child?.context.traceId).toBe(root?.context.traceId);
    });

    it('should create span without parent by default', () => {
      const span = tracer.startSpan('standalone');

      expect(span?.context.parentSpanId).toBeUndefined();
    });

    it('should create span with explicit parent', () => {
      const parent = tracer.startSpan('parent');
      const child = tracer.startSpan('child', {}, parent?.context.spanId);

      expect(child?.context.parentSpanId).toBe(parent?.context.spanId);
    });

    it('should create span with empty attributes by default', () => {
      const span = tracer.startSpan('no-attrs');

      expect(span?.attributes).toEqual({});
    });

    it('should create span with custom attributes', () => {
      const span = tracer.startSpan('with-attrs', { foo: 'bar', count: 42 });

      expect(span?.attributes).toEqual({ foo: 'bar', count: 42 });
    });

    it('should add span to internal collection', () => {
      const span = tracer.startSpan('collected');

      expect(tracer.getSpan(span!.context.spanId)).toBe(span);
      expect(tracer.getAllSpans()).toContain(span);
    });

    it('should log span start when logSpans is true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      t.startSpan('logged-span', { attr: 'value' }, 'parent-id');

      expect(mockLogger.debug).toHaveBeenCalledWith('Span started', {
        spanId: expect.any(String),
        traceId: expect.any(String),
        name: 'logged-span',
        parentSpanId: 'parent-id',
      });
    });
  });

  // ===========================================================================
  // startChildSpan Tests
  // ===========================================================================

  describe('startChildSpan', () => {
    it('should create child span with parent reference', () => {
      const parent = tracer.startSpan('parent');
      const child = tracer.startChildSpan(parent!.context.spanId, 'child');

      expect(child).toBeDefined();
      expect(child?.context.parentSpanId).toBe(parent?.context.spanId);
      expect(child?.context.traceId).toBe(parent?.context.traceId);
    });

    it('should create child with attributes', () => {
      const parent = tracer.startSpan('parent');
      const child = tracer.startChildSpan(parent!.context.spanId, 'child', { nested: true });

      expect(child?.attributes).toEqual({ nested: true });
    });

    it('should return undefined for non-existent parent', () => {
      const child = tracer.startChildSpan('non-existent-id', 'orphan');

      expect(child).toBeUndefined();
    });

    it('should log warning for non-existent parent', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger });

      t.startChildSpan('non-existent', 'child');

      expect(mockLogger.warn).toHaveBeenCalledWith('Parent span not found', {
        parentSpanId: 'non-existent',
      });
    });

    it('should return undefined when disabled', () => {
      const disabled = new Tracer({ enabled: false });
      const child = disabled.startChildSpan('parent-id', 'child');

      expect(child).toBeUndefined();
    });

    it('should support multi-level nesting', () => {
      const root = tracer.startTrace('root');
      const level1 = tracer.startChildSpan(root!.context.spanId, 'level1');
      const level2 = tracer.startChildSpan(level1!.context.spanId, 'level2');
      const level3 = tracer.startChildSpan(level2!.context.spanId, 'level3');

      expect(level3?.context.parentSpanId).toBe(level2?.context.spanId);
      expect(level2?.context.parentSpanId).toBe(level1?.context.spanId);
      expect(level1?.context.parentSpanId).toBe(root?.context.spanId);

      // All share same trace ID
      expect(level3?.context.traceId).toBe(root?.context.traceId);
    });
  });

  // ===========================================================================
  // endSpan Tests
  // ===========================================================================

  describe('endSpan', () => {
    it('should set endTime on span', () => {
      const span = tracer.startSpan('to-end');
      vi.advanceTimersByTime(100);
      tracer.endSpan(span!.context.spanId, 'success');

      const endedSpan = tracer.getSpan(span!.context.spanId);
      expect(endedSpan?.endTime).toBe(Date.now());
    });

    it('should set success status', () => {
      const span = tracer.startSpan('success-span');
      tracer.endSpan(span!.context.spanId, 'success');

      expect(tracer.getSpan(span!.context.spanId)?.status).toBe('success');
    });

    it('should set error status', () => {
      const span = tracer.startSpan('error-span');
      tracer.endSpan(span!.context.spanId, 'error');

      expect(tracer.getSpan(span!.context.spanId)?.status).toBe('error');
    });

    it('should set error message when provided', () => {
      const span = tracer.startSpan('error-span');
      tracer.endSpan(span!.context.spanId, 'error', 'Something went wrong');

      expect(tracer.getSpan(span!.context.spanId)?.errorMessage).toBe('Something went wrong');
    });

    it('should not set errorMessage for success status', () => {
      const span = tracer.startSpan('success-span');
      tracer.endSpan(span!.context.spanId, 'success');

      expect(tracer.getSpan(span!.context.spanId)?.errorMessage).toBeUndefined();
    });

    it('should log warning for non-existent span', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger });

      t.endSpan('non-existent', 'success');

      expect(mockLogger.warn).toHaveBeenCalledWith('Span not found', {
        spanId: 'non-existent',
      });
    });

    it('should log span end when logSpans is true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      const span = t.startSpan('logged-span');
      vi.advanceTimersByTime(50);
      t.endSpan(span!.context.spanId, 'success');

      expect(mockLogger.debug).toHaveBeenCalledWith('Span ended', {
        spanId: span!.context.spanId,
        name: 'logged-span',
        status: 'success',
        durationMs: 50,
      });
    });

    it('should log LLM metrics when present and logSpans is true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      const span = t.startSpan('llm-span');
      t.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      t.endSpan(span!.context.spanId, 'success');

      const lastCall = mockLogger.debug.mock.calls.find((call) => call[0] === 'Span ended');
      expect(lastCall?.[1]).toMatchObject({
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: expect.any(Number),
      });
    });

    it('should log error message when present and logSpans is true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      const span = t.startSpan('error-span');
      t.endSpan(span!.context.spanId, 'error', 'Connection timeout');

      const lastCall = mockLogger.debug.mock.calls.find((call) => call[0] === 'Span ended');
      expect(lastCall?.[1]).toMatchObject({
        status: 'error',
        error: 'Connection timeout',
      });
    });
  });

  // ===========================================================================
  // recordLLMMetrics Tests
  // ===========================================================================

  describe('recordLLMMetrics', () => {
    it('should record metrics on span', () => {
      const span = tracer.startSpan('llm-span');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });

      const recorded = tracer.getSpan(span!.context.spanId);
      expect(recorded?.llmMetrics).toBeDefined();
      expect(recorded?.llmMetrics?.inputTokens).toBe(1000);
      expect(recorded?.llmMetrics?.outputTokens).toBe(500);
      expect(recorded?.llmMetrics?.model).toBe('claude-sonnet-4');
      expect(recorded?.llmMetrics?.provider).toBe('anthropic');
    });

    it('should calculate cost for known model', () => {
      const span = tracer.startSpan('llm-span');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });

      const recorded = tracer.getSpan(span!.context.spanId);
      // claude-sonnet-4: input=$3/1M, output=$15/1M
      // 1M * 3 + 0.5M * 15 = 3 + 7.5 = 10.5
      expect(recorded?.llmMetrics?.costUsd).toBeCloseTo(10.5, 2);
    });

    it('should calculate cost for model with version suffix', () => {
      const span = tracer.startSpan('llm-span');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
      });

      const recorded = tracer.getSpan(span!.context.spanId);
      // Should match claude-sonnet-4 pricing
      expect(recorded?.llmMetrics?.costUsd).toBeCloseTo(18.0, 2);
    });

    it('should not set costUsd for unknown model', () => {
      const span = tracer.startSpan('llm-span');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'unknown-model-xyz',
        provider: 'unknown',
      });

      const recorded = tracer.getSpan(span!.context.spanId);
      expect(recorded?.llmMetrics?.costUsd).toBeUndefined();
    });

    it('should log warning for non-existent span', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger });

      t.recordLLMMetrics('non-existent', {
        inputTokens: 100,
        outputTokens: 50,
        model: 'test',
        provider: 'test',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Span not found for LLM metrics', {
        spanId: 'non-existent',
      });
    });

    it('should log metrics when logSpans is true', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger, logSpans: true });

      const span = t.startSpan('llm-span');
      t.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'codex-5.3',
        provider: 'openai',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('LLM metrics recorded', {
        spanId: span!.context.spanId,
        inputTokens: 1000,
        outputTokens: 500,
        model: 'codex-5.3',
        provider: 'openai',
        costUsd: expect.any(Number),
      });
    });

    it('should handle zero tokens', () => {
      const span = tracer.startSpan('zero-tokens');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 0,
        outputTokens: 0,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });

      const recorded = tracer.getSpan(span!.context.spanId);
      expect(recorded?.llmMetrics?.inputTokens).toBe(0);
      expect(recorded?.llmMetrics?.outputTokens).toBe(0);
      expect(recorded?.llmMetrics?.costUsd).toBe(0);
    });
  });

  // ===========================================================================
  // addAttributes Tests
  // ===========================================================================

  describe('addAttributes', () => {
    it('should add new attributes to span', () => {
      const span = tracer.startSpan('span', { initial: 'value' });
      tracer.addAttributes(span!.context.spanId, { added: 'attribute' });

      const updated = tracer.getSpan(span!.context.spanId);
      expect(updated?.attributes).toEqual({
        initial: 'value',
        added: 'attribute',
      });
    });

    it('should overwrite existing attributes', () => {
      const span = tracer.startSpan('span', { key: 'original' });
      tracer.addAttributes(span!.context.spanId, { key: 'updated' });

      const updated = tracer.getSpan(span!.context.spanId);
      expect(updated?.attributes).toEqual({ key: 'updated' });
    });

    it('should handle multiple attribute additions', () => {
      const span = tracer.startSpan('span');
      tracer.addAttributes(span!.context.spanId, { a: 1 });
      tracer.addAttributes(span!.context.spanId, { b: 2 });
      tracer.addAttributes(span!.context.spanId, { c: 3 });

      const updated = tracer.getSpan(span!.context.spanId);
      expect(updated?.attributes).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should log warning for non-existent span', () => {
      const mockLogger = createMockLogger();
      const t = new Tracer({ logger: mockLogger });

      t.addAttributes('non-existent', { key: 'value' });

      expect(mockLogger.warn).toHaveBeenCalledWith('Span not found for attributes', {
        spanId: 'non-existent',
      });
    });

    it('should not throw when disabled', () => {
      const disabled = new Tracer({ enabled: false });
      expect(() => {
        disabled.addAttributes('any-id', { key: 'value' });
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // getSpan Tests
  // ===========================================================================

  describe('getSpan', () => {
    it('should return span by ID', () => {
      const span = tracer.startSpan('my-span');
      const retrieved = tracer.getSpan(span!.context.spanId);

      expect(retrieved).toBe(span);
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = tracer.getSpan('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should return undefined after clear', () => {
      const span = tracer.startSpan('temporary');
      tracer.clear();

      expect(tracer.getSpan(span!.context.spanId)).toBeUndefined();
    });
  });

  // ===========================================================================
  // getAllSpans Tests
  // ===========================================================================

  describe('getAllSpans', () => {
    it('should return empty array when no spans', () => {
      expect(tracer.getAllSpans()).toEqual([]);
    });

    it('should return all created spans', () => {
      const span1 = tracer.startSpan('span1');
      const span2 = tracer.startSpan('span2');
      const span3 = tracer.startSpan('span3');

      const allSpans = tracer.getAllSpans();
      expect(allSpans).toHaveLength(3);
      expect(allSpans).toContain(span1);
      expect(allSpans).toContain(span2);
      expect(allSpans).toContain(span3);
    });

    it('should include both running and ended spans', () => {
      tracer.startSpan('running');
      const ended = tracer.startSpan('ended');
      tracer.endSpan(ended!.context.spanId, 'success');

      const allSpans = tracer.getAllSpans();
      expect(allSpans).toHaveLength(2);
      expect(allSpans.find((s) => s.status === 'running')).toBeDefined();
      expect(allSpans.find((s) => s.status === 'success')).toBeDefined();
    });

    it('should return new array each time', () => {
      tracer.startSpan('span1');
      const first = tracer.getAllSpans();
      const second = tracer.getAllSpans();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  // ===========================================================================
  // getTraceId Tests
  // ===========================================================================

  describe('getTraceId', () => {
    it('should return undefined before any trace', () => {
      expect(tracer.getTraceId()).toBeUndefined();
    });

    it('should return trace ID after startTrace', () => {
      const span = tracer.startTrace('root');
      expect(tracer.getTraceId()).toBe(span?.context.traceId);
    });

    it('should return trace ID after startSpan', () => {
      const span = tracer.startSpan('auto-trace');
      expect(tracer.getTraceId()).toBe(span?.context.traceId);
    });

    it('should return same trace ID for all spans in trace', () => {
      const root = tracer.startTrace('root');
      tracer.startSpan('child1');
      tracer.startSpan('child2');

      expect(tracer.getTraceId()).toBe(root?.context.traceId);
    });

    it('should return undefined after clear', () => {
      tracer.startTrace('root');
      tracer.clear();

      expect(tracer.getTraceId()).toBeUndefined();
    });
  });

  // ===========================================================================
  // getCurrentContext Tests
  // ===========================================================================

  describe('getCurrentContext', () => {
    it('should return undefined when no trace active', () => {
      expect(tracer.getCurrentContext()).toBeUndefined();
    });

    it('should return undefined when disabled', () => {
      const disabled = new Tracer({ enabled: false });
      expect(disabled.getCurrentContext()).toBeUndefined();
    });

    it('should return context of latest running span', () => {
      const span1 = tracer.startSpan('span1');
      tracer.endSpan(span1!.context.spanId, 'success');

      vi.advanceTimersByTime(10);
      const span2 = tracer.startSpan('span2');

      const context = tracer.getCurrentContext();
      expect(context?.spanId).toBe(span2?.context.spanId);
    });

    it('should return undefined when all spans ended', () => {
      const span = tracer.startSpan('span');
      tracer.endSpan(span!.context.spanId, 'success');

      expect(tracer.getCurrentContext()).toBeUndefined();
    });

    it('should return most recent running span when multiple are running', () => {
      tracer.startSpan('span1');
      vi.advanceTimersByTime(10);
      tracer.startSpan('span2');
      vi.advanceTimersByTime(10);
      const span3 = tracer.startSpan('span3');

      const context = tracer.getCurrentContext();
      expect(context?.spanId).toBe(span3?.context.spanId);
    });
  });

  // ===========================================================================
  // getAggregatedMetrics Tests
  // ===========================================================================

  describe('getAggregatedMetrics', () => {
    it('should return zero metrics for empty trace', () => {
      const metrics = tracer.getAggregatedMetrics();

      expect(metrics.totalSpans).toBe(0);
      expect(metrics.successfulSpans).toBe(0);
      expect(metrics.errorSpans).toBe(0);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.totalCostUsd).toBe(0);
      expect(metrics.durationMs).toBe(0);
      expect(metrics.byModel).toEqual({});
      expect(metrics.byProvider).toEqual({});
    });

    it('should count total spans', () => {
      tracer.startSpan('span1');
      tracer.startSpan('span2');
      tracer.startSpan('span3');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(3);
    });

    it('should count successful spans', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');
      tracer.startSpan('span3');

      tracer.endSpan(s1!.context.spanId, 'success');
      tracer.endSpan(s2!.context.spanId, 'success');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.successfulSpans).toBe(2);
    });

    it('should count error spans', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');

      tracer.endSpan(s1!.context.spanId, 'error', 'Error 1');
      tracer.endSpan(s2!.context.spanId, 'error', 'Error 2');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.errorSpans).toBe(2);
    });

    it('should aggregate token counts', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');

      tracer.recordLLMMetrics(s1!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.recordLLMMetrics(s2!.context.spanId, {
        inputTokens: 2000,
        outputTokens: 1000,
        model: 'codex-5.3',
        provider: 'openai',
      });

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalInputTokens).toBe(3000);
      expect(metrics.totalOutputTokens).toBe(1500);
    });

    it('should aggregate cost', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');

      tracer.recordLLMMetrics(s1!.context.spanId, {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        model: 'claude-sonnet',
        provider: 'anthropic',
      });
      tracer.recordLLMMetrics(s2!.context.spanId, {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        model: 'codex-5.3',
        provider: 'openai',
      });

      const metrics = tracer.getAggregatedMetrics();
      // claude-sonnet: 1M * 3 + 0.5M * 15 = 10.5
      // codex-5.3: 1M * 2 + 0.5M * 8 = 6
      expect(metrics.totalCostUsd).toBeCloseTo(16.5, 2);
    });

    it('should calculate duration from earliest start to latest end', () => {
      const s1 = tracer.startSpan('span1');
      vi.advanceTimersByTime(100);
      const s2 = tracer.startSpan('span2');
      vi.advanceTimersByTime(200);

      tracer.endSpan(s1!.context.spanId, 'success');
      vi.advanceTimersByTime(50);
      tracer.endSpan(s2!.context.spanId, 'success');

      const metrics = tracer.getAggregatedMetrics();
      // Total duration: 100 + 200 + 50 = 350ms
      expect(metrics.durationMs).toBe(350);
    });

    it('should aggregate by model', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');
      const s3 = tracer.startSpan('span3');

      tracer.recordLLMMetrics(s1!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.recordLLMMetrics(s2!.context.spanId, {
        inputTokens: 2000,
        outputTokens: 1000,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.recordLLMMetrics(s3!.context.spanId, {
        inputTokens: 500,
        outputTokens: 250,
        model: 'codex-5.3',
        provider: 'openai',
      });

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.byModel['claude-sonnet-4']).toEqual({
        inputTokens: 3000,
        outputTokens: 1500,
        costUsd: expect.any(Number),
      });
      expect(metrics.byModel['codex-5.3']).toEqual({
        inputTokens: 500,
        outputTokens: 250,
        costUsd: expect.any(Number),
      });
    });

    it('should aggregate by provider', () => {
      const s1 = tracer.startSpan('span1');
      const s2 = tracer.startSpan('span2');

      tracer.recordLLMMetrics(s1!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.recordLLMMetrics(s2!.context.spanId, {
        inputTokens: 2000,
        outputTokens: 1000,
        model: 'codex-5.3',
        provider: 'openai',
      });

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.byProvider['anthropic']).toBeDefined();
      expect(metrics.byProvider['openai']).toBeDefined();

      const anthropicMetrics = metrics.byProvider['anthropic'];
      const openaiMetrics = metrics.byProvider['openai'];
      expect(anthropicMetrics?.inputTokens).toBe(1000);
      expect(openaiMetrics?.inputTokens).toBe(2000);
    });

    it('should handle spans without LLM metrics', () => {
      const s1 = tracer.startSpan('no-llm');
      tracer.endSpan(s1!.context.spanId, 'success');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(1);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalCostUsd).toBe(0);
    });

    it('should handle unknown model cost as zero in aggregation', () => {
      const s1 = tracer.startSpan('span1');
      tracer.recordLLMMetrics(s1!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'unknown-model',
        provider: 'unknown',
      });

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalInputTokens).toBe(1000);
      expect(metrics.totalOutputTokens).toBe(500);
      // Cost is undefined for unknown model, should be treated as 0
      expect(metrics.totalCostUsd).toBe(0);
    });
  });

  // ===========================================================================
  // clear Tests
  // ===========================================================================

  describe('clear', () => {
    it('should remove all spans', () => {
      tracer.startSpan('span1');
      tracer.startSpan('span2');
      expect(tracer.getAllSpans()).toHaveLength(2);

      tracer.clear();

      expect(tracer.getAllSpans()).toHaveLength(0);
    });

    it('should reset trace ID', () => {
      tracer.startTrace('root');
      expect(tracer.getTraceId()).toBeDefined();

      tracer.clear();

      expect(tracer.getTraceId()).toBeUndefined();
    });

    it('should allow starting new trace after clear', () => {
      const first = tracer.startTrace('first-trace');
      tracer.clear();
      const second = tracer.startTrace('second-trace');

      expect(second?.context.traceId).not.toBe(first?.context.traceId);
      expect(tracer.getAllSpans()).toHaveLength(1);
    });

    it('should reset aggregated metrics', () => {
      const span = tracer.startSpan('span');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.endSpan(span!.context.spanId, 'success');

      tracer.clear();

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(0);
      expect(metrics.totalInputTokens).toBe(0);
    });
  });

  // ===========================================================================
  // Max Spans and Pruning Tests
  // ===========================================================================

  describe('max spans and pruning', () => {
    it('should enforce maxSpans limit', () => {
      const t = new Tracer({ maxSpans: 10 });

      // Create and complete 15 spans
      for (let i = 0; i < 15; i++) {
        const span = t.startSpan('span-' + String(i));
        if (span) {
          t.endSpan(span.context.spanId, 'success');
        }
      }

      // Should have pruned to stay at or under limit
      expect(t.getAllSpans().length).toBeLessThanOrEqual(15);
    });

    it('should keep running spans during pruning', () => {
      const t = new Tracer({ maxSpans: 5 });

      // Create a running span first
      const running = t.startSpan('running-span');

      // Create and complete more spans to trigger pruning
      for (let i = 0; i < 10; i++) {
        const span = t.startSpan('completed-' + String(i));
        if (span) {
          t.endSpan(span.context.spanId, 'success');
        }
      }

      // Running span should still exist
      expect(t.getSpan(running!.context.spanId)).toBeDefined();
      expect(t.getSpan(running!.context.spanId)?.status).toBe('running');
    });

    it('should prune oldest completed spans first', () => {
      const t = new Tracer({ maxSpans: 5 });

      // Create spans with time progression
      const spans: TraceSpan[] = [];
      for (let i = 0; i < 4; i++) {
        const span = t.startSpan('span-' + String(i));
        if (span) {
          spans.push(span);
          t.endSpan(span.context.spanId, 'success');
        }
        vi.advanceTimersByTime(100);
      }

      // This should trigger pruning
      const newest = t.startSpan('newest');

      // Newest span should definitely exist
      expect(t.getSpan(newest!.context.spanId)).toBeDefined();
    });
  });

  // ===========================================================================
  // Span Lifecycle Integration Tests
  // ===========================================================================

  describe('span lifecycle integration', () => {
    it('should handle complete span lifecycle', () => {
      // Start trace
      const root = tracer.startTrace('orchestration', { task: 'analyze' });
      expect(root?.status).toBe('running');

      // Create child spans
      const child1 = tracer.startChildSpan(root!.context.spanId, 'fetch-data');
      const child2 = tracer.startChildSpan(root!.context.spanId, 'process-data');

      // Record metrics on child spans
      tracer.recordLLMMetrics(child1!.context.spanId, {
        inputTokens: 500,
        outputTokens: 200,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });

      // Add attributes
      tracer.addAttributes(child1!.context.spanId, { dataSource: 'api' });

      // End child spans
      vi.advanceTimersByTime(50);
      tracer.endSpan(child1!.context.spanId, 'success');
      vi.advanceTimersByTime(100);
      tracer.endSpan(child2!.context.spanId, 'success');

      // End root span
      vi.advanceTimersByTime(10);
      tracer.endSpan(root!.context.spanId, 'success');

      // Verify final state
      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(3);
      expect(metrics.successfulSpans).toBe(3);
      expect(metrics.errorSpans).toBe(0);
      expect(metrics.totalInputTokens).toBe(500);
      expect(metrics.durationMs).toBe(160);
    });

    it('should handle error propagation in span tree', () => {
      const root = tracer.startTrace('operation');
      const child = tracer.startChildSpan(root!.context.spanId, 'risky-operation');

      // Child fails
      tracer.endSpan(child!.context.spanId, 'error', 'Database connection failed');

      // Root also fails due to child
      tracer.endSpan(root!.context.spanId, 'error', 'Child operation failed');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.errorSpans).toBe(2);
      expect(tracer.getSpan(child!.context.spanId)?.errorMessage).toBe(
        'Database connection failed'
      );
    });

    it('should maintain trace context across async-like operations', () => {
      // Simulate async workflow with time progression
      const trace = tracer.startTrace('async-workflow');

      vi.advanceTimersByTime(10);
      const step1 = tracer.startChildSpan(trace!.context.spanId, 'step1');

      vi.advanceTimersByTime(50);
      tracer.endSpan(step1!.context.spanId, 'success');

      vi.advanceTimersByTime(10);
      const step2 = tracer.startChildSpan(trace!.context.spanId, 'step2');

      vi.advanceTimersByTime(100);
      tracer.endSpan(step2!.context.spanId, 'success');

      tracer.endSpan(trace!.context.spanId, 'success');

      // All spans share the same trace ID
      const allSpans = tracer.getAllSpans();
      const traceIds = new Set(allSpans.map((s) => s.context.traceId));
      expect(traceIds.size).toBe(1);
    });
  });

  // ===========================================================================
  // Cost Calculation Tests
  // ===========================================================================

  describe('cost calculation', () => {
    it('should calculate correct cost for claude-opus', () => {
      const span = tracer.startSpan('opus');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: 'claude-opus',
        provider: 'anthropic',
      });

      // claude-opus: $5/1M input, $25/1M output
      // 1M * 5 + 1M * 25 = 30
      expect(tracer.getSpan(span!.context.spanId)?.llmMetrics?.costUsd).toBeCloseTo(30.0, 2);
    });

    it('should calculate correct cost for codex-5.1-mini', () => {
      const span = tracer.startSpan('mini');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 10_000_000,
        outputTokens: 5_000_000,
        model: 'codex-5.1-mini',
        provider: 'openai',
      });

      // codex-5.1-mini: $0.5/1M input, $2/1M output
      // 10M * 0.5 + 5M * 2 = 5 + 10 = 15
      expect(tracer.getSpan(span!.context.spanId)?.llmMetrics?.costUsd).toBeCloseTo(15.0, 2);
    });

    it('should calculate correct cost for gemini-flash', () => {
      const span = tracer.startSpan('flash');
      tracer.recordLLMMetrics(span!.context.spanId, {
        inputTokens: 10_000_000,
        outputTokens: 5_000_000,
        model: 'gemini-flash',
        provider: 'google',
      });

      // gemini-flash: $0.15/1M input, $0.6/1M output
      // 10M * 0.15 + 5M * 0.6 = 1.5 + 3.0 = 4.5
      expect(tracer.getSpan(span!.context.spanId)?.llmMetrics?.costUsd).toBeCloseTo(4.5, 2);
    });
  });
});
