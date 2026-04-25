/**
 * ArtifactStore tests (Issue #912, Phase 4-3)
 *
 * Tests put, get, query, provenance, bounds, and LRU eviction.
 */
import { describe, it, expect } from 'vitest';

import {
  ArtifactStore,
  getPipelineArtifactStore,
  resetPipelineArtifactStore,
  CheckpointStore,
  getCheckpointStore,
  resetCheckpointStore,
} from './artifact-store.js';
import type { Artifact, IArtifactStore, StageCheckpoint } from './artifact-store.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `art-${String(Date.now())}`,
    type: 'code',
    content: 'function hello() {}',
    metadata: {},
    createdBy: 'nexus:test-plugin',
    createdAt: Date.now(),
    inputRefs: [],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ArtifactStore', () => {
  describe('put', () => {
    it('stores an artifact and returns ref', () => {
      const store = new ArtifactStore();
      const ref = store.put(makeArtifact({ id: 'a1' }));
      expect(ref.id).toBe('a1');
      expect(ref.type).toBe('code');
    });

    it('rejects oversized content', () => {
      const store = new ArtifactStore({ maxContentSize: 10 });
      const big = makeArtifact({
        id: 'big',
        content: 'x'.repeat(100),
      });
      expect(() => store.put(big)).toThrow('exceeds');
    });
  });

  describe('get', () => {
    it('retrieves stored artifact', () => {
      const store = new ArtifactStore();
      const artifact = makeArtifact({ id: 'g1' });
      store.put(artifact);
      const result = store.get({ id: 'g1', type: 'code' });
      expect(result).toBeDefined();
      expect(result?.id).toBe('g1');
    });

    it('returns undefined for missing artifact', () => {
      const store = new ArtifactStore();
      expect(store.get({ id: 'missing', type: 'code' })).toBeUndefined();
    });
  });

  describe('query', () => {
    it('filters by artifact type', () => {
      const store = new ArtifactStore();
      store.put(makeArtifact({ id: 'c1', type: 'code' }));
      store.put(makeArtifact({ id: 'r1', type: 'review' }));
      store.put(makeArtifact({ id: 'c2', type: 'code' }));
      const refs = store.query({ type: 'code' });
      expect(refs).toHaveLength(2);
    });

    it('filters by creator', () => {
      const store = new ArtifactStore();
      store.put(makeArtifact({ id: 'a1', createdBy: 'plugin-a' }));
      store.put(makeArtifact({ id: 'a2', createdBy: 'plugin-b' }));
      const refs = store.query({ createdBy: 'plugin-a' });
      expect(refs).toHaveLength(1);
    });

    it('returns all with empty filter', () => {
      const store = new ArtifactStore();
      store.put(makeArtifact({ id: 'x1' }));
      store.put(makeArtifact({ id: 'x2' }));
      expect(store.query({})).toHaveLength(2);
    });
  });

  describe('provenance', () => {
    it('returns provenance entry for artifact', () => {
      const store = new ArtifactStore();
      store.put(
        makeArtifact({
          id: 'p1',
          createdBy: 'nexus:analyzer',
          inputRefs: [{ id: 'input-1', type: 'spec' }],
        })
      );
      const chain = store.provenance({ id: 'p1', type: 'code' });
      expect(chain).toHaveLength(1);
      expect(chain[0]?.plugin).toBe('nexus:analyzer');
      expect(chain[0]?.inputArtifacts).toContain('input-1');
    });

    it('returns empty for missing artifact', () => {
      const store = new ArtifactStore();
      expect(store.provenance({ id: 'nope', type: 'code' })).toHaveLength(0);
    });
  });

  describe('bounds and eviction', () => {
    it('evicts oldest when max artifacts exceeded', () => {
      const store = new ArtifactStore({ maxArtifacts: 3 });
      store.put(makeArtifact({ id: 'e1' }));
      store.put(makeArtifact({ id: 'e2' }));
      store.put(makeArtifact({ id: 'e3' }));
      store.put(makeArtifact({ id: 'e4' }));
      expect(store.get({ id: 'e1', type: 'code' })).toBeUndefined();
      expect(store.get({ id: 'e4', type: 'code' })).toBeDefined();
    });

    it('respects size property', () => {
      const store = new ArtifactStore();
      store.put(makeArtifact({ id: 's1' }));
      store.put(makeArtifact({ id: 's2' }));
      expect(store.size).toBe(2);
    });

    it('re-putting the same id keeps store.size stable', () => {
      const store = new ArtifactStore({ maxArtifacts: 3 });
      store.put(makeArtifact({ id: 'same' }));
      store.put(makeArtifact({ id: 'same' }));
      store.put(makeArtifact({ id: 'same' }));
      expect(store.size).toBe(1);
    });

    it('re-putting an existing id does not evict other live artifacts', () => {
      // Before the fix, put() always ran evictIfNeeded — even when the id
      // already existed. At capacity, the first entry in insertOrder was
      // shifted and its artifact deleted, even though the caller was
      // merely replacing an existing entry. Result: every re-put at
      // capacity silently lost an unrelated live artifact.
      const store = new ArtifactStore({ maxArtifacts: 2 });
      store.put(makeArtifact({ id: 'a' }));
      store.put(makeArtifact({ id: 'b' }));
      // Re-put 'b' (the newest) — this must NOT evict 'a'. With the bug,
      // evictIfNeeded runs even though size is not growing, shifts 'a'
      // off the front of insertOrder and deletes it.
      store.put(makeArtifact({ id: 'b' }));

      expect(store.size).toBe(2);
      expect(store.get({ id: 'a', type: 'code' })).toBeDefined();
      expect(store.get({ id: 'b', type: 'code' })).toBeDefined();
    });
  });

  describe('interface conformance', () => {
    it('implements IArtifactStore', () => {
      const store: IArtifactStore = new ArtifactStore();
      expect(typeof store.put).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof store.query).toBe('function');
      expect(typeof store.provenance).toBe('function');
    });
  });

  describe('getPipelineArtifactStore (#1179)', () => {
    it('returns the same instance on repeated calls', () => {
      resetPipelineArtifactStore();
      const a = getPipelineArtifactStore();
      const b = getPipelineArtifactStore();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      const a = getPipelineArtifactStore();
      resetPipelineArtifactStore();
      const b = getPipelineArtifactStore();
      expect(a).not.toBe(b);
    });
  });
});

