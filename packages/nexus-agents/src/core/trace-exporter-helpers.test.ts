/**
 * Tests for trace-exporter-helpers utilities
 *
 * @module core/trace-exporter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TraceSpan, AggregatedMetrics } from './trace.js';
import {
  formatDuration,
  formatDurationCompact,
  formatCost,
  formatTokens,
  formatPercentage,
  getStatusIndicator,
  appendTokenInfo,
  appendCostInfo,
  renderErrorLine,
  buildSpanTree,
  renderSpanNode,
  renderHeader,
  buildSummaryParts,
  type ResolvedVisualizationOptions,
  type SpanNode,
} from './trace-exporter-helpers.js';

describe('trace-exporter-helpers', () => {
  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(150)).toBe('150ms');
      expect(formatDuration(999)).toBe('999ms');
      expect(formatDuration(0)).toBe('0ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(2500)).toBe('2.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(225000)).toBe('3m 45s');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(8100000)).toBe('2h 15m');
    });
  });

  describe('formatDurationCompact', () => {
    it('formats milliseconds', () => {
      expect(formatDurationCompact(150)).toBe('150ms');
    });

    it('formats seconds', () => {
      expect(formatDurationCompact(2500)).toBe('2.5s');
    });

    it('formats minutes', () => {
      expect(formatDurationCompact(90000)).toBe('1.5min');
      expect(formatDurationCompact(210000)).toBe('3.5min');
    });
  });

  describe('formatCost', () => {
    it('formats very small costs with 6 decimals', () => {
      expect(formatCost(0.000123)).toBe('$0.000123');
      expect(formatCost(0.009999)).toBe('$0.009999');
    });

    it('formats small costs with 4 decimals', () => {
      expect(formatCost(0.01)).toBe('$0.0100');
      expect(formatCost(0.1234)).toBe('$0.1234');
      expect(formatCost(0.9999)).toBe('$0.9999');
    });

    it('formats normal costs with 2 decimals', () => {
      expect(formatCost(1.0)).toBe('$1.00');
      expect(formatCost(5.5)).toBe('$5.50');
      expect(formatCost(123.45)).toBe('$123.45');
    });
  });

  describe('formatTokens', () => {
    it('formats token counts', () => {
      expect(formatTokens(100, 50)).toBe('100 in / 50 out');
    });

    it('formats large numbers with locale', () => {
      expect(formatTokens(1000000, 500000)).toBe('1,000,000 in / 500,000 out');
    });

    it('handles zero tokens', () => {
      expect(formatTokens(0, 0)).toBe('0 in / 0 out');
    });
  });

  describe('formatPercentage', () => {
    it('formats with default 0 decimals', () => {
      expect(formatPercentage(0.85)).toBe('85%');
      expect(formatPercentage(1.0)).toBe('100%');
      expect(formatPercentage(0)).toBe('0%');
    });

    it('formats with custom decimals', () => {
      expect(formatPercentage(0.8567, 1)).toBe('85.7%');
      expect(formatPercentage(0.8567, 2)).toBe('85.67%');
    });
  });

  describe('getStatusIndicator', () => {
    describe('with colors', () => {
      it('returns green checkmark for success', () => {
        const indicator = getStatusIndicator('success', true);
        expect(indicator).toContain('✓');
      });

      it('returns red X for error', () => {
        const indicator = getStatusIndicator('error', true);
        expect(indicator).toContain('✗');
      });

      it('returns yellow circle for running', () => {
        const indicator = getStatusIndicator('running', true);
        expect(indicator).toContain('●');
      });

      it('returns ? for unknown status', () => {
        expect(getStatusIndicator('unknown', true)).toBe('?');
      });
    });

    describe('without colors', () => {
      it('returns [OK] for success', () => {
        expect(getStatusIndicator('success', false)).toBe('[OK]');
      });

      it('returns [ERR] for error', () => {
        expect(getStatusIndicator('error', false)).toBe('[ERR]');
      });

      it('returns [RUN] for running', () => {
        expect(getStatusIndicator('running', false)).toBe('[RUN]');
      });

      it('returns [?] for unknown status', () => {
        expect(getStatusIndicator('unknown', false)).toBe('[?]');
      });
    });
  });

  describe('appendTokenInfo', () => {
    const createSpan = (llmMetrics?: TraceSpan['llmMetrics']): TraceSpan => ({
      context: { traceId: 't1', spanId: 's1' },
      name: 'test',
      startTime: 0,
      status: 'success',
      attributes: {},
      llmMetrics,
    });

    const opts: ResolvedVisualizationOptions = {
      showCost: true,
      showTokens: true,
      indentSize: 2,
      colors: false,
    };

    it('appends token info when enabled', () => {
      const span = createSpan({
        model: 'claude',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
      });
      const result = appendTokenInfo('Main line', span, opts);
      expect(result).toBe('Main line [100 in / 50 out]');
    });

    it('returns unchanged if showTokens is false', () => {
      const span = createSpan({
        model: 'claude',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
      });
      const result = appendTokenInfo('Main line', span, { ...opts, showTokens: false });
      expect(result).toBe('Main line');
    });

    it('returns unchanged if no llmMetrics', () => {
      const span = createSpan(undefined);
      const result = appendTokenInfo('Main line', span, opts);
      expect(result).toBe('Main line');
    });
  });

  describe('appendCostInfo', () => {
    const createSpan = (llmMetrics?: TraceSpan['llmMetrics']): TraceSpan => ({
      context: { traceId: 't1', spanId: 's1' },
      name: 'test',
      startTime: 0,
      status: 'success',
      attributes: {},
      llmMetrics,
    });

    const opts: ResolvedVisualizationOptions = {
      showCost: true,
      showTokens: true,
      indentSize: 2,
      colors: false,
    };

    it('appends cost info when enabled', () => {
      const span = createSpan({
        model: 'claude',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.05,
      });
      const result = appendCostInfo('Main line', span, opts);
      expect(result).toBe('Main line $0.0500');
    });

    it('returns unchanged if showCost is false', () => {
      const span = createSpan({
        model: 'claude',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.05,
      });
      const result = appendCostInfo('Main line', span, { ...opts, showCost: false });
      expect(result).toBe('Main line');
    });

    it('returns unchanged if no costUsd', () => {
      const span = createSpan({
        model: 'claude',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 50,
      });
      const result = appendCostInfo('Main line', span, opts);
      expect(result).toBe('Main line');
    });
  });

  describe('renderErrorLine', () => {
    const createSpan = (errorMessage?: string): TraceSpan => ({
      context: { traceId: 't1', spanId: 's1' },
      name: 'test',
      startTime: 0,
      status: 'error',
      attributes: {},
      errorMessage,
    });

    const opts: ResolvedVisualizationOptions = {
      showCost: true,
      showTokens: true,
      indentSize: 2,
      colors: false,
    };

    it('renders error line with prefix', () => {
      const span = createSpan('Something failed');
      const result = renderErrorLine(span, '    ', opts);
      expect(result).toBe('    Error: Something failed');
    });

    it('returns null if no errorMessage', () => {
      const span = createSpan(undefined);
      const result = renderErrorLine(span, '    ', opts);
      expect(result).toBeNull();
    });
  });

  describe('buildSpanTree', () => {
    const createSpan = (
      spanId: string,
      parentSpanId?: string,
      startTime: number = 0
    ): TraceSpan => ({
      context: { traceId: 't1', spanId, parentSpanId },
      name: `span-${spanId}`,
      startTime,
      status: 'success',
      attributes: {},
    });

    it('builds tree from flat list', () => {
      const spans = [
        createSpan('root', undefined, 0),
        createSpan('child1', 'root', 100),
        createSpan('child2', 'root', 200),
      ];
      const tree = buildSpanTree(spans);
      expect(tree).toHaveLength(1);
      expect(tree[0]?.children).toHaveLength(2);
    });

    it('handles multiple roots', () => {
      const spans = [createSpan('root1', undefined, 0), createSpan('root2', undefined, 100)];
      const tree = buildSpanTree(spans);
      expect(tree).toHaveLength(2);
    });

    it('handles orphan spans (parent not in list)', () => {
      const spans = [createSpan('orphan', 'missing-parent', 0)];
      const tree = buildSpanTree(spans);
      expect(tree).toHaveLength(1);
      expect(tree[0]?.span.context.spanId).toBe('orphan');
    });

    it('sorts children by start time', () => {
      const spans = [
        createSpan('root', undefined, 0),
        createSpan('child2', 'root', 200),
        createSpan('child1', 'root', 100),
        createSpan('child3', 'root', 150),
      ];
      const tree = buildSpanTree(spans);
      const children = tree[0]?.children;
      expect(children?.[0]?.span.context.spanId).toBe('child1');
      expect(children?.[1]?.span.context.spanId).toBe('child3');
      expect(children?.[2]?.span.context.spanId).toBe('child2');
    });

    it('handles empty array', () => {
      const tree = buildSpanTree([]);
      expect(tree).toEqual([]);
    });

    it('builds nested tree', () => {
      const spans = [
        createSpan('root', undefined, 0),
        createSpan('child', 'root', 100),
        createSpan('grandchild', 'child', 200),
      ];
      const tree = buildSpanTree(spans);
      expect(tree).toHaveLength(1);
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children[0]?.children).toHaveLength(1);
    });
  });

  describe('renderSpanNode', () => {
    const opts: ResolvedVisualizationOptions = {
      showCost: false,
      showTokens: false,
      indentSize: 2,
      colors: false,
    };

    const createNode = (span: Partial<TraceSpan> = {}, children: SpanNode[] = []): SpanNode => ({
      span: {
        context: { traceId: 't1', spanId: 's1' },
        name: 'test-span',
        startTime: 1000,
        endTime: 2000,
        status: 'success',
        attributes: {},
        ...span,
      },
      children,
    });

    it('renders span with duration', () => {
      const node = createNode();
      const lines = renderSpanNode(node, '', true, opts);
      expect(lines[0]).toContain('[OK]');
      expect(lines[0]).toContain('test-span');
      expect(lines[0]).toContain('1.0s');
    });

    it('renders running span without duration', () => {
      const node = createNode({ status: 'running', endTime: undefined });
      const lines = renderSpanNode(node, '', true, opts);
      expect(lines[0]).toContain('[RUN]');
      expect(lines[0]).toContain('running');
    });

    it('renders error message', () => {
      const node = createNode({ status: 'error', errorMessage: 'Failed!' });
      const lines = renderSpanNode(node, '', true, opts);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[1]).toContain('Error: Failed!');
    });

    it('renders children recursively', () => {
      const child = createNode({ context: { traceId: 't1', spanId: 'c1' }, name: 'child-span' });
      const parent = createNode({}, [child]);
      const lines = renderSpanNode(parent, '', true, opts);
      expect(lines.some((l) => l.includes('child-span'))).toBe(true);
    });
  });

  describe('renderHeader', () => {
    it('renders header without colors', () => {
      const header = renderHeader('trace-123', false);
      expect(header).toBe('Trace: trace-123');
    });

    it('renders header with colors', () => {
      const header = renderHeader('trace-123', true);
      expect(header).toContain('Trace: trace-123');
      expect(header).toContain('🔍');
    });
  });

  describe('buildSummaryParts', () => {
    const opts: ResolvedVisualizationOptions = {
      showCost: true,
      showTokens: true,
      indentSize: 2,
      colors: false,
    };

    const createMetrics = (overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics => ({
      totalSpans: 5,
      successfulSpans: 4,
      errorSpans: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      durationMs: 5000,
      byModel: {},
      byProvider: {},
      ...overrides,
    });

    it('includes total duration', () => {
      const parts = buildSummaryParts(createMetrics({ durationMs: 2500 }), opts);
      expect(parts).toContain('Total: 2.5s');
    });

    it('includes tokens when present and enabled', () => {
      const parts = buildSummaryParts(
        createMetrics({ totalInputTokens: 1000, totalOutputTokens: 500 }),
        opts
      );
      expect(parts.some((p) => p.includes('Tokens:'))).toBe(true);
      expect(parts.some((p) => p.includes('1,000 in'))).toBe(true);
    });

    it('excludes tokens when disabled', () => {
      const parts = buildSummaryParts(
        createMetrics({ totalInputTokens: 1000, totalOutputTokens: 500 }),
        { ...opts, showTokens: false }
      );
      expect(parts.some((p) => p.includes('Tokens:'))).toBe(false);
    });

    it('includes cost when present and enabled', () => {
      const parts = buildSummaryParts(createMetrics({ totalCostUsd: 0.05 }), opts);
      expect(parts.some((p) => p.includes('Cost:'))).toBe(true);
    });

    it('excludes cost when disabled', () => {
      const parts = buildSummaryParts(createMetrics({ totalCostUsd: 0.05 }), {
        ...opts,
        showCost: false,
      });
      expect(parts.some((p) => p.includes('Cost:'))).toBe(false);
    });

    it('includes errors when present', () => {
      const parts = buildSummaryParts(createMetrics({ errorSpans: 2 }), opts);
      expect(parts.some((p) => p.includes('Errors: 2'))).toBe(true);
    });

    it('excludes errors when zero', () => {
      const parts = buildSummaryParts(createMetrics({ errorSpans: 0 }), opts);
      expect(parts.some((p) => p.includes('Errors:'))).toBe(false);
    });
  });
});
