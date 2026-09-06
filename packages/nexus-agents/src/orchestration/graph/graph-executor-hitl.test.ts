/**
 * Tests for graph HITL primitives — Interrupt + Command + resumeFromCheckpoint.
 *
 * Source: Issue #1895 — HITL pause/resume primitives. Phase 1: Interrupt and
 * the `update` portion of Command are honored by the executor; `goto` lands
 * in Phase 2.
 */

import { describe, it, expect } from 'vitest';
import { GraphBuilder, overwrite, START, END } from './graph-builder.js';
import { executeGraph, resumeFromCheckpoint } from './graph-executor.js';
import { interrupt } from './graph-types.js';
import type { GraphEvent, NodeContext, NodeReturn } from './graph-types.js';
import { InMemoryCheckpointStore } from './checkpoint-store.js';

describe('HITL primitives (#1895)', () => {
  describe('Interrupt return', () => {
    it('halts the super-step loop when a node returns Interrupt', async () => {
      const graph = new GraphBuilder()
        .addState('answer', overwrite<string | undefined>(undefined))
        .addNode('ask', (): Promise<NodeReturn> =>
          Promise.resolve(interrupt('approval', 'Approve the auth flow change?'))
        )
        .addNode('proceed', (state) =>
          Promise.resolve({ answer: `proceeded with ${String(state['answer'])}` })
        )
        .addEdge(START, 'ask')
        .addEdge('ask', 'proceed')
        .addEdge('proceed', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const result = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-1',
        }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.halted).toBeDefined();
      expect(result.value.halted?.nodeId).toBe('ask');
      expect(result.value.halted?.interruptId).toBe('approval');
      expect(result.value.halted?.value).toBe('Approve the auth flow change?');
      // The 'proceed' node should NOT have run.
      expect(result.value.nodeResults.find((r) => r.nodeId === 'proceed')).toBeUndefined();
    });

    it('records the node result with status=interrupted', async () => {
      const graph = new GraphBuilder()
        .addNode('ask', () => Promise.resolve(interrupt('q1', 'context')))
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const result = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-status',
        }
      );
      if (!result.ok) return;

      const askResult = result.value.nodeResults.find((r) => r.nodeId === 'ask');
      expect(askResult?.status).toBe('interrupted');
      expect(askResult?.interrupt?.id).toBe('q1');
    });

    it('does not save halted info when no checkpointStore is configured', async () => {
      const graph = new GraphBuilder()
        .addNode('ask', () => Promise.resolve(interrupt('q1', 'context')))
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      if (!result.ok) return;

      // Halt still happened (the proceed node didn't run), but no checkpoint
      // means halted summary isn't populated — the caller can't resume.
      expect(result.value.halted).toBeUndefined();
    });
  });

  describe('Command return', () => {
    it('honors the update portion of a Command', async () => {
      const graph = new GraphBuilder()
        .addState('count', overwrite(0))
        .addNode('inc', () => Promise.resolve({ type: 'command' as const, update: { count: 5 } }))
        .addEdge(START, 'inc')
        .addEdge('inc', END)
        .compile();
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.finalState['count']).toBe(5);
    });

    it('treats Command without update as a no-op state update', async () => {
      const graph = new GraphBuilder()
        .addState('count', overwrite(0))
        .addNode('noop', () => Promise.resolve({ type: 'command' as const }))
        .addEdge(START, 'noop')
        .addEdge('noop', END)
        .compile();
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      if (!result.ok) return;
      expect(result.value.finalState['count']).toBe(0);
    });
  });

  describe('resumeFromCheckpoint', () => {
    it('restarts the interrupted node with resumeValues delivered via NodeContext', async () => {
      const graph = new GraphBuilder()
        .addState('answer', overwrite<string | undefined>(undefined))
        .addNode('ask', (state, ctx?: NodeContext): Promise<NodeReturn> => {
          const supplied = ctx?.resumeValues['approval'];
          if (typeof supplied === 'string') {
            return Promise.resolve({ answer: `human said: ${supplied}` });
          }
          return Promise.resolve(interrupt('approval', 'Yes/No?'));
        })
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const first = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-resume-1',
        }
      );
      if (!first.ok) return;
      expect(first.value.halted).toBeDefined();
      const checkpointId = first.value.halted?.checkpointId;
      expect(checkpointId).toBeTypeOf('string');
      if (checkpointId === undefined) return;

      const resumed = await resumeFromCheckpoint(
        graph.value,
        checkpointId,
        { approval: 'yes' },
        { checkpointStore: store }
      );
      expect(resumed.ok).toBe(true);
      if (!resumed.ok) return;
      expect(resumed.value.halted).toBeUndefined();
      expect(resumed.value.finalState['answer']).toBe('human said: yes');
    });

    it('returns an error when checkpointId is unknown', async () => {
      const graph = new GraphBuilder()
        .addNode('ask', () => Promise.resolve(interrupt('q', 'ctx')))
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const resumed = await resumeFromCheckpoint(
        graph.value,
        'cp-nonexistent',
        {},
        {
          checkpointStore: store,
        }
      );
      expect(resumed.ok).toBe(false);
      if (resumed.ok) return;
      expect(resumed.error.message).toContain('not found');
    });

    it('returns an error when the checkpoint has no interrupt metadata', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('a', () => Promise.resolve({ value: 1 }))
        .addEdge(START, 'a')
        .addEdge('a', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const first = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-no-interrupt',
        }
      );
      if (!first.ok) return;
      const checkpoint = store.latest('exec-no-interrupt');
      expect(checkpoint).toBeDefined();
      if (checkpoint === undefined) return;

      const resumed = await resumeFromCheckpoint(
        graph.value,
        checkpoint.id,
        {},
        {
          checkpointStore: store,
        }
      );
      expect(resumed.ok).toBe(false);
      if (resumed.ok) return;
      expect(resumed.error.message).toContain('no interrupt metadata');
    });

    it('returns an error when resumeValues is missing the interrupt id', async () => {
      const graph = new GraphBuilder()
        .addNode('ask', () => Promise.resolve(interrupt('approval', 'go?')))
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const first = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-missing-id',
        }
      );
      if (!first.ok) return;
      const checkpointId = first.value.halted?.checkpointId;
      if (checkpointId === undefined) return;

      const resumed = await resumeFromCheckpoint(
        graph.value,
        checkpointId,
        { wrong_id: 'x' },
        {
          checkpointStore: store,
        }
      );
      expect(resumed.ok).toBe(false);
      if (resumed.ok) return;
      expect(resumed.error.message).toContain("missing interrupt id 'approval'");
    });

    it('returns an error when checkpointStore is omitted', async () => {
      const graph = new GraphBuilder()
        .addNode('a', () => Promise.resolve({}))
        .addEdge(START, 'a')
        .addEdge('a', END)
        .compile();
      if (!graph.ok) return;

      const resumed = await resumeFromCheckpoint(graph.value, 'cp-1', {}, {});
      expect(resumed.ok).toBe(false);
      if (resumed.ok) return;
      expect(resumed.error.message).toContain('checkpointStore');
    });

    it('clears resumeValues after the super-step that consumed them (single-shot)', async () => {
      // Two interrupts in a row — the second should NOT see the first resume's values.
      let askCalls = 0;
      const graph = new GraphBuilder()
        .addState('seenValues', overwrite<string>(''))
        .addNode('ask', (_state, ctx?: NodeContext): Promise<NodeReturn> => {
          askCalls += 1;
          const seen = JSON.stringify(ctx?.resumeValues ?? {});
          if (askCalls === 1) return Promise.resolve(interrupt('q1', 'first'));
          if (askCalls === 2) {
            // Second call is the resume — should see {q1: 'A'}.
            return Promise.resolve({ seenValues: seen });
          }
          return Promise.resolve({});
        })
        .addEdge(START, 'ask')
        .addEdge('ask', END)
        .compile();
      if (!graph.ok) return;

      const store = new InMemoryCheckpointStore();
      const first = await executeGraph(
        graph.value,
        {},
        {
          checkpointStore: store,
          executionId: 'exec-single-shot',
        }
      );
      if (!first.ok) return;
      const checkpointId = first.value.halted?.checkpointId;
      if (checkpointId === undefined) return;

      const resumed = await resumeFromCheckpoint(
        graph.value,
        checkpointId,
        { q1: 'A' },
        { checkpointStore: store }
      );
      if (!resumed.ok) return;
      expect(resumed.value.finalState['seenValues']).toBe('{"q1":"A"}');
    });
  });
});

