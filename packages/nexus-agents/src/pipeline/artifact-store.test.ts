/**
 * ArtifactStore tests (Issue #912, Phase 4-3)
 *
 * Tests put, get, query, provenance, bounds, and LRU eviction.
 */
import { describe, it, expect } from 'vitest';

import { ArtifactStore } from './artifact-store.js';
import type { Artifact, IArtifactStore } from './artifact-store.js';

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
});
