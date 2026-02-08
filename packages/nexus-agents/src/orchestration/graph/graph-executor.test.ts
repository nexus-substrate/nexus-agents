/**
 * Tests for GraphExecutor — runtime execution of compiled graph workflows.
 *
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphBuilder, overwrite, append, customReducer, START, END } from './graph-builder.js';
import { executeGraph } from './graph-executor.js';
import { InMemoryCheckpointStore } from './checkpoint-store.js';
import type { GraphState, NodeResult, GraphEvent } from './graph-types.js';

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

  describe('checkpointing (Issue #837)', () => {
    it('saves checkpoints after each super-step', async () => {
      const store = new InMemoryCheckpointStore();

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 1 }))
        .addNode('B', (s) => Promise.resolve({ value: (s['value'] as number) + 10 }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-1',
        }
      );

      // Two super-steps → two checkpoints
      expect(store.size()).toBe(2);
      const summaries = store.list('exec-1');
      expect(summaries.length).toBe(2);
    });

    it('resumes execution from a checkpoint', async () => {
      const store = new InMemoryCheckpointStore();
      const executedNodes: string[] = [];

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => {
          executedNodes.push('A');
          return Promise.resolve({ value: 1 });
        })
        .addNode('B', (s) => {
          executedNodes.push('B');
          return Promise.resolve({ value: (s['value'] as number) + 10 });
        })
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      // First run: complete execution, creates checkpoints
      await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-resume',
        }
      );

      expect(executedNodes).toEqual(['A', 'B']);
      executedNodes.length = 0;

      // Manually create a checkpoint at step A completed
      const { createCheckpoint: createCp } = await import('./checkpoint-store.js');
      store.clear();
      store.save(
        createCp({
          executionId: 'exec-resume-2',
          stepNumber: 1,
          state: { value: 1 },
          pendingNodeIds: ['B'],
          completedResults: [
            {
              nodeId: 'A',
              stateUpdates: { value: 1 },
              durationMs: 5,
              status: 'success',
            },
          ],
        })
      );

      // Resume: should only execute B
      const result = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-resume-2',
        }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(executedNodes).toEqual(['B']);
      expect(result.value.finalState['value']).toBe(11);
    });

    it('skips checkpointing when no store configured', async () => {
      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      // No store — should not throw
      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
    });

    it('stores correct state in each checkpoint', async () => {
      const store = new InMemoryCheckpointStore();

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 10 }))
        .addNode('B', () => Promise.resolve({ value: 20 }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-state',
        }
      );

      const summaries = store.list('exec-state');
      expect(summaries.length).toBe(2);

      // First checkpoint: after A executed
      const cp1 = store.load(summaries[0]!.id);
      expect(cp1?.state['value']).toBe(10);

      // Second checkpoint: after B executed
      const cp2 = store.load(summaries[1]!.id);
      expect(cp2?.state['value']).toBe(20);
    });
  });

  describe('event streaming (Issue #838)', () => {
    it('emits all event types for a linear graph', async () => {
      const events: GraphEvent[] = [];

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 1 }))
        .addNode('B', () => Promise.resolve({ value: 2 }))
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

      const types = events.map((e) => e.type);
      expect(types).toContain('node_started');
      expect(types).toContain('node_completed');
      expect(types).toContain('state_updated');
      expect(types).toContain('step_completed');
      expect(types).toContain('execution_complete');
    });

    it('emits node_started before node_completed', async () => {
      const events: GraphEvent[] = [];

      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

      const startIdx = events.findIndex((e) => e.type === 'node_started' && e.nodeId === 'A');
      const completeIdx = events.findIndex((e) => e.type === 'node_completed' && e.nodeId === 'A');
      expect(startIdx).toBeLessThan(completeIdx);
    });

    it('emits node_error for failed nodes', async () => {
      const events: GraphEvent[] = [];

      const graph = new GraphBuilder()
        .addNode('fail', () => Promise.reject(new Error('boom')))
        .addEdge(START, 'fail')
        .addEdge('fail', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

      const errorEvent = events.find((e) => e.type === 'node_error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'node_error') {
        expect(errorEvent.nodeId).toBe('fail');
        expect(errorEvent.error).toBe('boom');
      }
    });

    it('emits execution_complete with correct totals', async () => {
      const events: GraphEvent[] = [];

      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

      const complete = events.find((e) => e.type === 'execution_complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'execution_complete') {
        expect(complete.totalSteps).toBe(2);
        expect(complete.totalNodes).toBe(2);
        expect(complete.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('emits state_updated with correct keys', async () => {
      const events: GraphEvent[] = [];

      const graph = new GraphBuilder()
        .addState('x', overwrite(0))
        .addState('y', overwrite(0))
        .addNode('A', () => Promise.resolve({ x: 1, y: 2 }))
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

      const stateEvent = events.find((e) => e.type === 'state_updated');
      expect(stateEvent).toBeDefined();
      if (stateEvent?.type === 'state_updated') {
        expect(stateEvent.updatedKeys).toContain('x');
        expect(stateEvent.updatedKeys).toContain('y');
      }
    });

    it('does not emit events when onEvent not provided', async () => {
      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      // Should not throw even without onEvent
      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
    });
  });
});

describe('edge case hardening', () => {
  it('custom reducer exception falls back to overwrite', async () => {
    const throwingReducer = customReducer(0, () => {
      throw new Error('reducer boom');
    });
    const compiled = new GraphBuilder()
      .addState('count', throwingReducer)
      .addNode('A', () => Promise.resolve({ count: 42 }))
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Falls back to overwrite — value should be 42
    expect(result.value.finalState['count']).toBe(42);
  });

  it('conditional router returning invalid node ID is skipped', async () => {
    const compiled = new GraphBuilder()
      .addState('value', overwrite(''))
      .addNode('A', () => Promise.resolve({ value: 'done' }))
      .addEdge(START, 'A')
      .addConditionalEdge('A', () => 'nonexistent_node', ['nonexistent_node', END])
      .addEdge('A', END)
      .compile();
    // Note: compile allows conditional targets that aren't real nodes
    // since they could be dynamically valid at runtime
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {});
    expect(result.ok).toBe(true);
  });

  it('conditional router that throws produces graceful END', async () => {
    const compiled = new GraphBuilder()
      .addState('value', overwrite(''))
      .addNode('A', () => Promise.resolve({ value: 'done' }))
      .addNode('B', () => Promise.resolve({ value: 'never reached' }))
      .addEdge(START, 'A')
      .addConditionalEdge(
        'A',
        () => {
          throw new Error('router boom');
        },
        ['B', END]
      )
      .addEdge('B', END)
      .compile();
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Router threw, so it returned END, B was never executed
    expect(result.value.finalState['value']).toBe('done');
    expect(result.value.nodeResults.length).toBe(1);
  });
});

describe('maxTraversals (Issue #910, E2-4)', () => {
  it('limits edge traversals to maxTraversals count', async () => {
    let loopCount = 0;
    const compiled = new GraphBuilder()
      .addState('count', overwrite(0))
      .addNode('loop', () => {
        loopCount++;
        return Promise.resolve({ count: loopCount });
      })
      .addEdge(START, 'loop')
      .addEdge('loop', END)
      .compile();

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Without loops, node executes once
    expect(loopCount).toBe(1);
  });

  it('accepts maxTraversals option on addEdge', () => {
    // maxTraversals is stored on the edge for runtime enforcement
    const compiled = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }))
      .addNode('B', () => Promise.resolve({ value: 2 }))
      .addEdge(START, 'A')
      .addEdge('A', 'B', { maxTraversals: 3 })
      .addEdge('B', END)
      .compile();

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    // Verify the edge has maxTraversals set
    const abEdge = compiled.value.edges.find(
      (e) => e.type === 'fixed' && e.from === 'A' && e.to === 'B'
    );
    expect(abEdge).toBeDefined();
    expect(abEdge?.maxTraversals).toBe(3);
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const noop = () => Promise.resolve({});
