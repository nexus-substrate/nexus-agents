/** Authority follows real callback settlement, including synchronous throws. */
import { describe, expect, it } from 'vitest';
import { GraphBuilder, START, END } from '../orchestration/graph/index.js';
import type { CompiledGraph, GraphNode } from '../orchestration/graph/graph-types.js';
import { ok } from '../core/result.js';
import { PipelineCallbackTracker } from './pipeline-callback-tracker.js';

function testGraph(): CompiledGraph {
  const compiled = new GraphBuilder()
    .addNode('worker', () => Promise.resolve({}))
    .addEdge(START, 'worker')
    .addEdge('worker', END)
    .compile();
  if (!compiled.ok) throw new Error('Invalid test graph');
  return compiled.value;
}

describe('PipelineCallbackTracker', () => {
  it('preserves the node receiver, options and original graph', async () => {
    const node: GraphNode = {
      id: 'worker',
      timeout: 42,
      retries: 2,
      handler(this: GraphNode) {
        return Promise.resolve({ observedNode: this.id });
      },
    };
    const original = { ...testGraph(), nodes: new Map([['worker', node]]) };
    const tracker = new PipelineCallbackTracker(original);
    const wrapped = tracker.graph.nodes.get(node.id);
    if (wrapped === undefined) throw new Error('Missing measured node');
    const pending = wrapped.handler({});
    expect(tracker.pendingCount).toBe(1);
    expect(await pending).toEqual({ observedNode: 'worker' });
    expect(tracker.pendingCount).toBe(0);
    expect(original.nodes.get(node.id)).toBe(node);
    expect(wrapped.timeout).toBe(42);
    expect(wrapped.retries).toBe(2);
  });

  it('accounts for pending precondition and verification promises independently', async () => {
    let release: () => void = () => {
      throw new Error('Missing barrier');
    };
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const graph = testGraph();
    const original = graph.nodes.get('worker');
    if (original === undefined) throw new Error('Missing original node');
    const tracker = new PipelineCallbackTracker({
      ...graph,
      nodes: new Map([
        [
          'worker',
          {
            ...original,
            preconditions: [
              {
                name: 'pending',
                hook: async () => {
                  await barrier;
                  return ok(undefined);
                },
              },
            ],
            verify: async () => {
              await barrier;
              return ok(undefined);
            },
          },
        ],
      ]),
    });
    const node = tracker.graph.nodes.get('worker');
    const precondition = node?.preconditions?.[0];
    if (node?.verify === undefined || precondition === undefined) throw new Error('Missing hooks');
    const context = { nodeId: 'worker', state: {}, stepNumber: 0 };
    const pending = [precondition.hook(context), node.verify(context)];
    expect(tracker.pendingCount).toBe(2);
    release();
    await Promise.all(pending);
    expect(tracker.pendingCount).toBe(0);
  });

  it('releases its measurement when a callback throws synchronously', async () => {
    const graph = testGraph();
    const original = graph.nodes.get('worker');
    if (original === undefined) throw new Error('Missing original node');
    const tracker = new PipelineCallbackTracker({
      ...graph,
      nodes: new Map([
        [
          'worker',
          {
            ...original,
            handler: (): Promise<Record<string, unknown>> => {
              throw new Error('Settled failure');
            },
          },
        ],
      ]),
    });
    const node = tracker.graph.nodes.get('worker');
    if (node === undefined) throw new Error('Missing callback');
    await expect(node.handler({})).rejects.toThrow('Settled failure');
    expect(tracker.pendingCount).toBe(0);
  });
});
