import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkerCheckpointStore,
  createCheckpoint,
  type WorkerCheckpoint,
} from './worker-checkpoint.js';

// ============================================================================
// createCheckpoint
// ============================================================================

describe('createCheckpoint', () => {
  it('creates checkpoint with role and subTask', () => {
    const cp = createCheckpoint('code', 'Implement auth');
    expect(cp.role).toBe('code');
    expect(cp.subTask).toBe('Implement auth');
    expect(cp.partialOutput).toBe('');
    expect(cp.elapsedMs).toBe(0);
    expect(cp.timestamp).toBeGreaterThan(0);
  });

  it('accepts optional partial output', () => {
    const cp = createCheckpoint('testing', 'Write tests', 'partial result');
    expect(cp.partialOutput).toBe('partial result');
  });
});

// ============================================================================
// WorkerCheckpointStore
// ============================================================================

describe('WorkerCheckpointStore', () => {
  let store: WorkerCheckpointStore;

  beforeEach(() => {
    store = new WorkerCheckpointStore();
  });

  it('saves and retrieves a checkpoint', () => {
    const cp = createCheckpoint('code', 'task');
    store.save('worker-1', cp);
    expect(store.get('worker-1')).toEqual(cp);
  });

  it('returns undefined for missing key', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('overwrites existing checkpoint', () => {
    store.save('w1', createCheckpoint('code', 'task1'));
    const cp2 = createCheckpoint('code', 'task2', 'output');
    store.save('w1', cp2);
    expect(store.get('w1')?.subTask).toBe('task2');
  });

  it('clears all checkpoints', () => {
    store.save('w1', createCheckpoint('code', 't1'));
    store.save('w2', createCheckpoint('testing', 't2'));
    store.clear();
    expect(store.get('w1')).toBeUndefined();
    expect(store.get('w2')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('tracks size correctly', () => {
    expect(store.size).toBe(0);
    store.save('w1', createCheckpoint('code', 't1'));
    expect(store.size).toBe(1);
    store.save('w2', createCheckpoint('testing', 't2'));
    expect(store.size).toBe(2);
  });

  it('removes a specific checkpoint', () => {
    store.save('w1', createCheckpoint('code', 't1'));
    store.save('w2', createCheckpoint('testing', 't2'));
    store.remove('w1');
    expect(store.get('w1')).toBeUndefined();
    expect(store.get('w2')).toBeDefined();
    expect(store.size).toBe(1);
  });

  it('returns false when removing nonexistent key', () => {
    expect(store.remove('ghost')).toBe(false);
  });

  it('lists all checkpoint keys', () => {
    store.save('w1', createCheckpoint('code', 't1'));
    store.save('w2', createCheckpoint('testing', 't2'));
    const keys = store.keys();
    expect(keys).toContain('w1');
    expect(keys).toContain('w2');
    expect(keys).toHaveLength(2);
  });

  it('truncates partial output beyond limit', () => {
    const longOutput = 'x'.repeat(10_000);
    const cp = createCheckpoint('code', 'task', longOutput);
    store.save('w1', cp);
    const stored = store.get('w1') as WorkerCheckpoint;
    // Store should truncate to MAX_PARTIAL_OUTPUT_CHARS
    expect(stored.partialOutput.length).toBeLessThanOrEqual(4000);
  });

  it('updates elapsed time on checkpoint', () => {
    const cp = createCheckpoint('code', 'task');
    const updated: WorkerCheckpoint = { ...cp, elapsedMs: 5000 };
    store.save('w1', updated);
    expect(store.get('w1')?.elapsedMs).toBe(5000);
  });

  it('enforces max capacity', () => {
    // Fill beyond capacity
    for (let i = 0; i < 60; i++) {
      store.save(`w${String(i)}`, createCheckpoint('code', `task-${String(i)}`));
    }
    // Should cap at MAX_CHECKPOINTS
    expect(store.size).toBeLessThanOrEqual(50);
  });
});