// ============================================================================
// CheckpointStore Tests
// ============================================================================

function makeCheckpoint(overrides: Partial<StageCheckpoint> = {}): StageCheckpoint {
  return {
    stageId: 'analyze',
    keyword: 'test-keyword',
    cursor: 0,
    completedAt: Date.now(),
    itemsProcessed: 10,
    ...overrides,
  };
}

describe('CheckpointStore', () => {
  describe('save and load', () => {
    it('saves and retrieves checkpoint by stage+keyword', () => {
      const store = new CheckpointStore();
      const cp = makeCheckpoint({ stageId: 'stage1', keyword: 'kw1', cursor: 42 });
      store.save(cp);
      const loaded = store.load('stage1', 'kw1');
      expect(loaded).toBeDefined();
      expect(loaded?.cursor).toBe(42);
    });

    it('returns undefined for missing checkpoint', () => {
      const store = new CheckpointStore();
      expect(store.load('missing', 'missing')).toBeUndefined();
    });

    it('overwrites existing checkpoint for same stage+keyword', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ stageId: 's', keyword: 'k', cursor: 1 }));
      store.save(makeCheckpoint({ stageId: 's', keyword: 'k', cursor: 99 }));
      const loaded = store.load('s', 'k');
      expect(loaded?.cursor).toBe(99);
    });
  });

  describe('loadAllForStage', () => {
    it('returns all checkpoints for a stage', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ stageId: 'analyze', keyword: 'kw1', cursor: 1 }));
      store.save(makeCheckpoint({ stageId: 'analyze', keyword: 'kw2', cursor: 2 }));
      store.save(makeCheckpoint({ stageId: 'route', keyword: 'kw1', cursor: 3 }));
      const results = store.loadAllForStage('analyze');
      expect(results).toHaveLength(2);
    });

    it('returns empty for stage with no checkpoints', () => {
      const store = new CheckpointStore();
      expect(store.loadAllForStage('empty')).toHaveLength(0);
    });
  });

  describe('clear operations', () => {
    it('clears specific checkpoint', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ stageId: 's', keyword: 'k' }));
      store.clear('s', 'k');
      expect(store.load('s', 'k')).toBeUndefined();
    });

    it('clears all checkpoints for a stage', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ stageId: 'stage1', keyword: 'k1' }));
      store.save(makeCheckpoint({ stageId: 'stage1', keyword: 'k2' }));
      store.save(makeCheckpoint({ stageId: 'stage2', keyword: 'k3' }));
      store.clearStage('stage1');
      expect(store.loadAllForStage('stage1')).toHaveLength(0);
      expect(store.load('stage2', 'k3')).toBeDefined();
    });

    it('clears all checkpoints', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint());
      store.save(makeCheckpoint({ stageId: 's2', keyword: 'k2' }));
      store.clearAll();
      expect(store.size).toBe(0);
    });
  });

  describe('bounds', () => {
    it('respects max checkpoints with eviction', () => {
      const store = new CheckpointStore({ maxCheckpoints: 3 });
      store.save(makeCheckpoint({ stageId: 's1', keyword: 'k1', cursor: 1 }));
      store.save(makeCheckpoint({ stageId: 's2', keyword: 'k2', cursor: 2 }));
      store.save(makeCheckpoint({ stageId: 's3', keyword: 'k3', cursor: 3 }));
      store.save(makeCheckpoint({ stageId: 's4', keyword: 'k4', cursor: 4 }));
      expect(store.size).toBe(3);
      expect(store.load('s1', 'k1')).toBeUndefined();
      expect(store.load('s4', 'k4')).toBeDefined();
    });

    it('updates existing checkpoint without eviction', () => {
      const store = new CheckpointStore({ maxCheckpoints: 2 });
      store.save(makeCheckpoint({ stageId: 's1', keyword: 'k1', cursor: 1 }));
      store.save(makeCheckpoint({ stageId: 's2', keyword: 'k2', cursor: 2 }));
      store.save(makeCheckpoint({ stageId: 's1', keyword: 'k1', cursor: 99 }));
      expect(store.size).toBe(2);
      expect(store.load('s1', 'k1')?.cursor).toBe(99);
    });

    it('reports correct size', () => {
      const store = new CheckpointStore();
      expect(store.size).toBe(0);
      store.save(makeCheckpoint());
      expect(store.size).toBe(1);
    });
  });

  describe('cursor types', () => {
    it('supports string cursors', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ cursor: 'page-3' }));
      const loaded = store.load('analyze', 'test-keyword');
      expect(typeof loaded?.cursor).toBe('string');
      expect(loaded?.cursor).toBe('page-3');
    });

    it('supports number cursors', () => {
      const store = new CheckpointStore();
      store.save(makeCheckpoint({ cursor: 100 }));
      const loaded = store.load('analyze', 'test-keyword');
      expect(typeof loaded?.cursor).toBe('number');
      expect(loaded?.cursor).toBe(100);
    });
  });

  describe('getCheckpointStore singleton', () => {
    it('returns the same instance on repeated calls', () => {
      resetCheckpointStore();
      const a = getCheckpointStore();
      const b = getCheckpointStore();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      const a = getCheckpointStore();
      resetCheckpointStore();
      const b = getCheckpointStore();
      expect(a).not.toBe(b);
    });
  });
});
