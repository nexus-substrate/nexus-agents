/**
 * Tests for trace-exporter.ts
 *
 * Covers exportTraceToString, visualizeTrace, and generateTraceFilename.
 * exportTraceToFile and printTrace are tested indirectly through
 * the shared logic in exportTraceToString and visualizeTrace.
 */

import { describe, it, expect, vi } from 'vitest';
import { exportTraceToString, visualizeTrace, generateTraceFilename } from './trace-exporter.js';
import type { Tracer } from './trace.js';
import type { TraceSpan, AggregatedMetrics } from './trace-types.js';

// ============================================================================
// Mock Tracer
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockTracer(
  overrides: {
    traceId?: string | null;
    spans?: TraceSpan[];
    metrics?: Partial<AggregatedMetrics>;
  } = {}
) {
  const defaultMetrics: AggregatedMetrics = {
    totalSpans: 0,
    successfulSpans: 0,
    errorSpans: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    durationMs: 0,
    byModel: {},
    byProvider: {},
  };

  return {
    getTraceId: vi
      .fn()
      .mockReturnValue('traceId' in overrides ? overrides.traceId : 'trace-abc-123'),
    getAllSpans: vi.fn().mockReturnValue(overrides.spans ?? []),
    getAggregatedMetrics: vi.fn().mockReturnValue({
      ...defaultMetrics,
      ...overrides.metrics,
    }),
  } as unknown as Tracer;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSpan(overrides: Partial<TraceSpan> = {}) {
  return {
    context: { traceId: 'trace-abc', spanId: 'span-1' },
    name: 'test-span',
    startTime: 1000,
    endTime: 2000,
    status: 'success' as const,
    attributes: {},
    ...overrides,
  } as TraceSpan;
}

// ============================================================================
// exportTraceToString
// ============================================================================

describe('exportTraceToString', () => {
  it('exports as JSON-pretty by default', () => {
    const tracer = makeMockTracer();
    const result = exportTraceToString(tracer);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['traceId']).toBe('trace-abc-123');
    expect(parsed['exportedAt']).toBeDefined();
    expect(result).toContain('\n'); // pretty-printed
  });

  it('exports as compact JSON', () => {
    const tracer = makeMockTracer();
    const result = exportTraceToString(tracer, 'json');
    expect(result).not.toContain('\n'); // compact, single line
  });

  it('includes spans in export', () => {
    const span = makeSpan({ name: 'my-operation' });
    const tracer = makeMockTracer({ spans: [span] });
    const result = exportTraceToString(tracer);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['spans']).toHaveLength(1);
  });

  it('includes metrics in export', () => {
    const tracer = makeMockTracer({
      metrics: { totalInputTokens: 1000, totalOutputTokens: 500 },
    });
    const result = exportTraceToString(tracer);
    const parsed = JSON.parse(result) as { metrics: AggregatedMetrics };
    expect(parsed.metrics.totalInputTokens).toBe(1000);
    expect(parsed.metrics.totalOutputTokens).toBe(500);
  });

  it('uses "unknown" when traceId is null', () => {
    const tracer = makeMockTracer({ traceId: null });
    const result = exportTraceToString(tracer);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['traceId']).toBe('unknown');
  });
});

// ============================================================================
// visualizeTrace
// ============================================================================

describe('visualizeTrace', () => {
  it('returns lines including trace header', () => {
    const tracer = makeMockTracer({ traceId: 'my-trace-id' });
    const lines = visualizeTrace(tracer, { colors: false });
    expect(lines.some((l) => l.includes('my-trace-id'))).toBe(true);
  });

  it('includes span names in output', () => {
    const span = makeSpan({ name: 'orchestrate-task' });
    const tracer = makeMockTracer({ spans: [span] });
    const lines = visualizeTrace(tracer, { colors: false });
    expect(lines.some((l) => l.includes('orchestrate-task'))).toBe(true);
  });

  it('includes summary line', () => {
    const tracer = makeMockTracer({
      metrics: { durationMs: 2340, totalInputTokens: 100 },
    });
    const lines = visualizeTrace(tracer, { colors: false });
    // Summary should contain something about time or tokens
    expect(lines.length).toBeGreaterThan(1);
  });

  it('works with colors enabled', () => {
    const tracer = makeMockTracer();
    const lines = visualizeTrace(tracer, { colors: true });
    expect(lines.length).toBeGreaterThan(0);
  });

  it('works with all options disabled', () => {
    const tracer = makeMockTracer();
    const lines = visualizeTrace(tracer, {
      showCost: false,
      showTokens: false,
      colors: false,
    });
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// generateTraceFilename
// ============================================================================

describe('generateTraceFilename', () => {
  it('includes trace ID prefix', () => {
    const filename = generateTraceFilename('abc12345-def67890');
    expect(filename).toContain('abc12345');
  });

  it('ends with .json extension', () => {
    const filename = generateTraceFilename('test-trace-id');
    expect(filename).toMatch(/\.json$/);
  });

  it('starts with "trace-" prefix', () => {
    const filename = generateTraceFilename('any-id');
    expect(filename.startsWith('trace-')).toBe(true);
  });

  it('truncates trace ID to 8 chars', () => {
    const filename = generateTraceFilename('abcdefghijklmnop');
    expect(filename).toContain('abcdefgh');
    expect(filename).not.toContain('ijklmnop');
  });
});
