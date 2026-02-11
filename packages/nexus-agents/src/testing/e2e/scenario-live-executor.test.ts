/**
 * Tests for Live Graph Executor (Epic #952, Phase 3)
 *
 * @module testing/e2e/scenario-live-executor.test
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphBuilder, overwrite, START, END } from '../../orchestration/graph/graph-builder.js';
import {
  executeLiveGraph,
  computeBranchCoverage,
  type LiveExecutorConfig,
} from './scenario-live-executor.js';
import type { ITraceOutput } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildSimpleGraph() {
  return new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('output', overwrite(''))
    .addNode('process', (state: Record<string, unknown>) =>
      Promise.resolve({ output: `processed:${String(state['input'])}` })
    )
    .addEdge(START, 'process')
    .addEdge('process', END)
    .compile();
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildConditionalGraph() {
  const router = (state: Record<string, unknown>): string =>
    String(state['output']) === 'complex' ? 'slow' : 'fast';

  return new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('output', overwrite(''))
    .addNode('classify', (state: Record<string, unknown>) => {
      const val = String(state['input']);
      return Promise.resolve({ output: val.length > 5 ? 'complex' : 'simple' });
    })
    .addNode('fast', () => Promise.resolve({ output: 'fast-path' }))
    .addNode('slow', () => Promise.resolve({ output: 'slow-path' }))
    .addEdge(START, 'classify')
    .addConditionalEdge('classify', router, ['fast', 'slow'])
    .addEdge('fast', END)
    .addEdge('slow', END)
    .compile();
}

// ============================================================================
// computeBranchCoverage
// ============================================================================

describe('computeBranchCoverage', () => {
  it('reports 100% when no conditional edges', () => {
    const result = buildSimpleGraph();
    if (!result.ok) throw new Error('compile failed');

    const executed = new Set(['process']);
    const coverage = computeBranchCoverage(result.value, executed);

    expect(coverage.totalEdges).toBe(2);
    expect(coverage.conditionalEdges).toHaveLength(0);
    expect(coverage.coveragePercent).toBe(100);
  });

  it('reports partial coverage for conditional edges', () => {
    const result = buildConditionalGraph();
    if (!result.ok) throw new Error('compile failed');

    // Only the 'fast' path was taken
    const executed = new Set(['classify', 'fast']);
    const coverage = computeBranchCoverage(result.value, executed);

    expect(coverage.conditionalEdges.length).toBeGreaterThanOrEqual(1);
    expect(coverage.traversedConditionalEdges.length).toBeLessThan(
      coverage.conditionalEdges.length
    );
    expect(coverage.coveragePercent).toBeLessThan(100);
  });

  it('includes edge identifiers in arrow format', () => {
    const result = buildSimpleGraph();
    if (!result.ok) throw new Error('compile failed');

    const executed = new Set(['process']);
    const coverage = computeBranchCoverage(result.value, executed);

    expect(coverage.traversedEdges[0]).toContain('→');
  });
});

// ============================================================================
// executeLiveGraph
// ============================================================================

describe('executeLiveGraph', () => {
  it('executes a simple graph and returns step results', async () => {
    const compiled = buildSimpleGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = { timeoutMs: 5000 };
    const result = await executeLiveGraph(compiled.value, { input: 'hello' }, config);

    expect(result.stepResults.size).toBe(1);
    const pr = result.stepResults.get('process');
    expect(pr).toBeDefined();
    expect(pr?.status).toBe('success');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('collects branch coverage', async () => {
    const compiled = buildConditionalGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = { timeoutMs: 5000 };
    const result = await executeLiveGraph(compiled.value, { input: 'hi' }, config);

    expect(result.branchCoverage.totalEdges).toBeGreaterThan(0);
  });

  it('writes trace events to ITraceOutput', async () => {
    const compiled = buildSimpleGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const events: Record<string, unknown>[] = [];
    const traceOutput: ITraceOutput = {
      writeEvent: (entry) => events.push(entry),
      flush: () => Promise.resolve(),
    };

    const config: LiveExecutorConfig = {
      timeoutMs: 5000,
      traceOutput,
      runId: 'test-run-1',
    };
    await executeLiveGraph(compiled.value, { input: 'x' }, config);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.['runId']).toBe('test-run-1');
    expect(events[0]?.['eventType']).toContain('graph.');
  });

  it('calls flush on trace output', async () => {
    const compiled = buildSimpleGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const flushFn = vi.fn(() => Promise.resolve());
    const traceOutput: ITraceOutput = {
      writeEvent: () => undefined,
      flush: flushFn,
    };

    const config: LiveExecutorConfig = {
      timeoutMs: 5000,
      traceOutput,
    };
    await executeLiveGraph(compiled.value, { input: 'x' }, config);

    expect(flushFn).toHaveBeenCalledOnce();
  });

  it('uses provided runId', async () => {
    const compiled = buildSimpleGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = {
      timeoutMs: 5000,
      runId: 'custom-run-42',
    };
    const result = await executeLiveGraph(compiled.value, { input: '' }, config);

    expect(result.runId).toBe('custom-run-42');
  });

  it('generates runId when not provided', async () => {
    const compiled = buildSimpleGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = { timeoutMs: 5000 };
    const result = await executeLiveGraph(compiled.value, { input: '' }, config);

    expect(result.runId).toMatch(/^live-/);
  });

  it('takes the fast path for short input', async () => {
    const compiled = buildConditionalGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = { timeoutMs: 5000 };
    const result = await executeLiveGraph(compiled.value, { input: 'hi' }, config);

    expect(result.stepResults.has('classify')).toBe(true);
    expect(result.stepResults.has('fast')).toBe(true);
    expect(result.stepResults.has('slow')).toBe(false);
  });

  it('takes the slow path for long input', async () => {
    const compiled = buildConditionalGraph();
    if (!compiled.ok) throw new Error('compile failed');

    const config: LiveExecutorConfig = { timeoutMs: 5000 };
    const result = await executeLiveGraph(compiled.value, { input: 'a-long-input-string' }, config);

    expect(result.stepResults.has('classify')).toBe(true);
    expect(result.stepResults.has('slow')).toBe(true);
    expect(result.stepResults.has('fast')).toBe(false);
  });
});
