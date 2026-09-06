/**
 * Tests for graph HITL Phase 2 hardening (#2425).
 *
 * Covers:
 *   - Command.goto wiring (#2425 sub-task 1)
 *   - Multi-interrupt-per-super-step observability (#2425 sub-task 2)
 *   - Resume idempotency (#2425 sub-task 3)
 *   - Resume failure path contract (#2425 sub-task 4)
 *   - resumeValues Zod validation (#2425 sub-task 5)
 *   - Status-leak audit safety (#2425 sub-task 6)
 *
 * Phase 1 contract surface is exercised in graph-executor-hitl.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { GraphBuilder, overwrite, START, END } from './graph-builder.js';
import { executeGraph, resumeFromCheckpoint } from './graph-executor.js';
import { interrupt } from './graph-types.js';
import type { NodeContext, NodeReturn } from './graph-types.js';
import { InMemoryCheckpointStore } from './checkpoint-store.js';

describe('Command.goto (#2425 sub-task 1)', () => {
  it('redirects the next runnable set to the goto target instead of resolving edges', async () => {
    const graph = new GraphBuilder()
      .addState('trail', overwrite<string>(''))
      .addNode('a', () =>
        Promise.resolve({
          type: 'command' as const,
          update: { trail: 'a' },
          goto: 'c',
        })
      )
      .addNode('b', (state) => Promise.resolve({ trail: `${(state['trail'] as string) || ''}+b` }))
      .addNode('c', (state) => Promise.resolve({ trail: `${(state['trail'] as string) || ''}+c` }))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      // b -> c exists only to satisfy static reachability: the builder rejects a
      // node reachable ONLY through a runtime `Command.goto` as unreachable, and
      // there is no way to declare a goto target (#5727). b never runs here, so
      // the edge does not weaken what this test measures.
      .addEdge('b', 'c')
      .addEdge('b', END)
      .addEdge('c', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Without goto: trail would be 'a+b'. With goto to c: trail is 'a+c'; b never runs.
    expect(result.value.finalState['trail']).toBe('a+c');
    expect(result.value.nodeResults.find((r) => r.nodeId === 'b')).toBeUndefined();
    expect(result.value.nodeResults.find((r) => r.nodeId === 'c')).toBeDefined();
  });

  it('logs and ignores goto targets that are not in the compiled graph', async () => {
    const graph = new GraphBuilder()
      .addState('trail', overwrite<string>(''))
      .addNode('a', () =>
        Promise.resolve({ type: 'command' as const, update: { trail: 'a' }, goto: 'nonexistent' })
      )
      .addNode('b', (state) => Promise.resolve({ trail: `${(state['trail'] as string) || ''}+b` }))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      .addEdge('b', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Invalid target ignored — falls back to standard edge resolution: a → b.
    expect(result.value.finalState['trail']).toBe('a+b');
  });
});

describe('Multi-interrupt observability (#2425 sub-task 2)', () => {
  // eslint-disable-next-line complexity -- many sequential narrowing checks
  it('records primary + additional interrupts when two nodes interrupt in the same super-step', async () => {
    const graph = new GraphBuilder()
      .addState('seed', overwrite(0))
      .addNode('one', () => Promise.resolve(interrupt('q-one', 'first?')))
      .addNode('two', () => Promise.resolve(interrupt('q-two', 'second?')))
      .addEdge(START, 'one')
      .addEdge(START, 'two')
      .addEdge('one', END)
      .addEdge('two', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const result = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'multi-1',
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.halted).toBeDefined();
    const checkpoint = store.latest('multi-1');
    expect(checkpoint?.interrupt).toBeDefined();
    expect(checkpoint?.interrupt?.additionalInterrupts?.length).toBe(1);
    // The additional interrupt should be the one that wasn't picked as primary.
    const primaryNodeId = result.value.halted?.nodeId;
    const additionalNodeId = checkpoint?.interrupt?.additionalInterrupts?.[0]?.nodeId;
    expect(['one', 'two']).toContain(primaryNodeId);
    expect(['one', 'two']).toContain(additionalNodeId);
    expect(primaryNodeId).not.toBe(additionalNodeId);
  });

  it('omits additionalInterrupts when only one node interrupted', async () => {
    const graph = new GraphBuilder()
      .addNode('only', () => Promise.resolve(interrupt('q', 'ctx')))
      .addEdge(START, 'only')
      .addEdge('only', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const result = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'multi-2',
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const checkpoint = store.latest('multi-2');
    expect(checkpoint?.interrupt?.additionalInterrupts).toBeUndefined();
  });
});

describe('Resume idempotency (#2425 sub-task 3)', () => {
  it('rejects a second resume against the same checkpoint', async () => {
    let askCalls = 0;
    const graph = new GraphBuilder()
      .addState('answer', overwrite<string | undefined>(undefined))
      .addNode('ask', (_state, ctx?: NodeContext): Promise<NodeReturn> => {
        askCalls += 1;
        const supplied = ctx?.resumeValues['approval'];
        if (typeof supplied === 'string') {
          return Promise.resolve({ answer: supplied });
        }
        return Promise.resolve(interrupt('approval', 'go?'));
      })
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'idem-1',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    const firstResume = await resumeFromCheckpoint(
      graph.value,
      checkpointId,
      {
        approval: 'yes',
      },
      { checkpointStore: store }
    );
    expect(firstResume.ok).toBe(true);

    const secondResume = await resumeFromCheckpoint(
      graph.value,
      checkpointId,
      {
        approval: 'yes',
      },
      { checkpointStore: store }
    );
    expect(secondResume.ok).toBe(false);
    if (secondResume.ok) return;
    expect(secondResume.error.message).toContain('already resumed');
    // The handler should NOT have been called a third time (1 initial + 1 successful resume).
    expect(askCalls).toBe(2);
  });

  it('marks the checkpoint with a consumedAt timestamp on successful resume', async () => {
    const graph = new GraphBuilder()
      .addState('answer', overwrite<string | undefined>(undefined))
      .addNode('ask', (_state, ctx?: NodeContext): Promise<NodeReturn> => {
        const supplied = ctx?.resumeValues['approval'];
        if (typeof supplied === 'string') return Promise.resolve({ answer: supplied });
        return Promise.resolve(interrupt('approval', 'go?'));
      })
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'idem-2',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    expect(store.load(checkpointId)?.interrupt?.consumedAt).toBeUndefined();
    await resumeFromCheckpoint(
      graph.value,
      checkpointId,
      { approval: 'yes' },
      {
        checkpointStore: store,
      }
    );
    expect(store.load(checkpointId)?.interrupt?.consumedAt).toBeTypeOf('string');
  });
});

describe('Resume failure path (#2425 sub-task 4)', () => {
  it('returns a NodeResult with status=failed when the resumed node throws', async () => {
    const graph = new GraphBuilder()
      .addNode('ask', (_state, ctx?: NodeContext): Promise<NodeReturn> => {
        const supplied = ctx?.resumeValues['q'];
        if (supplied !== undefined) {
          throw new Error('post-resume boom');
        }
        return Promise.resolve(interrupt('q', 'ctx'));
      })
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'throw-1',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    const resumed = await resumeFromCheckpoint(
      graph.value,
      checkpointId,
      { q: 'value' },
      {
        checkpointStore: store,
      }
    );
    expect(resumed.ok).toBe(true); // Top-level executeGraph returns ok; failure is per-node.
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    // nodeResults is cumulative across original-run + resumed-run; use the
    // last entry for 'ask' to read the post-resume outcome.
    const askResults = resumed.value.nodeResults.filter((r) => r.nodeId === 'ask');
    expect(askResults.length).toBe(2);
    expect(askResults[0]?.status).toBe('interrupted');
    expect(askResults[1]?.status).toBe('failed');
    expect(askResults[1]?.error).toContain('post-resume boom');
  });
});

describe('resumeValues Zod validation (#2425 sub-task 5)', () => {
  it('rejects non-object resumeValues (array)', async () => {
    const graph = new GraphBuilder()
      .addNode('ask', () => Promise.resolve(interrupt('q', 'ctx')))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'zod-1',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    // Pass an array instead of a record.
    const resumed = await resumeFromCheckpoint(graph.value, checkpointId, ['nope'], {
      checkpointStore: store,
    });
    expect(resumed.ok).toBe(false);
    if (resumed.ok) return;
    expect(resumed.error.message).toContain('failed validation');
  });

  it('rejects null resumeValues', async () => {
    const graph = new GraphBuilder()
      .addNode('ask', () => Promise.resolve(interrupt('q', 'ctx')))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'zod-2',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    const resumed = await resumeFromCheckpoint(graph.value, checkpointId, null, {
      checkpointStore: store,
    });
    expect(resumed.ok).toBe(false);
  });

  it('accepts a plain object with arbitrary value shapes', async () => {
    const graph = new GraphBuilder()
      .addState('answer', overwrite<unknown>(undefined))
      .addNode('ask', (_state, ctx?: NodeContext): Promise<NodeReturn> => {
        const supplied = ctx?.resumeValues['q'];
        if (supplied !== undefined) return Promise.resolve({ answer: supplied });
        return Promise.resolve(interrupt('q', 'ctx'));
      })
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const store = new InMemoryCheckpointStore();
    const first = await executeGraph(
      graph.value,
      {},
      {
        checkpointStore: store,
        executionId: 'zod-3',
      }
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const checkpointId = first.value.halted?.checkpointId;
    if (checkpointId === undefined) return;

    const resumed = await resumeFromCheckpoint(
      graph.value,
      checkpointId,
      { q: { nested: { object: true } } },
      { checkpointStore: store }
    );
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.finalState['answer']).toEqual({ nested: { object: true } });
  });
});

describe('Status-leak audit (#2425 sub-task 6)', () => {
  it('keeps NodeResult.status === "interrupted" inside graph land — coercion is the consumer\'s job', async () => {
    // Defense-in-depth check: the graph executor preserves the precise
    // 'interrupted' status. Downstream consumers (pipeline-runner,
    // scenario-live-executor) coerce to 'skipped' for their 3-state contract,
    // and that coercion lives at their boundary — NOT in graph code.
    const graph = new GraphBuilder()
      .addNode('ask', () => Promise.resolve(interrupt('q', 'ctx')))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const askResult = result.value.nodeResults.find((r) => r.nodeId === 'ask');
    expect(askResult?.status).toBe('interrupted');
    // Sanity: 'interrupted' is distinguishable from 'skipped' at this layer.
    expect(askResult?.status).not.toBe('skipped');
  });

  it('preserves the Interrupt envelope on NodeResult so downstream auditors can trace pause origins', async () => {
    const graph = new GraphBuilder()
      .addNode('gate', () =>
        Promise.resolve(interrupt('require-human', 'sensitive: validate identity'))
      )
      .addEdge(START, 'gate')
      .addEdge('gate', END)
      .compile();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateResult = result.value.nodeResults.find((r) => r.nodeId === 'gate');
    expect(gateResult?.interrupt?.id).toBe('require-human');
    expect(gateResult?.interrupt?.value).toBe('sensitive: validate identity');
  });
});
