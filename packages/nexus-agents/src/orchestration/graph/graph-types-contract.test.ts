/**
 * Contract tests for graph orchestration core type exports.
 *
 * Verifies that key interfaces, sentinels, and types are properly
 * exported from the graph module barrel. Catches accidental removals
 * during refactoring.
 *
 * @see Issue #1379
 */

import { describe, it, expect } from 'vitest';
import {
  START,
  END,
  GraphBuilder,
  overwrite,
  append,
  customReducer,
  formatCompileError,
  CHECKPOINT_SCHEMA_VERSION,
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
  executeGraph,
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
  runPreconditions,
  runVerification,
  createStateComparisonVerifier,
  createStateGuard,
} from './index.js';
import type {
  GraphState,
  GraphNode,
  GraphEdge,
  CompiledGraph,
  StateReducer,
  StateFieldSchema,
  NodeHandler,
  NodeResult,
  HookError,
  Checkpoint,
  CheckpointSummary,
  ICheckpointStore,
} from './index.js';

describe('graph-types contract', () => {
  describe('sentinel exports', () => {
    it('START is the __START__ sentinel', () => {
      expect(START).toBe('__START__');
    });

    it('END is the __END__ sentinel', () => {
      expect(END).toBe('__END__');
    });

    it('CHECKPOINT_SCHEMA_VERSION is a positive integer', () => {
      expect(CHECKPOINT_SCHEMA_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(CHECKPOINT_SCHEMA_VERSION)).toBe(true);
    });
  });

  describe('value exports exist', () => {
    it('exports GraphBuilder class', () => {
      expect(GraphBuilder).toBeDefined();
      expect(typeof GraphBuilder).toBe('function');
    });

    it('exports reducer factories', () => {
      expect(typeof overwrite).toBe('function');
      expect(typeof append).toBe('function');
      expect(typeof customReducer).toBe('function');
    });

    it('exports formatCompileError', () => {
      expect(typeof formatCompileError).toBe('function');
    });

    it('exports executeGraph', () => {
      expect(typeof executeGraph).toBe('function');
    });

    it('exports checkpoint utilities', () => {
      expect(typeof InMemoryCheckpointStore).toBe('function');
      expect(typeof createCheckpoint).toBe('function');
      expect(typeof createCheckpointStore).toBe('function');
    });

    it('exports event emitters', () => {
      expect(typeof emitNodeStarted).toBe('function');
      expect(typeof emitNodeResults).toBe('function');
      expect(typeof emitStateUpdated).toBe('function');
      expect(typeof emitStepCompleted).toBe('function');
      expect(typeof emitExecutionComplete).toBe('function');
    });

    it('exports hook utilities', () => {
      expect(typeof runPreconditions).toBe('function');
      expect(typeof runVerification).toBe('function');
      expect(typeof createStateComparisonVerifier).toBe('function');
      expect(typeof createStateGuard).toBe('function');
    });
  });

  describe('type interface contracts', () => {
    it('GraphState is a Record<string, unknown>', () => {
      const state: GraphState = { key: 'value', count: 42 };
      expect(state.key).toBe('value');
    });

    it('GraphNode has required id and handler', () => {
      const handler: NodeHandler = () => Promise.resolve({});
      const node: GraphNode = { id: 'test', handler };
      expect(node.id).toBe('test');
      expect(typeof node.handler).toBe('function');
    });

    it('GraphEdge discriminated union: fixed edge', () => {
      const edge: GraphEdge = { type: 'fixed', from: START, to: 'node1' };
      expect(edge.type).toBe('fixed');
      expect(edge.from).toBe(START);
    });

    it('GraphEdge discriminated union: conditional edge', () => {
      const edge: GraphEdge = {
        type: 'conditional',
        from: 'node1',
        router: () => 'node2',
        targets: ['node2', 'node3'],
      };
      expect(edge.type).toBe('conditional');
      expect(edge.targets).toHaveLength(2);
    });

    it('CompiledGraph has nodes, edges, stateSchema, entryEdges', () => {
      const result = new GraphBuilder()
        .addState('input', overwrite(''))
        .addNode('echo', () => Promise.resolve({}))
        .addEdge(START, 'echo')
        .addEdge('echo', END)
        .compile();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const graph: CompiledGraph = result.value;
      expect(graph.nodes).toBeInstanceOf(Map);
      expect(Array.isArray(graph.edges)).toBe(true);
      expect(graph.stateSchema).toBeDefined();
      expect(Array.isArray(graph.entryEdges)).toBe(true);
    });

    it('StateReducer discriminated union covers overwrite, append, custom', () => {
      const ow: StateReducer = { type: 'overwrite' };
      const ap: StateReducer = { type: 'append' };
      const cu: StateReducer<number> = { type: 'custom', merge: (a, b) => a + b };
      expect(ow.type).toBe('overwrite');
      expect(ap.type).toBe('append');
      expect(cu.type).toBe('custom');
    });

    it('StateFieldSchema has defaultValue and reducer', () => {
      const field: StateFieldSchema<string> = {
        defaultValue: '',
        reducer: { type: 'overwrite' },
      };
      expect(field.defaultValue).toBe('');
    });

    it('NodeResult has nodeId, stateUpdates, durationMs, and status', () => {
      const result: NodeResult = {
        nodeId: 'test',
        stateUpdates: { key: 'value' },
        durationMs: 10,
        status: 'success',
      };
      expect(result.nodeId).toBe('test');
    });

    it('Checkpoint has required fields', () => {
      const checkpoint: Checkpoint = {
        id: 'cp-1',
        executionId: 'exec-1',
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        stepNumber: 0,
        state: {},
        pendingNodeIds: ['node1'],
        completedResults: [],
        createdAt: new Date().toISOString(),
      };
      expect(checkpoint.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    });

    it('CheckpointSummary has lightweight fields', () => {
      const summary: CheckpointSummary = {
        id: 'cp-1',
        executionId: 'exec-1',
        stepNumber: 0,
        createdAt: new Date().toISOString(),
        completedNodeCount: 0,
        pendingNodeCount: 1,
      };
      expect(summary.pendingNodeCount).toBe(1);
    });

    it('ICheckpointStore interface methods', () => {
      const store: ICheckpointStore = createCheckpointStore();
      expect(typeof store.save).toBe('function');
      expect(typeof store.load).toBe('function');
      expect(typeof store.latest).toBe('function');
      expect(typeof store.list).toBe('function');
      expect(typeof store.delete).toBe('function');
      expect(typeof store.deleteExecution).toBe('function');
      expect(typeof store.size).toBe('function');
      expect(typeof store.clear).toBe('function');
    });

    it('HookError has hookName, nodeId, message', () => {
      const hookError: HookError = {
        hookName: 'test-hook',
        nodeId: 'node1',
        message: 'failed',
      };
      expect(hookError.hookName).toBe('test-hook');
    });
  });

  describe('reducer factories produce correct shapes', () => {
    it('overwrite() returns StateFieldSchema with overwrite reducer', () => {
      const field = overwrite('default');
      expect(field.defaultValue).toBe('default');
      expect(field.reducer.type).toBe('overwrite');
    });

    it('append() returns StateFieldSchema with append reducer', () => {
      const field = append<string>();
      expect(Array.isArray(field.defaultValue)).toBe(true);
      expect(field.reducer.type).toBe('append');
    });

    it('customReducer() returns StateFieldSchema with custom reducer', () => {
      const field = customReducer(0, (a: number, b: number) => a + b);
      expect(field.defaultValue).toBe(0);
      expect(field.reducer.type).toBe('custom');
    });
  });

  describe('InMemoryCheckpointStore round-trip', () => {
    it('save and load preserves checkpoint data', () => {
      const store = new InMemoryCheckpointStore();
      const checkpoint: Checkpoint = {
        id: 'cp-test',
        executionId: 'exec-test',
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        stepNumber: 2,
        state: { count: 42, name: 'test' },
        pendingNodeIds: ['node-a'],
        completedResults: [
          { nodeId: 'node-b', stateUpdates: {}, durationMs: 5, status: 'success' as const },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      store.save(checkpoint);
      const loaded = store.load('cp-test');
      expect(loaded).toEqual(checkpoint);
    });

    it('latest returns most recent checkpoint for execution', () => {
      const store = new InMemoryCheckpointStore();
      const base = {
        executionId: 'exec-1',
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        state: {},
        pendingNodeIds: [],
        completedResults: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      store.save({ ...base, id: 'cp-1', stepNumber: 0 });
      store.save({ ...base, id: 'cp-2', stepNumber: 1 });

      const latest = store.latest('exec-1');
      expect(latest?.id).toBe('cp-2');
      expect(latest?.stepNumber).toBe(1);
    });
  });
});
