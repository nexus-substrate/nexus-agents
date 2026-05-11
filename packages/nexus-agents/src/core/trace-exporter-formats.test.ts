/**
 * Tests for Trace Exporter.
 * (Source: Issue #132)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Tracer } from './trace.js';
import {
  exportTraceToFile,
  exportTraceToString,
  visualizeTrace,
  printTrace,
  generateTraceFilename,
  type ExportedTrace,
} from './trace-exporter.js';

// =============================================================================
// Test Setup
// =============================================================================

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-exporter-test-'));
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});

function createPopulatedTracer(): Tracer {
  const tracer = new Tracer({ enabled: true });

  const root = tracer.startTrace('orchestrate', { task: 'review' });
  tracer.recordLLMMetrics(root!.context.spanId, {
    inputTokens: 1000,
    outputTokens: 500,
    model: 'claude-sonnet-4',
    provider: 'anthropic',
  });

  const child = tracer.startChildSpan(root!.context.spanId, 'analyze');
  tracer.recordLLMMetrics(child!.context.spanId, {
    inputTokens: 2000,
    outputTokens: 800,
    model: 'claude-sonnet-4',
    provider: 'anthropic',
  });
  tracer.endSpan(child!.context.spanId, 'success');

  const errorChild = tracer.startChildSpan(root!.context.spanId, 'failing-step');
  tracer.endSpan(errorChild!.context.spanId, 'error', 'Something went wrong');

  tracer.endSpan(root!.context.spanId, 'success');

  return tracer;
}

// =============================================================================
// Export Tests
// =============================================================================

describe('exportTraceToFile', () => {
  it('exports trace to JSON file', () => {
    const tracer = createPopulatedTracer();
    const filepath = path.join(testDir, 'trace.json');

    exportTraceToFile(tracer, filepath);

    expect(fs.existsSync(filepath)).toBe(true);
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content) as ExportedTrace;

    expect(data.traceId).toBeDefined();
    expect(data.exportedAt).toBeDefined();
    expect(data.spans).toHaveLength(3);
    expect(data.metrics.totalSpans).toBe(3);
  });

  it('creates directory if not exists', () => {
    const tracer = createPopulatedTracer();
    const filepath = path.join(testDir, 'subdir', 'nested', 'trace.json');

    exportTraceToFile(tracer, filepath);

    expect(fs.existsSync(filepath)).toBe(true);
  });

  it('exports minified JSON with format option', () => {
    const tracer = createPopulatedTracer();
    const filepath = path.join(testDir, 'trace-minified.json');

    exportTraceToFile(tracer, filepath, 'json');

    const content = fs.readFileSync(filepath, 'utf-8');
    expect(content.includes('\n')).toBe(false);
  });

  it('exports pretty JSON by default', () => {
    const tracer = createPopulatedTracer();
    const filepath = path.join(testDir, 'trace-pretty.json');

    exportTraceToFile(tracer, filepath);

    const content = fs.readFileSync(filepath, 'utf-8');
    expect(content.includes('\n')).toBe(true);
  });
});

describe('exportTraceToString', () => {
  it('exports trace to JSON string', () => {
    const tracer = createPopulatedTracer();
    const json = exportTraceToString(tracer);

    const data = JSON.parse(json) as ExportedTrace;
    expect(data.spans).toHaveLength(3);
    expect(data.metrics.totalInputTokens).toBe(3000);
  });

  it('exports minified JSON with format option', () => {
    const tracer = createPopulatedTracer();
    const json = exportTraceToString(tracer, 'json');

    expect(json.includes('\n')).toBe(false);
  });

  it('handles empty tracer', () => {
    const tracer = new Tracer({ enabled: true });
    const json = exportTraceToString(tracer);

    const data = JSON.parse(json) as ExportedTrace;
    expect(data.spans).toHaveLength(0);
    expect(data.traceId).toBe('unknown');
  });
});

// =============================================================================
// Visualization Tests
// =============================================================================

describe('visualizeTrace', () => {
  it('generates tree visualization', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('Trace:');
    expect(lines.some((l) => l.includes('orchestrate'))).toBe(true);
    expect(lines.some((l) => l.includes('analyze'))).toBe(true);
  });

  it('shows status indicators', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false });

    expect(lines.some((l) => l.includes('[OK]'))).toBe(true);
    expect(lines.some((l) => l.includes('[ERR]'))).toBe(true);
  });

  it('shows error messages', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false });

    expect(lines.some((l) => l.includes('Something went wrong'))).toBe(true);
  });

  it('shows token counts when enabled', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false, showTokens: true });

    expect(lines.some((l) => l.includes('in /') && l.includes('out'))).toBe(true);
  });

  it('hides token counts when disabled', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false, showTokens: false });

    expect(lines.some((l) => l.includes('1,000 in'))).toBe(false);
  });

  it('shows cost when enabled', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false, showCost: true });

    expect(lines.some((l) => l.includes('$'))).toBe(true);
  });

  it('hides cost when disabled', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false, showCost: false });

    // Summary line should not have cost
    const summaryLine = lines[lines.length - 1];
    expect(summaryLine).not.toContain('Cost:');
  });

  it('includes summary line', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: false });

    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain('Total:');
  });

  it('includes color codes when enabled', () => {
    const tracer = createPopulatedTracer();
    const lines = visualizeTrace(tracer, { colors: true });

    // Check for ANSI escape codes
    expect(lines.some((l) => l.includes('\x1b['))).toBe(true);
  });

  it('handles empty tracer', () => {
    const tracer = new Tracer({ enabled: true });
    const lines = visualizeTrace(tracer, { colors: false });

    expect(lines[0]).toContain('Trace: unknown');
  });

  it('handles nested spans correctly', () => {
    const tracer = new Tracer({ enabled: true });
    const root = tracer.startTrace('root');
    const child1 = tracer.startChildSpan(root!.context.spanId, 'child-1');
    const grandchild = tracer.startChildSpan(child1!.context.spanId, 'grandchild');
    tracer.endSpan(grandchild!.context.spanId, 'success');
    tracer.endSpan(child1!.context.spanId, 'success');
    const child2 = tracer.startChildSpan(root!.context.spanId, 'child-2');
    tracer.endSpan(child2!.context.spanId, 'success');
    tracer.endSpan(root!.context.spanId, 'success');

    const lines = visualizeTrace(tracer, { colors: false });

    // Verify tree structure (root with 2 children, first child has grandchild)
    expect(lines.some((l) => l.includes('root'))).toBe(true);
    expect(lines.some((l) => l.includes('child-1'))).toBe(true);
    expect(lines.some((l) => l.includes('grandchild'))).toBe(true);
    expect(lines.some((l) => l.includes('child-2'))).toBe(true);
  });
});

describe('printTrace', () => {
  it('does not throw', () => {
    const tracer = createPopulatedTracer();
    // Just verify it doesn't throw
    expect(() => {
      printTrace(tracer, { colors: false });
    }).not.toThrow();
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe('generateTraceFilename', () => {
  it('generates filename with trace ID', () => {
    const filename = generateTraceFilename('abc123-def456-789');
    expect(filename).toContain('abc123-d');
    expect(filename).toMatch(/^trace-.*\.json$/);
  });

  it('includes timestamp', () => {
    const filename = generateTraceFilename('test');
    expect(filename).toMatch(/trace-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('trace export integration', () => {
  it('round-trips trace data through export/import', () => {
    const tracer = createPopulatedTracer();
    const json = exportTraceToString(tracer);
    const data = JSON.parse(json) as ExportedTrace;

    // Verify all spans preserved
    expect(data.spans).toHaveLength(3);

    // Verify metrics preserved
    expect(data.metrics.totalInputTokens).toBe(3000);
    expect(data.metrics.totalOutputTokens).toBe(1300);
    expect(data.metrics.successfulSpans).toBe(2);
    expect(data.metrics.errorSpans).toBe(1);
  });

  it('exports and visualizes the same trace consistently', () => {
    const tracer = createPopulatedTracer();

    const json = exportTraceToString(tracer);
    const data = JSON.parse(json) as ExportedTrace;

    const lines = visualizeTrace(tracer, { colors: false });

    // Both should show same number of spans
    expect(data.spans.length).toBe(3);
    // Visualization should mention all span names
    const text = lines.join('\n');
    for (const span of data.spans) {
      expect(text).toContain(span.name);
    }
  });
});
