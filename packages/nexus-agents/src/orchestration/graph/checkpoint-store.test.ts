/**
 * Tests for CheckpointStore — durable execution state persistence.
 *
 * (Source: Issue #833 — Orchestrator checkpointing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
} from './checkpoint-store.js';
import type { Checkpoint } from './checkpoint-types.js';
import { CHECKPOINT_SCHEMA_VERSION } from './checkpoint-types.js';

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return createCheckpoint({
    executionId: overrides.executionId ?? 'exec-1',
    stepNumber: overrides.stepNumber ?? 1,
    state: overrides.state ?? { value: 42 },
    pendingNodeIds: overrides.pendingNodeIds ?? ['nodeB'],
    completedResults: overrides.completedResults ?? [
      { nodeId: 'nodeA', stateUpdates: { value: 42 }, durationMs: 10, status: 'success' },
    ],
    ...(overrides.metadata !== undefined ? { metadata: overrides.metadata } : {}),
  });
}

describe('InMemoryCheckpointStore', () => {
  let store: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  describe('save and load', () => {
    it('saves and loads a checkpoint', () => {
      const cp = makeCheckpoint();
      store.save(cp);

      const loaded = store.load(cp.id);
      expect(loaded).toBeDefined();
      expect(loaded?.executionId).toBe('exec-1');
      expect(loaded?.state).toEqual({ value: 42 });
      expect(loaded?.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    });

    it('returns undefined for non-existent checkpoint', () => {
      expect(store.load('nonexistent')).toBeUndefined();
    });

    it('overwrites existing checkpoint with same ID', () => {
      const cp1 = makeCheckpoint();
      store.save(cp1);

      const cp2 = { ...cp1, state: { value: 99 } };
      store.save(cp2);

      const loaded = store.load(cp1.id);
      expect(loaded?.state).toEqual({ value: 99 });
    });
  });

  describe('latest', () => {
    it('returns the most recent checkpoint for an execution', () => {
      const cp1 = makeCheckpoint({ stepNumber: 1 });
      const cp2 = makeCheckpoint({ stepNumber: 2 });
      store.save(cp1);
      store.save(cp2);

      const latest = store.latest('exec-1');
      expect(latest?.stepNumber).toBe(2);
    });

    it('returns undefined for unknown execution', () => {
      expect(store.latest('unknown')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns summaries for an execution', () => {
      store.save(makeCheckpoint({ stepNumber: 1 }));
      store.save(makeCheckpoint({ stepNumber: 2 }));

      const summaries = store.list('exec-1');
      expect(summaries).toHaveLength(2);
      expect(summaries[0]?.stepNumber).toBe(1);
      expect(summaries[1]?.stepNumber).toBe(2);
      expect(summaries[0]?.completedNodeCount).toBe(1);
      expect(summaries[0]?.pendingNodeCount).toBe(1);
    });

    it('returns empty array for unknown execution', () => {
      expect(store.list('unknown')).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('deletes a specific checkpoint', () => {
      const cp = makeCheckpoint();
      store.save(cp);
      expect(store.size()).toBe(1);

      const deleted = store.delete(cp.id);
      expect(deleted).toBe(true);
      expect(store.size()).toBe(0);
      expect(store.load(cp.id)).toBeUndefined();
    });

    it('returns false for non-existent checkpoint', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('deleteExecution', () => {
    it('deletes all checkpoints for an execution', () => {
      store.save(makeCheckpoint({ stepNumber: 1 }));
      store.save(makeCheckpoint({ stepNumber: 2 }));
      store.save(makeCheckpoint({ executionId: 'exec-2', stepNumber: 1 }));

      const count = store.deleteExecution('exec-1');
      expect(count).toBe(2);
      expect(store.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all checkpoints', () => {
      store.save(makeCheckpoint());
      store.save(makeCheckpoint({ executionId: 'exec-2' }));
      expect(store.size()).toBe(2);

      store.clear();
      expect(store.size()).toBe(0);
    });
  });

  describe('bounds enforcement', () => {
    it('evicts oldest checkpoints when per-execution limit exceeded', () => {
      // Save more than MAX_CHECKPOINTS_PER_EXECUTION (50) for one execution
      for (let i = 0; i < 55; i++) {
        store.save(makeCheckpoint({ stepNumber: i }));
      }

      const summaries = store.list('exec-1');
      expect(summaries.length).toBeLessThanOrEqual(50);
    });

    it('evicts oldest execution when global limit exceeded', () => {
      // Save one checkpoint per execution for 105 executions
      for (let i = 0; i < 105; i++) {
        store.save(makeCheckpoint({ executionId: `exec-${String(i)}` }));
      }

      // Should be bounded
      expect(store.size()).toBeLessThanOrEqual(100);
    });
  });

  describe('createCheckpointStore factory', () => {
    it('creates an InMemoryCheckpointStore', () => {
      const s = createCheckpointStore();
      expect(s.size()).toBe(0);

      const cp = makeCheckpoint();
      s.save(cp);
      expect(s.size()).toBe(1);
    });
  });

  describe('createCheckpoint factory', () => {
    it('creates a checkpoint with schema version', () => {
      const cp = createCheckpoint({
        executionId: 'test-exec',
        stepNumber: 3,
        state: { count: 10 },
        pendingNodeIds: ['next'],
        completedResults: [],
      });

      expect(cp.executionId).toBe('test-exec');
      expect(cp.stepNumber).toBe(3);
      expect(cp.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
      expect(cp.id).toContain('cp-test-exec');
      expect(cp.createdAt).toBeDefined();
    });

    it('copies state to prevent mutation', () => {
      const state = { value: 1 };
      const cp = createCheckpoint({
        executionId: 'test',
        stepNumber: 1,
        state,
        pendingNodeIds: [],
        completedResults: [],
      });

      state.value = 999;
      expect(cp.state['value']).toBe(1); // Not mutated
    });
  });
});
