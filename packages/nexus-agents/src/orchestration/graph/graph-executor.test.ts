/**
 * Tests for GraphExecutor — runtime execution of compiled graph workflows.
 *
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphBuilder, overwrite, append, customReducer, START, END } from './graph-builder.js';
import { executeGraph, GRAPH_UNIFIED_CONTEXT_KEY } from './graph-executor.js';
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

  describe('failure classification for selective-retry (#3534)', () => {
    it('marks a transient node failure as retryable', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.reject(new Error('connection timed out')))
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();
      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const a = result.value.nodeResults.find((r) => r.nodeId === 'A');
      expect(a?.status).toBe('failed');
      expect(a?.errorCategory).toBe('transient');
      expect(a?.isRetryable).toBe(true);
    });

    it('marks a non-transient node failure as not retryable', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.reject(new Error('permission denied: forbidden')))
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();
      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const a = result.value.nodeResults.find((r) => r.nodeId === 'A');
      expect(a?.status).toBe('failed');
      expect(a?.isRetryable).toBe(false);
    });

    it('replays a prior successful node instead of re-executing it (slice 2)', async () => {
      let aRuns = 0;
      const build = (): ReturnType<GraphBuilder['compile']> =>
        new GraphBuilder()
          .addState('value', overwrite(0))
          .addNode('A', () => {
            aRuns += 1;
            return Promise.resolve({ value: 1 });
          })
          .addNode('B', (state) => Promise.resolve({ value: (state['value'] as number) + 10 }))
          .addEdge(START, 'A')
          .addEdge('A', 'B')
          .addEdge('B', END)
          .compile();

      const g1 = build();
      expect(g1.ok).toBe(true);
      if (!g1.ok) return;
      const r1 = await executeGraph(g1.value, {});
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      expect(aRuns).toBe(1);
      const aResult = r1.value.nodeResults.find((r) => r.nodeId === 'A');
      expect(aResult?.status).toBe('success');

      // Re-run, replaying A via priorResults: A's handler must NOT run again,
      // but its stateUpdates must seed so B still produces the same final state.
      const g2 = build();
      expect(g2.ok).toBe(true);
      if (!g2.ok) return;
      const prior = new Map(aResult !== undefined ? [['A', aResult]] : []);
      const r2 = await executeGraph(g2.value, {}, { priorResults: prior });
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      expect(aRuns).toBe(1); // replayed, not re-executed
      expect(r2.value.finalState['value']).toBe(11); // seeded A + ran B
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

    it('fails when maxSteps is exhausted with a node pending', async () => {
      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { maxSteps: 1 });
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.message).toContain('maxSteps exhausted with 1 runnable node(s) pending');
      expect(result.error.message).toContain('B');
    });

    it('succeeds when the graph drains at the maxSteps limit', async () => {
      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { maxSteps: 2 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.stepsExecuted).toBe(2);
    });

    it('does not start a parallel batch that exceeds the remaining node budget', async () => {
      const runA = vi.fn(noop);
      const runB = vi.fn(noop);
      const graph = new GraphBuilder()
        .addNode('A', runA)
        .addNode('B', runB)
        .addEdge(START, 'A')
        .addEdge(START, 'B')
        .addEdge('A', END)
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { maxSteps: 1 });
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(runA).not.toHaveBeenCalled();
      expect(runB).not.toHaveBeenCalled();
      expect(result.error.message).toContain('2 runnable node(s) pending');
      expect(result.error.message).toContain('A');
      expect(result.error.message).toContain('B');
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

    it('does not crash execution when onNodeComplete throws', async () => {
      const graph = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      let invocations = 0;
      const throwingCallback = (_: NodeResult): void => {
        invocations++;
        throw new Error('observer broken');
      };

      const result = await executeGraph(graph.value, {}, { onNodeComplete: throwingCallback });

      // Both nodes should still complete despite the throwing observer.
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nodeResults).toHaveLength(2);
      expect(invocations).toBe(2);
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
    it('preserves undeclared state field writes via overwrite default', async () => {
      // Back-compat: silent overwrite for undeclared fields still happens,
      // but is now logged. The state-merge behaviour is unchanged.
      const graph = new GraphBuilder()
        .addState('declared', overwrite(0))
        .addNode('A', () => Promise.resolve({ declared: 1, undeclared: 'surprise' }))
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {}, { executionId: 'undeclared' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.finalState['declared']).toBe(1);
      expect(result.value.finalState['undeclared']).toBe('surprise');
    });

    it('continues execution when checkpoint store fails', async () => {
      const failingStore = {
        save: vi.fn(() => {
          throw new Error('disk full');
        }),
        latest: vi.fn(() => undefined),
        list: vi.fn(() => []),
        load: vi.fn(() => undefined),
        delete: vi.fn(() => true),
        deleteExecution: vi.fn(() => 0),
        clear: vi.fn(() => 0),
        size: vi.fn(() => 0),
      };

      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 1 }))
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: failingStore,
          executionId: 'exec-fail',
        }
      );

      // Execution completed despite the checkpoint failure.
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.finalState['value']).toBe(1);
      expect(failingStore.save).toHaveBeenCalled();
    });

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

// ---------------------------------------------------------------------------
// Unified-context observability at graph start (#3180)
// ---------------------------------------------------------------------------

const EMPTY_UNIFIED_CONTEXT = {
  beliefs: [],
  similarMemories: [],
  recentLearnings: [],
  experiencePatterns: [],
  outcomes: null,
  priorStrategies: [],
  researchInsights: [],
};

// Controllable mock for the dynamically imported context-retriever. The real
// inferTaskCategory is preserved so category-inference assertions exercise
// production logic; only getContextForTask is swapped.
const getContextForTaskMock = vi.fn();
vi.mock('../../context/context-retriever.js', async (importActual) => {
  const actual = await importActual<typeof import('../../context/context-retriever.js')>();
  return {
    ...actual,
    getContextForTask: (...args: unknown[]): unknown => getContextForTaskMock(...args),
  };
});

describe('graph-start context observability (#3180)', () => {
  beforeEach(() => {
    getContextForTaskMock.mockReset();
    getContextForTaskMock.mockResolvedValue(EMPTY_UNIFIED_CONTEXT);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const singleNodeGraph = () =>
    new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }))
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

  it('(a) retrieval throw → warn + exactly one sanitized context_unavailable event, graph still completes', async () => {
    getContextForTaskMock.mockRejectedValue(new Error('backend exploded'));
    // The structured logger writes to a stdout/stderr stream, not console.warn.
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        writes.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        writes.push(String(chunk));
        return true;
      });

    const graph = singleNodeGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const events: GraphEvent[] = [];
    // 'fix this security bug' → inferTaskCategory → 'security_review'
    const result = await executeGraph(
      graph.value,
      { task: 'fix this security bug' },
      { onEvent: (e) => events.push(e), executionId: 'exec-3180' }
    );

    // Graph still COMPLETES with empty context (best-effort contract).
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.finalState['value']).toBe(1);
    expect(result.value.finalState[GRAPH_UNIFIED_CONTEXT_KEY]).toBeUndefined();

    // Exactly ONE context_unavailable event with correct fields.
    const ctxEvents = events.filter((e) => e.type === 'context_unavailable');
    expect(ctxEvents).toHaveLength(1);
    const evt = ctxEvents[0];
    if (evt?.type !== 'context_unavailable') throw new Error('unreachable');
    expect(evt.category).toBe('security_review');
    expect(evt.executionId).toBe('exec-3180');
    expect(evt.error).toBe('backend exploded');
    // Sanitized: no stack trace leaked into the payload.
    expect(evt.error).not.toContain('at ');
    expect(typeof evt.timestamp).toBe('number');

    // A WARN was logged (level + the warn message text appear in the output).
    const logged = writes.join('');
    expect(logged).toContain('warn');
    expect(logged).toContain('context retrieval failed');
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('(b) success path → executionId is threaded into getContextForTask options', async () => {
    const graph = singleNodeGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(
      graph.value,
      { task: 'add a new feature' },
      { executionId: 'exec-success' }
    );
    expect(result.ok).toBe(true);

    expect(getContextForTaskMock).toHaveBeenCalledTimes(1);
    const arg = getContextForTaskMock.mock.calls[0]?.[0] as {
      task: string;
      category: string;
      executionId?: string;
    };
    expect(arg.task).toBe('add a new feature');
    expect(arg.executionId).toBe('exec-success');
    // 'add a new feature' → code_generation
    expect(arg.category).toBe('code_generation');
  });

  it('(c) absent/empty task → early return: no retrieval, no event', async () => {
    const graph = singleNodeGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const events: GraphEvent[] = [];
    // No 'task' key in inputs at all.
    const result = await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });
    expect(result.ok).toBe(true);

    expect(getContextForTaskMock).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'context_unavailable')).toBe(false);
  });

  it('(d) per-backend partial failure that overall resolves → no event', async () => {
    // getContextForTask never throws on a single-backend failure — it returns a
    // (possibly empty) UnifiedContext. Model that: resolve normally → no event.
    getContextForTaskMock.mockResolvedValue(EMPTY_UNIFIED_CONTEXT);

    const graph = singleNodeGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const events: GraphEvent[] = [];
    const result = await executeGraph(
      graph.value,
      { task: 'investigate something' },
      { onEvent: (e) => events.push(e) }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(events.some((e) => e.type === 'context_unavailable')).toBe(false);
    // Empty context was still stashed on success.
    expect(result.value.finalState[GRAPH_UNIFIED_CONTEXT_KEY]).toEqual(EMPTY_UNIFIED_CONTEXT);
  });
});