// ============================================================================
// The event stream must not report a paused run as a finished one
// ============================================================================

describe('interrupt events', () => {
  // `emitNodeResults` had `if failed → node_error, else → node_completed`, and
  // `NodeResult.status` is four-way. So an `interrupted` node — `stateUpdates:
  // {}`, nothing produced — was published as "completed in 0ms", and
  // `execution_complete` was emitted BEFORE the halt check, because
  // `runSuperStepLoop` returns `undefined` on the interrupt path exactly as it
  // does when the graph runs out of nodes.
  //
  // These events feed `createGraphAuditBridge`, which writes them into the
  // hash-chained audit trail. `halted` — the truthful marker — lives on the
  // returned `Result`, which an `onEvent` consumer never sees.
  async function runInterruptGraph(): Promise<GraphEvent[]> {
    const graph = new GraphBuilder()
      .addNode('ask', () => Promise.resolve(interrupt('approval', 'Approve?')))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    if (!graph.ok) throw new Error('graph did not compile');

    const events: GraphEvent[] = [];
    await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: new InMemoryCheckpointStore(),
        executionId: 'exec-events',
        onEvent: (e) => events.push(e),
      }
    );
    return events;
  }

  it('does not report the interrupted node as completed', async () => {
    const events = await runInterruptGraph();

    expect(events.filter((e) => e.type === 'node_completed' && e.nodeId === 'ask')).toHaveLength(0);
  });

  it('reports it as not completed, naming the reason', async () => {
    const events = await runInterruptGraph();
    const notCompleted = events.find((e) => e.type === 'node_not_completed');

    expect(notCompleted).toBeDefined();
    if (notCompleted?.type === 'node_not_completed') {
      expect(notCompleted.nodeId).toBe('ask');
      expect(notCompleted.reason).toBe('interrupted');
    }
  });

  it('marks the completion event as halted', async () => {
    const events = await runInterruptGraph();
    const complete = events.find((e) => e.type === 'execution_complete');

    expect(complete).toBeDefined();
    if (complete?.type === 'execution_complete') expect(complete.halted).toBe(true);
  });

  it('leaves a graph that finishes reporting an unqualified completion', async () => {
    // The pair. Without it, always setting `halted` would pass — and every
    // finished run would read as paused.
    const graph = new GraphBuilder()
      .addNode('work', () => Promise.resolve({ done: true }))
      .addEdge(START, 'work')
      .addEdge('work', END)
      .compile();
    if (!graph.ok) throw new Error('graph did not compile');

    const events: GraphEvent[] = [];
    await executeGraph(
      graph.value,
      {},
      { executionId: 'exec-clean', onEvent: (e) => events.push(e) }
    );

    const complete = events.find((e) => e.type === 'execution_complete');
    if (complete?.type === 'execution_complete') expect(complete.halted).toBeUndefined();
    expect(events.some((e) => e.type === 'node_completed' && e.nodeId === 'work')).toBe(true);
    expect(events.some((e) => e.type === 'node_not_completed')).toBe(false);
  });
});
