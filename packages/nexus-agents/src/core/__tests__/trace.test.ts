import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Tracer,
  getTracer,
  setTracer,
  withSpan,
  recordLLMMetrics,
  getTraceContext,
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '../trace.js';

describe('trace', () => {
  describe('generateTraceId', () => {
    it('generates a valid UUID', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSpanId', () => {
    it('generates a valid UUID', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for known Claude model', () => {
      const cost = calculateCost('claude-sonnet-4', 1000, 500);
      expect(cost).toBeDefined();
      // claude-sonnet-4: $3/1M input, $15/1M output
      // Expected: (1000/1M * 3) + (500/1M * 15) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('calculates cost for known OpenAI model', () => {
      const cost = calculateCost('gpt-4o', 10000, 5000);
      expect(cost).toBeDefined();
      // gpt-4o: $2.5/1M input, $10/1M output
      // Expected: (10000/1M * 2.5) + (5000/1M * 10) = 0.025 + 0.05 = 0.075
      expect(cost).toBeCloseTo(0.075, 6);
    });

    it('handles partial model name matches', () => {
      const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeDefined();
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('returns undefined for unknown model', () => {
      const cost = calculateCost('unknown-model', 1000, 500);
      expect(cost).toBeUndefined();
    });

    it('handles zero tokens', () => {
      const cost = calculateCost('claude-sonnet-4', 0, 0);
      expect(cost).toBe(0);
    });

    it('handles large token counts', () => {
      const cost = calculateCost('gpt-4o', 1_000_000, 500_000);
      expect(cost).toBeDefined();
      // Expected: (1M/1M * 2.5) + (500K/1M * 10) = 2.5 + 5 = 7.5
      expect(cost).toBeCloseTo(7.5, 2);
    });
  });

  describe('Tracer', () => {
    let tracer: Tracer;

    beforeEach(() => {
      tracer = new Tracer({ enabled: true });
    });

    describe('constructor', () => {
      it('creates an enabled tracer by default', () => {
        const t = new Tracer();
        expect(t.isEnabled()).toBe(true);
      });

      it('respects enabled: false configuration', () => {
        const t = new Tracer({ enabled: false });
        expect(t.isEnabled()).toBe(false);
      });
    });

    describe('startTrace', () => {
      it('creates a root span with trace ID', () => {
        const span = tracer.startTrace('test-trace');
        expect(span).toBeDefined();
        expect(span?.name).toBe('test-trace');
        expect(span?.context.traceId).toBeDefined();
        expect(span?.context.spanId).toBeDefined();
        expect(span?.context.parentSpanId).toBeUndefined();
        expect(span?.status).toBe('running');
      });

      it('returns undefined when disabled', () => {
        const t = new Tracer({ enabled: false });
        const span = t.startTrace('test');
        expect(span).toBeUndefined();
      });

      it('sets initial attributes', () => {
        const span = tracer.startTrace('test', { key: 'value' });
        expect(span?.attributes).toEqual({ key: 'value' });
      });
    });

    describe('startSpan', () => {
      it('creates a span in the current trace', () => {
        tracer.startTrace('root');
        const span = tracer.startSpan('child');
        expect(span).toBeDefined();
        expect(span?.name).toBe('child');
        expect(span?.context.traceId).toBe(tracer.getTraceId());
      });

      it('creates a trace if none exists', () => {
        const span = tracer.startSpan('first');
        expect(span).toBeDefined();
        expect(tracer.getTraceId()).toBeDefined();
      });

      it('supports parent span ID', () => {
        const parent = tracer.startTrace('parent');
        const child = tracer.startSpan('child', {}, parent?.context.spanId);
        expect(child?.context.parentSpanId).toBe(parent?.context.spanId);
      });
    });

    describe('startChildSpan', () => {
      it('creates a child span under parent', () => {
        const parent = tracer.startTrace('parent');
        const child = tracer.startChildSpan(parent!.context.spanId, 'child');
        expect(child).toBeDefined();
        expect(child?.context.parentSpanId).toBe(parent?.context.spanId);
        expect(child?.context.traceId).toBe(parent?.context.traceId);
      });

      it('returns undefined for non-existent parent', () => {
        const child = tracer.startChildSpan('non-existent', 'child');
        expect(child).toBeUndefined();
      });
    });

    describe('endSpan', () => {
      it('ends a span with success status', () => {
        const span = tracer.startTrace('test');
        tracer.endSpan(span!.context.spanId, 'success');
        const endedSpan = tracer.getSpan(span!.context.spanId);
        expect(endedSpan?.status).toBe('success');
        expect(endedSpan?.endTime).toBeDefined();
      });

      it('ends a span with error status and message', () => {
        const span = tracer.startTrace('test');
        tracer.endSpan(span!.context.spanId, 'error', 'Something failed');
        const endedSpan = tracer.getSpan(span!.context.spanId);
        expect(endedSpan?.status).toBe('error');
        expect(endedSpan?.errorMessage).toBe('Something failed');
      });

      it('handles non-existent span gracefully', () => {
        // Should not throw
        expect(() => {
          tracer.endSpan('non-existent', 'success');
        }).not.toThrow();
      });
    });

    describe('recordLLMMetrics', () => {
      it('records metrics with calculated cost', () => {
        const span = tracer.startTrace('llm-call');
        tracer.recordLLMMetrics(span!.context.spanId, {
          inputTokens: 1000,
          outputTokens: 500,
          model: 'claude-sonnet-4',
          provider: 'anthropic',
        });

        const updatedSpan = tracer.getSpan(span!.context.spanId);
        expect(updatedSpan).toBeDefined();
        const llmMetrics = updatedSpan!.llmMetrics;
        expect(llmMetrics).toBeDefined();
        expect(llmMetrics!.inputTokens).toBe(1000);
        expect(llmMetrics!.outputTokens).toBe(500);
        expect(llmMetrics!.model).toBe('claude-sonnet-4');
        expect(llmMetrics!.provider).toBe('anthropic');
        expect(llmMetrics!.costUsd).toBeCloseTo(0.0105, 6);
      });

      it('handles unknown model without cost', () => {
        const span = tracer.startTrace('llm-call');
        tracer.recordLLMMetrics(span!.context.spanId, {
          inputTokens: 1000,
          outputTokens: 500,
          model: 'custom-model',
          provider: 'custom',
        });

        const updatedSpan = tracer.getSpan(span!.context.spanId);
        expect(updatedSpan?.llmMetrics?.costUsd).toBeUndefined();
      });

      it('handles non-existent span gracefully', () => {
        expect(() => {
          tracer.recordLLMMetrics('non-existent', {
            inputTokens: 1000,
            outputTokens: 500,
            model: 'claude-sonnet-4',
            provider: 'anthropic',
          });
        }).not.toThrow();
      });
    });

    describe('addAttributes', () => {
      it('adds attributes to existing span', () => {
        const span = tracer.startTrace('test', { initial: true });
        tracer.addAttributes(span!.context.spanId, { added: 'value' });
        const updatedSpan = tracer.getSpan(span!.context.spanId);
        expect(updatedSpan?.attributes).toEqual({ initial: true, added: 'value' });
      });

      it('overwrites existing attributes', () => {
        const span = tracer.startTrace('test', { key: 'old' });
        tracer.addAttributes(span!.context.spanId, { key: 'new' });
        const updatedSpan = tracer.getSpan(span!.context.spanId);
        expect(updatedSpan?.attributes).toEqual({ key: 'new' });
      });
    });

    describe('getSpan', () => {
      it('returns span by ID', () => {
        const span = tracer.startTrace('test');
        const retrieved = tracer.getSpan(span!.context.spanId);
        expect(retrieved).toBe(span);
      });

      it('returns undefined for non-existent ID', () => {
        const retrieved = tracer.getSpan('non-existent');
        expect(retrieved).toBeUndefined();
      });
    });

    describe('getAllSpans', () => {
      it('returns all spans', () => {
        tracer.startTrace('one');
        tracer.startSpan('two');
        tracer.startSpan('three');
        const spans = tracer.getAllSpans();
        expect(spans).toHaveLength(3);
      });

      it('returns empty array when no spans', () => {
        expect(tracer.getAllSpans()).toEqual([]);
      });
    });

    describe('getCurrentContext', () => {
      it('returns context of most recent running span', () => {
        const first = tracer.startTrace('first');
        tracer.endSpan(first!.context.spanId, 'success');
        const second = tracer.startSpan('second');

        const context = tracer.getCurrentContext();
        expect(context?.spanId).toBe(second?.context.spanId);
      });

      it('returns undefined when no running spans', () => {
        const span = tracer.startTrace('test');
        tracer.endSpan(span!.context.spanId, 'success');
        expect(tracer.getCurrentContext()).toBeUndefined();
      });

      it('returns undefined when disabled', () => {
        const t = new Tracer({ enabled: false });
        expect(t.getCurrentContext()).toBeUndefined();
      });
    });

    describe('getAggregatedMetrics', () => {
      it('aggregates metrics across spans', () => {
        const span1 = tracer.startTrace('span1');
        tracer.recordLLMMetrics(span1!.context.spanId, {
          inputTokens: 1000,
          outputTokens: 500,
          model: 'claude-sonnet-4',
          provider: 'anthropic',
        });
        tracer.endSpan(span1!.context.spanId, 'success');

        const span2 = tracer.startSpan('span2');
        tracer.recordLLMMetrics(span2!.context.spanId, {
          inputTokens: 2000,
          outputTokens: 1000,
          model: 'gpt-4o',
          provider: 'openai',
        });
        tracer.endSpan(span2!.context.spanId, 'success');

        const metrics = tracer.getAggregatedMetrics();
        expect(metrics.totalSpans).toBe(2);
        expect(metrics.successfulSpans).toBe(2);
        expect(metrics.errorSpans).toBe(0);
        expect(metrics.totalInputTokens).toBe(3000);
        expect(metrics.totalOutputTokens).toBe(1500);
        expect(metrics.totalCostUsd).toBeGreaterThan(0);

        expect(metrics.byModel['claude-sonnet-4']).toBeDefined();
        expect(metrics.byModel['gpt-4o']).toBeDefined();
        expect(metrics.byProvider['anthropic']).toBeDefined();
        expect(metrics.byProvider['openai']).toBeDefined();
      });

      it('counts error spans correctly', () => {
        const span1 = tracer.startTrace('success');
        tracer.endSpan(span1!.context.spanId, 'success');

        const span2 = tracer.startSpan('error');
        tracer.endSpan(span2!.context.spanId, 'error', 'Failed');

        const metrics = tracer.getAggregatedMetrics();
        expect(metrics.successfulSpans).toBe(1);
        expect(metrics.errorSpans).toBe(1);
      });

      it('calculates duration correctly', () => {
        const span = tracer.startTrace('test');
        tracer.endSpan(span!.context.spanId, 'success');

        const metrics = tracer.getAggregatedMetrics();
        expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('returns zero metrics for empty trace', () => {
        const metrics = tracer.getAggregatedMetrics();
        expect(metrics.totalSpans).toBe(0);
        expect(metrics.totalInputTokens).toBe(0);
        expect(metrics.totalCostUsd).toBe(0);
      });
    });

    describe('clear', () => {
      it('removes all spans', () => {
        tracer.startTrace('test');
        tracer.startSpan('child');
        tracer.clear();
        expect(tracer.getAllSpans()).toEqual([]);
      });

      it('resets trace ID', () => {
        tracer.startTrace('test');
        expect(tracer.getTraceId()).toBeDefined();
        tracer.clear();
        expect(tracer.getTraceId()).toBeUndefined();
      });
    });

    describe('maxSpans pruning', () => {
      it('prunes old spans when limit exceeded', () => {
        const t = new Tracer({ maxSpans: 10 });

        // Create 15 spans
        for (let i = 0; i < 15; i++) {
          const span = t.startSpan(`span-${String(i)}`);
          t.endSpan(span!.context.spanId, 'success');
        }

        // Should have pruned some spans
        expect(t.getAllSpans().length).toBeLessThan(15);
      });
    });

    describe('disabled tracer', () => {
      let disabledTracer: Tracer;

      beforeEach(() => {
        disabledTracer = new Tracer({ enabled: false });
      });

      it('startTrace returns undefined', () => {
        expect(disabledTracer.startTrace('test')).toBeUndefined();
      });

      it('startSpan returns undefined', () => {
        expect(disabledTracer.startSpan('test')).toBeUndefined();
      });

      it('startChildSpan returns undefined', () => {
        expect(disabledTracer.startChildSpan('parent', 'child')).toBeUndefined();
      });

      it('other operations are no-ops', () => {
        expect(() => {
          disabledTracer.endSpan('id', 'success');
        }).not.toThrow();
        expect(() => {
          disabledTracer.recordLLMMetrics('id', {
            inputTokens: 100,
            outputTokens: 50,
            model: 'test',
            provider: 'test',
          });
        }).not.toThrow();
        expect(() => {
          disabledTracer.addAttributes('id', {});
        }).not.toThrow();
      });
    });
  });

  describe('global tracer helpers', () => {
    let originalTracer: Tracer | undefined;

    beforeEach(() => {
      // Reset global tracer before each test
      const freshTracer = new Tracer({ enabled: true });
      setTracer(freshTracer);
      originalTracer = freshTracer;
    });

    afterEach(() => {
      // Clean up
      if (originalTracer) {
        originalTracer.clear();
      }
    });

    describe('getTracer', () => {
      it('returns the global tracer', () => {
        const tracer = getTracer();
        expect(tracer).toBeDefined();
        expect(tracer.isEnabled()).toBe(true);
      });

      it('creates tracer with config if none exists', () => {
        // This test relies on internal state, so we verify behavior
        const tracer = getTracer();
        expect(tracer).toBeDefined();
      });
    });

    describe('setTracer', () => {
      it('sets the global tracer', () => {
        const customTracer = new Tracer({ enabled: false });
        setTracer(customTracer);
        expect(getTracer()).toBe(customTracer);
      });
    });

    describe('withSpan', () => {
      it('wraps function in a span', async () => {
        const result = await withSpan('test-operation', () => {
          return Promise.resolve(42);
        });
        expect(result).toBe(42);

        const spans = getTracer().getAllSpans();
        expect(spans.some((s) => s.name === 'test-operation')).toBe(true);
      });

      it('marks span as success on completion', async () => {
        await withSpan('success-op', () => Promise.resolve('done'));

        const spans = getTracer().getAllSpans();
        const span = spans.find((s) => s.name === 'success-op');
        expect(span?.status).toBe('success');
      });

      it('marks span as error on exception', async () => {
        const error = new Error('Test error');
        await expect(
          withSpan('error-op', () => {
            return Promise.reject(error);
          })
        ).rejects.toThrow('Test error');

        const spans = getTracer().getAllSpans();
        const span = spans.find((s) => s.name === 'error-op');
        expect(span?.status).toBe('error');
        expect(span?.errorMessage).toBe('Test error');
      });

      it('passes attributes to span', async () => {
        await withSpan('with-attrs', () => Promise.resolve('done'), { key: 'value' });

        const spans = getTracer().getAllSpans();
        const span = spans.find((s) => s.name === 'with-attrs');
        expect(span?.attributes).toEqual({ key: 'value' });
      });

      it('works when tracing is disabled', async () => {
        setTracer(new Tracer({ enabled: false }));
        const result = await withSpan('disabled-op', () => Promise.resolve(42));
        expect(result).toBe(42);
      });
    });

    describe('recordLLMMetrics', () => {
      it('records metrics on global tracer', () => {
        const span = getTracer().startTrace('llm-test');
        recordLLMMetrics(span!.context.spanId, {
          inputTokens: 100,
          outputTokens: 50,
          model: 'claude-sonnet-4',
          provider: 'anthropic',
        });

        const updatedSpan = getTracer().getSpan(span!.context.spanId);
        expect(updatedSpan?.llmMetrics?.inputTokens).toBe(100);
      });
    });

    describe('getTraceContext', () => {
      it('returns current trace context', () => {
        const span = getTracer().startTrace('context-test');
        const context = getTraceContext();
        expect(context?.spanId).toBe(span?.context.spanId);
      });

      it('returns undefined when no active trace', () => {
        getTracer().clear();
        expect(getTraceContext()).toBeUndefined();
      });
    });
  });

  describe('integration scenarios', () => {
    it('supports nested spans with LLM calls', () => {
      const tracer = new Tracer({ enabled: true });

      // Simulate an orchestration workflow
      const rootSpan = tracer.startTrace('orchestrate', { task: 'review code' });

      // Child span for analysis
      const analysisSpan = tracer.startChildSpan(rootSpan!.context.spanId, 'analyze-code');
      tracer.recordLLMMetrics(analysisSpan!.context.spanId, {
        inputTokens: 5000,
        outputTokens: 1000,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.endSpan(analysisSpan!.context.spanId, 'success');

      // Child span for expert review
      const reviewSpan = tracer.startChildSpan(rootSpan!.context.spanId, 'expert-review');
      tracer.recordLLMMetrics(reviewSpan!.context.spanId, {
        inputTokens: 8000,
        outputTokens: 2000,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.endSpan(reviewSpan!.context.spanId, 'success');

      tracer.endSpan(rootSpan!.context.spanId, 'success');

      const metrics = tracer.getAggregatedMetrics();
      expect(metrics.totalSpans).toBe(3);
      expect(metrics.successfulSpans).toBe(3);
      expect(metrics.totalInputTokens).toBe(13000);
      expect(metrics.totalOutputTokens).toBe(3000);
      const anthropicMetrics = metrics.byProvider['anthropic'];
      expect(anthropicMetrics).toBeDefined();
      expect(anthropicMetrics?.inputTokens).toBe(13000);
    });

    it('tracks multi-provider usage', () => {
      const tracer = new Tracer({ enabled: true });

      const span1 = tracer.startTrace('multi-provider');
      tracer.recordLLMMetrics(span1!.context.spanId, {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });
      tracer.endSpan(span1!.context.spanId, 'success');

      const span2 = tracer.startSpan('openai-call');
      tracer.recordLLMMetrics(span2!.context.spanId, {
        inputTokens: 2000,
        outputTokens: 1000,
        model: 'gpt-4o',
        provider: 'openai',
      });
      tracer.endSpan(span2!.context.spanId, 'success');

      const metrics = tracer.getAggregatedMetrics();
      expect(Object.keys(metrics.byProvider)).toHaveLength(2);
      const anthropicMetrics = metrics.byProvider['anthropic'];
      const openaiMetrics = metrics.byProvider['openai'];
      expect(anthropicMetrics?.inputTokens).toBe(1000);
      expect(openaiMetrics?.inputTokens).toBe(2000);
    });
  });
});
