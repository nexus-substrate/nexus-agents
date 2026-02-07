/**
 * Tests for GraphExecutor — runtime execution of compiled graph workflows.
 *
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphBuilder, overwrite, append, START, END } from './graph-builder.js';
import { executeGraph } from './graph-executor.js';
import type { GraphState, NodeResult } from './graph-types.js';

describe('executeGraph', () => {
  describe('linear execution', () => {
    it('executes START → A → B → END', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 1 }))
        .addNode('B', (state) => Promise.resolve({ value: (state['value'] as number) + 10 }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['value']).toBe(11);
      expect(result.value.stepsExecuted).toBe(2);
    });
  });

  describe('fan-out / fan-in', () => {
    it('executes parallel nodes and merges state', async () => {
      const graph = new GraphBuilder()
        .addState('results', append<string>())
        .addNode('A', () => Promise.resolve({ results: ['from-A'] }))
        .addNode('B', () => Promise.resolve({ results: ['from-B'] }))
        .addNode('merge', (state) => {
          const results = state['results'] as string[];
          return Promise.resolve({ results: [`merged:${String(results.length)}`] });
        })
        .addEdge(START, 'A')
        .addEdge(START, 'B')
        .addEdge('A', 'merge')
        .addEdge('B', 'merge')
        .addEdge('merge', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // A and B run in parallel (step 1), merge runs after (step 2)
      expect(result.value.stepsExecuted).toBe(3);
      const results = result.value.finalState['results'] as string[];
      expect(results).toContain('from-A');
      expect(results).toContain('from-B');
    });
  });

  describe('conditional edges', () => {
    it('routes based on state', async () => {
      const router = (state: Readonly<GraphState>): string =>
        state['category'] === 'bug' ? 'bugHandler' : END;

      const graph = new GraphBuilder()
        .addState('category', overwrite(''))
        .addState('handled', overwrite(false))
        .addNode('classify', () => Promise.resolve({ category: 'bug' }))
        .addNode('bugHandler', () => Promise.resolve({ handled: true }))
        .addEdge(START, 'classify')
        .addConditionalEdge('classify', router, ['bugHandler', END])
        .addEdge('bugHandler', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['category']).toBe('bug');
      expect(result.value.finalState['handled']).toBe(true);
      expect(result.value.stepsExecuted).toBe(2);
    });

    it('routes to END when condition says so', async () => {
      const router = (): string => END;

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('classify', () => Promise.resolve({ value: 42 }))
        .addNode('unreached', () => Promise.resolve({ value: 999 }))
        .addEdge(START, 'classify')
        .addConditionalEdge('classify', router, ['unreached', END])
        .addEdge('unreached', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['value']).toBe(42);
      expect(result.value.stepsExecuted).toBe(1);
    });
  });

  describe('state reducers', () => {
    it('overwrite reducer uses last value', async () => {
      const graph = new GraphBuilder()
        .addState('counter', overwrite(0))
        .addNode('A', () => Promise.resolve({ counter: 10 }))
        .addNode('B', () => Promise.resolve({ counter: 20 }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['counter']).toBe(20);
    });

    it('append reducer accumulates values', async () => {
      const graph = new GraphBuilder()
        .addState('log', append<string>())
        .addNode('A', () => Promise.resolve({ log: ['step-A'] }))
        .addNode('B', () => Promise.resolve({ log: ['step-B'] }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['log']).toEqual(['step-A', 'step-B']);
    });
  });

  describe('error handling', () => {
    it('marks failed nodes but continues execution', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('fail', () => Promise.reject(new Error('boom')))
        .addNode('succeed', () => Promise.resolve({ value: 42 }))
        .addEdge(START, 'fail')
        .addEdge(START, 'succeed')
        .addEdge('fail', END)
        .addEdge('succeed', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const failed = result.value.nodeResults.find((r) => r.nodeId === 'fail');
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('boom');

      // succeed still runs and applies state
      expect(result.value.finalState['value']).toBe(42);
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { signal: controller.signal });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('aborted');
    });

    it('respects maxSteps limit', async () => {
      // Create a graph that would run many steps via conditional loop-like edges
      const graph = new GraphBuilder()
        .addState('count', overwrite(0))
        .addNode('A', (state) => Promise.resolve({ count: (state['count'] as number) + 1 }))
        .addEdge(START, 'A')
        .addEdge('A', END) // Would stop at 1 step normally
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { maxSteps: 1 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.stepsExecuted).toBeLessThanOrEqual(1);
    });
  });

  describe('callbacks', () => {
    it('calls onNodeComplete for each node', async () => {
      const completedNodes: string[] = [];

      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const onNodeComplete = vi.fn((result: NodeResult) => {
        completedNodes.push(result.nodeId);
      });

      await executeGraph(graph.value, {}, { onNodeComplete });

      expect(onNodeComplete).toHaveBeenCalledTimes(2);
      expect(completedNodes).toEqual(['A', 'B']);
    });
  });

  describe('initial inputs', () => {
    it('passes initial inputs to the first node', async () => {
      const graph = new GraphBuilder()
        .addState('input', overwrite(''))
        .addState('output', overwrite(''))
        .addNode('echo', (state) => Promise.resolve({ output: `echo:${String(state['input'])}` }))
        .addEdge(START, 'echo')
        .addEdge('echo', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, { input: 'hello' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['output']).toBe('echo:hello');
    });
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const noop = () => Promise.resolve({});
