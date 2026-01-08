/**
 * Tests for Graph-Based Memory Backend.
 * (Source: Issue #142, arXiv:2308.09687)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphMemoryBackend, createGraphMemory, RelationTypes } from './graph-memory.js';
import type { ISQLiteDatabase, ISQLiteStatement, MemoryRow } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { GraphEdgeRow } from './graph-memory-types.js';

// =============================================================================
// Mock SQLite Database
// =============================================================================

interface MockStore {
  memories: Map<string, MemoryRow>;
  edges: Map<string, GraphEdgeRow>;
}

function handleMemoryInsert(store: MockStore, params: unknown[]): { changes: number } {
  const [key, value, metadata, created_at, accessed_at, expires_at] = params as [
    string,
    string,
    string,
    number,
    number,
    number | null,
  ];
  store.memories.set(key, { key, value, metadata, created_at, accessed_at, expires_at });
  return { changes: 1 };
}

function handleEdgeInsert(store: MockStore, params: unknown[]): { changes: number } {
  const [from_key, to_key, relation_type, weight, created_at, metadata] = params as [
    string,
    string,
    string,
    number,
    number,
    string | null,
  ];
  const edgeKey = `${from_key}:${to_key}:${relation_type}`;
  store.edges.set(edgeKey, { from_key, to_key, relation_type, weight, created_at, metadata });
  return { changes: 1 };
}

function handleEdgeDelete(store: MockStore, params: unknown[]): { changes: number } {
  const [from, to, type] = params as [string, string, string?];
  let deleted = 0;
  for (const [key, edge] of store.edges) {
    if (
      edge.from_key === from &&
      edge.to_key === to &&
      (type === undefined || edge.relation_type === type)
    ) {
      store.edges.delete(key);
      deleted++;
    }
  }
  return { changes: deleted };
}

function handleMemoryDelete(store: MockStore, params: unknown[]): { changes: number } {
  const [key] = params as [string];
  const had = store.memories.has(key);
  store.memories.delete(key);
  return { changes: had ? 1 : 0 };
}

function createMockRun(
  store: MockStore,
  sql: string
): (...params: unknown[]) => { changes: number } {
  return (...params: unknown[]): { changes: number } => {
    if (sql.includes('INSERT') && sql.includes('memories'))
      return handleMemoryInsert(store, params);
    if (sql.includes('INSERT') && sql.includes('graph_edges'))
      return handleEdgeInsert(store, params);
    if (sql.includes('DELETE') && sql.includes('graph_edges'))
      return handleEdgeDelete(store, params);
    if (sql.includes('DELETE') && sql.includes('memories'))
      return handleMemoryDelete(store, params);
    if (sql.includes('UPDATE')) return { changes: 1 };
    return { changes: 0 };
  };
}

function createMockGet(store: MockStore, sql: string): (...params: unknown[]) => unknown {
  return (...params: unknown[]): unknown => {
    // Check COUNT first since it also contains SELECT and memories
    if (sql.includes('COUNT') && sql.includes('memories')) {
      const [key] = params as [string];
      return { count: store.memories.has(key) ? 1 : 0 };
    }
    if (sql.includes('SELECT') && sql.includes('memories') && sql.includes('key = ?')) {
      const [key] = params as [string];
      return store.memories.get(key);
    }
    return undefined;
  };
}

function createMockAll(store: MockStore, sql: string): (...params: unknown[]) => unknown[] {
  return (...params: unknown[]): unknown[] => {
    if (sql.includes('graph_edges') && sql.includes('from_key = ?')) {
      const [key] = params as [string];
      return Array.from(store.edges.values()).filter((e) => e.from_key === key);
    }
    if (sql.includes('graph_edges') && sql.includes('to_key = ?')) {
      const [key] = params as [string];
      return Array.from(store.edges.values()).filter((e) => e.to_key === key);
    }
    if (sql.includes('memories') && sql.includes('ORDER BY')) {
      const [limit] = params as [number];
      return Array.from(store.memories.values()).slice(0, limit);
    }
    return [];
  };
}

function createMockDatabase(): ISQLiteDatabase & { store: MockStore } {
  const store: MockStore = { memories: new Map(), edges: new Map() };
  return {
    store,
    exec: (): void => {},
    prepare: <T = unknown>(sql: string): ISQLiteStatement<T> => ({
      run: createMockRun(store, sql),
      get: createMockGet(store, sql) as ISQLiteStatement<T>['get'],
      all: createMockAll(store, sql) as ISQLiteStatement<T>['all'],
    }),
    close: (): void => {
      store.memories.clear();
      store.edges.clear();
    },
  };
}

// =============================================================================
// Test Configuration
// =============================================================================

const testConfig = { dbPath: ':memory:', markdownDir: '/tmp/test-markdown' };

// =============================================================================
// Constructor Tests
// =============================================================================

describe('GraphMemoryBackend', () => {
  describe('constructor', () => {
    it('creates with valid config', () => {
      const backend = new GraphMemoryBackend(testConfig);
      expect(backend).toBeDefined();
    });

    it('throws on invalid config', () => {
      expect(() => new GraphMemoryBackend({ dbPath: '', markdownDir: '' })).toThrow();
    });
  });

  describe('createGraphMemory', () => {
    it('creates backend instance', () => {
      const backend = createGraphMemory(testConfig);
      expect(backend).toBeInstanceOf(GraphMemoryBackend);
    });
  });
});

// =============================================================================
// Initialization Tests
// =============================================================================

describe('initialization', () => {
  let backend: GraphMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    backend = new GraphMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);
  });

  afterEach(() => {
    backend.close();
  });

  it('initializes with database', () => {
    expect(mockDb.store).toBeDefined();
  });
});

// =============================================================================
// Relationship Tests
// =============================================================================

describe('relationships', () => {
  let backend: GraphMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(async () => {
    backend = new GraphMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);
    await backend.store('mem1', 'Memory 1', { importance: MemoryImportance.MEDIUM });
    await backend.store('mem2', 'Memory 2', { importance: MemoryImportance.MEDIUM });
    await backend.store('mem3', 'Memory 3', { importance: MemoryImportance.MEDIUM });
  });

  afterEach(() => {
    backend.close();
  });

  describe('addRelationship', () => {
    it('adds relationship between existing memories', async () => {
      const result = await backend.addRelationship('mem1', 'mem2', RelationTypes.RELATED_TO);
      expect(result.ok).toBe(true);
      expect(mockDb.store.edges.size).toBe(1);
    });

    it('adds relationship with custom weight', async () => {
      const result = await backend.addRelationship('mem1', 'mem2', RelationTypes.DERIVED_FROM, {
        weight: 0.8,
      });
      expect(result.ok).toBe(true);
      const edge = mockDb.store.edges.get('mem1:mem2:derived_from');
      expect(edge?.weight).toBe(0.8);
    });

    it('fails for non-existent source', async () => {
      const result = await backend.addRelationship('nonexistent', 'mem2', RelationTypes.RELATED_TO);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Source key not found');
    });

    it('fails for non-existent target', async () => {
      const result = await backend.addRelationship('mem1', 'nonexistent', RelationTypes.RELATED_TO);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Target key not found');
    });
  });

  describe('removeRelationship', () => {
    beforeEach(async () => {
      await backend.addRelationship('mem1', 'mem2', RelationTypes.RELATED_TO);
      await backend.addRelationship('mem1', 'mem2', RelationTypes.DERIVED_FROM);
    });

    it('removes specific relationship type', async () => {
      const result = await backend.removeRelationship('mem1', 'mem2', RelationTypes.RELATED_TO);
      expect(result.ok).toBe(true);
      expect(mockDb.store.edges.has('mem1:mem2:related_to')).toBe(false);
      expect(mockDb.store.edges.has('mem1:mem2:derived_from')).toBe(true);
    });

    it('removes all relationships when type not specified', async () => {
      const result = await backend.removeRelationship('mem1', 'mem2');
      expect(result.ok).toBe(true);
      expect(mockDb.store.edges.size).toBe(0);
    });
  });

  describe('getRelationships', () => {
    beforeEach(async () => {
      await backend.addRelationship('mem1', 'mem2', RelationTypes.RELATED_TO);
      await backend.addRelationship('mem3', 'mem1', RelationTypes.DERIVED_FROM);
    });

    it('gets outgoing relationships', async () => {
      const result = await backend.getRelationships('mem1', 'outgoing');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.to).toBe('mem2');
      }
    });

    it('gets incoming relationships', async () => {
      const result = await backend.getRelationships('mem1', 'incoming');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.from).toBe('mem3');
      }
    });

    it('gets both directions by default', async () => {
      const result = await backend.getRelationships('mem1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBe(2);
    });
  });
});

// =============================================================================
// Traversal Tests
// =============================================================================

describe('traversal', () => {
  let backend: GraphMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(async () => {
    backend = new GraphMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);

    // Create graph: A -> B -> C, A -> D
    await backend.store('A', 'Node A', { importance: MemoryImportance.MEDIUM });
    await backend.store('B', 'Node B', { importance: MemoryImportance.MEDIUM });
    await backend.store('C', 'Node C', { importance: MemoryImportance.MEDIUM });
    await backend.store('D', 'Node D', { importance: MemoryImportance.MEDIUM });
    await backend.addRelationship('A', 'B', RelationTypes.RELATED_TO);
    await backend.addRelationship('B', 'C', RelationTypes.RELATED_TO);
    await backend.addRelationship('A', 'D', RelationTypes.RELATED_TO);
  });

  afterEach(() => {
    backend.close();
  });

  describe('traverse', () => {
    it('finds immediate neighbors at depth 1', async () => {
      const result = await backend.traverse('A', { maxDepth: 1 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const keys = result.value.map((r) => r.entry.key);
        expect(keys).toContain('B');
        expect(keys).toContain('D');
      }
    });

    it('finds deeper nodes at depth 2', async () => {
      const result = await backend.traverse('A', { maxDepth: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        expect(result.value.map((r) => r.entry.key)).toContain('C');
      }
    });

    it('includes start node when requested', async () => {
      const result = await backend.traverse('A', { maxDepth: 1, includeStart: true });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.map((r) => r.entry.key)).toContain('A');
    });

    it('fails for non-existent key', async () => {
      const result = await backend.traverse('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('respects max depth limit from config', async () => {
      const result = await backend.traverse('A', { maxDepth: 100 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Max depth exceeded');
    });
  });

  describe('findPath', () => {
    it('finds path between connected nodes', async () => {
      const result = await backend.findPath('A', 'C');
      expect(result.ok).toBe(true);
      if (result.ok && result.value !== null) {
        expect(result.value[0]).toBe('A');
        expect(result.value[result.value.length - 1]).toBe('C');
      }
    });

    it('returns null for unconnected nodes', async () => {
      await backend.store('X', 'Isolated', { importance: MemoryImportance.MEDIUM });
      const result = await backend.findPath('A', 'X');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });
  });

  describe('getNeighbors', () => {
    it('returns entries at specified depth', async () => {
      const result = await backend.getNeighbors('A', 1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBe(2);
    });
  });
});

// =============================================================================
// Store with Relations Tests
// =============================================================================

describe('storeWithRelations', () => {
  let backend: GraphMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(async () => {
    backend = new GraphMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);
    await backend.store('existing1', 'Existing 1', { importance: MemoryImportance.MEDIUM });
    await backend.store('existing2', 'Existing 2', { importance: MemoryImportance.MEDIUM });
  });

  afterEach(() => {
    backend.close();
  });

  it('stores memory and creates relationships', async () => {
    const result = await backend.storeWithRelations(
      'new',
      'New Memory',
      { importance: MemoryImportance.MEDIUM },
      ['existing1', 'existing2']
    );
    expect(result.ok).toBe(true);
    expect(mockDb.store.memories.has('new')).toBe(true);
    expect(mockDb.store.edges.size).toBe(2);
  });

  it('works without relations', async () => {
    const result = await backend.storeWithRelations('new', 'New Memory', {
      importance: MemoryImportance.MEDIUM,
    });
    expect(result.ok).toBe(true);
    expect(mockDb.store.memories.has('new')).toBe(true);
    expect(mockDb.store.edges.size).toBe(0);
  });
});

// =============================================================================
// Delegated Methods Tests
// =============================================================================

describe('delegated methods', () => {
  let backend: GraphMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    backend = new GraphMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);
  });

  afterEach(() => {
    backend.close();
  });

  it('delegates store to base backend', async () => {
    const result = await backend.store('test', 'value', { importance: MemoryImportance.HIGH });
    expect(result.ok).toBe(true);
    expect(mockDb.store.memories.has('test')).toBe(true);
  });

  it('delegates retrieve to base backend', async () => {
    await backend.store('test', 'value', { importance: MemoryImportance.MEDIUM });
    const result = await backend.retrieve('test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('value');
  });
});

// =============================================================================
// RelationType Tests
// =============================================================================

describe('RelationTypes', () => {
  it('exports all relationship types', () => {
    expect(RelationTypes.RELATED_TO).toBe('related_to');
    expect(RelationTypes.DERIVED_FROM).toBe('derived_from');
    expect(RelationTypes.CONTRADICTS).toBe('contradicts');
    expect(RelationTypes.SUPERSEDES).toBe('supersedes');
    expect(RelationTypes.PARENT_OF).toBe('parent_of');
    expect(RelationTypes.SAME_ENTITY).toBe('same_entity');
    expect(RelationTypes.PRECEDES).toBe('precedes');
    expect(RelationTypes.CAUSES).toBe('causes');
  });
});
