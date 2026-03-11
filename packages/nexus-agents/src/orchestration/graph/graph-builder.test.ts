/**
 * Tests for GraphBuilder — compile-time validation of graph workflows.
 *
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import { describe, it, expect } from 'vitest';
import { GraphBuilder, overwrite, append, customReducer, START, END } from './graph-builder.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const noop = () => Promise.resolve({});

describe('GraphBuilder', () => {
  describe('compile — happy paths', () => {
    it('compiles a linear graph (START → A → B → END)', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nodes.size).toBe(2);
      expect(result.value.edges).toHaveLength(3);
      expect(result.value.entryEdges).toHaveLength(1);
    });

    it('compiles a fan-out graph (START → [A, B] → C → END)', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addNode('C', noop)
        .addEdge(START, 'A')
        .addEdge(START, 'B')
        .addEdge('A', 'C')
        .addEdge('B', 'C')
        .addEdge('C', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entryEdges).toHaveLength(2);
    });

    it('compiles a graph with conditional edges', () => {
      const router = (state: Record<string, unknown>): string =>
        state['urgent'] === true ? 'fast' : 'slow';

      const result = new GraphBuilder()
        .addNode('classify', noop)
        .addNode('fast', noop)
        .addNode('slow', noop)
        .addEdge(START, 'classify')
        .addConditionalEdge('classify', router, ['fast', 'slow'])
        .addEdge('fast', END)
        .addEdge('slow', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.edges).toHaveLength(4);
    });

    it('compiles with state schema', () => {
      const result = new GraphBuilder()
        .addState('messages', append<string>())
        .addState('count', overwrite(0))
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stateSchema['messages']).toBeDefined();
      expect(result.value.stateSchema['count']).toBeDefined();
    });

    it('compiles single-node graph (START → A → END)', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(true);
    });
  });

  describe('compile — error paths', () => {
    it('rejects graph with no START edge', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge('A', 'B')
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('no_entry');
    });

    it('rejects edge referencing non-existent node', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B') // B doesn't exist
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('missing_node');
      expect(result.error).toHaveProperty('nodeId', 'B');
    });

    it('rejects conditional edge with missing target', () => {
      const router = (): string => 'missing';

      const result = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addConditionalEdge('A', router, ['missing'])
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('missing_node');
    });

    it('rejects cycle in fixed edges (A → B → A)', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('B', 'A')
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('cycle_detected');
    });

    it('rejects unreachable node', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop) // B is unreachable
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('unreachable_node');
      expect(result.error).toHaveProperty('nodeId', 'B');
    });
  });

  describe('addNode options', () => {
    it('passes timeout and retries to compiled node', () => {
      const result = new GraphBuilder()
        .addNode('A', noop, { timeout: 5000, retries: 3 })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const node = result.value.nodes.get('A');
      expect(node?.timeout).toBe(5000);
      expect(node?.retries).toBe(3);
    });

    it('passes preconditions and verify hook', () => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const verifyHook = () => Promise.resolve();
      const preconditions = [{ check: 'always' as const }];
      const result = new GraphBuilder()
        .addNode('A', noop, {
          preconditions:
            preconditions as unknown as readonly import('./graph-types.js').PreconditionConfig[],
          verify: verifyHook as unknown as import('./graph-types.js').NodeHook,
        })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const node = result.value.nodes.get('A');
      expect(node?.preconditions).toBeDefined();
      expect(node?.verify).toBeDefined();
    });
  });

  describe('addEdge with maxTraversals', () => {
    it('sets maxTraversals on edge', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B', { maxTraversals: 3 })
        .addEdge('B', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const abEdge = result.value.edges.find(
        (e) => e.type === 'fixed' && e.from === 'A' && e.to === 'B'
      );
      expect(abEdge).toHaveProperty('maxTraversals', 3);
    });
  });

  describe('conditional edge from START', () => {
    it('compiles graph with conditional START edge', () => {
      const router = (): string => 'A';
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addConditionalEdge(START, router, ['A', 'B'])
        .addEdge('A', END)
        .addEdge('B', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entryEdges).toHaveLength(1);
      expect(result.value.nodes.size).toBe(2);
    });
  });

  describe('compile — edge from missing source node', () => {
    it('rejects edge from non-existent source node', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addEdge('ghost', 'A') // ghost doesn't exist
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe('missing_node');
      expect(result.error).toHaveProperty('nodeId', 'ghost');
    });
  });

  describe('compile — conditional edge target END', () => {
    it('allows conditional edge with END as declared target', () => {
      const router = (): string => END;
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addEdge(START, 'A')
        .addConditionalEdge('A', router, [END])
        .compile();

      expect(result.ok).toBe(true);
    });
  });

  describe('compile — DFS visited early return', () => {
    it('handles diamond graph (A→B, A→C, B→D, C→D) without false cycle', () => {
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('B', noop)
        .addNode('C', noop)
        .addNode('D', noop)
        .addEdge(START, 'A')
        .addEdge('A', 'B')
        .addEdge('A', 'C')
        .addEdge('B', 'D')
        .addEdge('C', 'D')
        .addEdge('D', END)
        .compile();

      expect(result.ok).toBe(true);
    });
  });

  describe('compile — duplicate node overwrite', () => {
    it('last addNode call wins for duplicate IDs', () => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const handler2 = () => Promise.resolve({ replaced: true });
      const result = new GraphBuilder()
        .addNode('A', noop)
        .addNode('A', handler2) // overwrites first
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nodes.get('A')?.handler).toBe(handler2);
    });
  });

  describe('state reducer helpers', () => {
    it('overwrite creates an overwrite reducer', () => {
      const schema = overwrite('default');
      expect(schema.defaultValue).toBe('default');
      expect(schema.reducer.type).toBe('overwrite');
    });

    it('append creates an append reducer', () => {
      const schema = append<string>();
      expect(schema.defaultValue).toEqual([]);
      expect(schema.reducer.type).toBe('append');
    });

    it('append with initial value', () => {
      const schema = append<number>([1, 2]);
      expect(schema.defaultValue).toEqual([1, 2]);
    });

    it('customReducer creates a custom reducer', () => {
      const merge = (a: number, b: number): number => a + b;
      const schema = customReducer(0, merge);
      expect(schema.defaultValue).toBe(0);
      expect(schema.reducer.type).toBe('custom');
    });
  });
});
