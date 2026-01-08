/**
 * Tests for Adaptive Memory Backend.
 * (Source: Issue #143, arXiv:2310.08560)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AdaptiveMemoryBackend,
  createAdaptiveMemory,
  DEFAULT_SCORING_CONFIG,
} from './adaptive-memory.js';
import {
  calculateRecencyScore,
  calculateImportanceScore,
  calculateRelevanceScore,
  calculatePriorityScore,
  filterScoredEntries,
  mergeScoringConfig,
} from './adaptive-memory-helpers.js';
import type { ISQLiteDatabase, ISQLiteStatement, MemoryRow } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';

// =============================================================================
// Mock SQLite Database
// =============================================================================

interface MockStore {
  memories: Map<string, MemoryRow>;
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

function handleMemoryUpdate(store: MockStore, params: unknown[]): { changes: number } {
  const [accessed_at, key] = params as [number, string];
  const row = store.memories.get(key);
  if (row !== undefined) {
    store.memories.set(key, { ...row, accessed_at });
    return { changes: 1 };
  }
  return { changes: 0 };
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
    if (sql.includes('UPDATE') && sql.includes('accessed_at'))
      return handleMemoryUpdate(store, params);
    if (sql.includes('DELETE') && sql.includes('memories'))
      return handleMemoryDelete(store, params);
    return { changes: 0 };
  };
}

function createMockGet(store: MockStore, sql: string): (...params: unknown[]) => unknown {
  return (...params: unknown[]): unknown => {
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
    if (sql.includes('memories') && sql.includes('ORDER BY')) {
      const [limit] = params as [number];
      return Array.from(store.memories.values())
        .sort((a, b) => b.accessed_at - a.accessed_at)
        .slice(0, limit);
    }
    return [];
  };
}

function createMockDatabase(): ISQLiteDatabase & { store: MockStore } {
  const store: MockStore = { memories: new Map() };
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
    },
  };
}

// =============================================================================
// Test Configuration
// =============================================================================

const testConfig = { dbPath: ':memory:', markdownDir: '/tmp/test-markdown' };

// =============================================================================
// Helper Functions
// =============================================================================

function createMockEntry(
  key: string,
  value: string,
  importance: string,
  accessedAt: Date
): MemoryRow {
  const now = Date.now();
  return {
    key,
    value: JSON.stringify(value),
    metadata: JSON.stringify({ importance, tags: [] }),
    created_at: now,
    accessed_at: accessedAt.getTime(),
    expires_at: null,
  };
}

// =============================================================================
// Recency Score Tests
// =============================================================================

describe('calculateRecencyScore', () => {
  const halfLife = 24 * 60 * 60 * 1000; // 24 hours
  const minScore = 0.1;

  it('returns 1.0 for current time', () => {
    const now = new Date();
    const score = calculateRecencyScore(now, now, halfLife, minScore);
    expect(score).toBe(1.0);
  });

  it('returns ~0.5 after one half-life', () => {
    const now = new Date();
    const accessed = new Date(now.getTime() - halfLife);
    const score = calculateRecencyScore(accessed, now, halfLife, minScore);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('returns ~0.25 after two half-lives', () => {
    const now = new Date();
    const accessed = new Date(now.getTime() - halfLife * 2);
    const score = calculateRecencyScore(accessed, now, halfLife, minScore);
    expect(score).toBeCloseTo(0.25, 1);
  });

  it('respects minimum score floor', () => {
    const now = new Date();
    const accessed = new Date(now.getTime() - halfLife * 10);
    const score = calculateRecencyScore(accessed, now, halfLife, minScore);
    expect(score).toBe(minScore);
  });

  it('returns 1.0 for future access time', () => {
    const now = new Date();
    const accessed = new Date(now.getTime() + 1000);
    const score = calculateRecencyScore(accessed, now, halfLife, minScore);
    expect(score).toBe(1.0);
  });
});

// =============================================================================
// Importance Score Tests
// =============================================================================

describe('calculateImportanceScore', () => {
  it('returns high weight for HIGH importance', () => {
    const score = calculateImportanceScore('high', DEFAULT_SCORING_CONFIG);
    expect(score).toBe(1.0);
  });

  it('returns medium weight for MEDIUM importance', () => {
    const score = calculateImportanceScore('medium', DEFAULT_SCORING_CONFIG);
    expect(score).toBe(0.5);
  });

  it('returns low weight for LOW importance', () => {
    const score = calculateImportanceScore('low', DEFAULT_SCORING_CONFIG);
    expect(score).toBe(0.25);
  });

  it('returns medium weight for unknown importance', () => {
    const score = calculateImportanceScore('unknown', DEFAULT_SCORING_CONFIG);
    expect(score).toBe(0.5);
  });
});

// =============================================================================
// Relevance Score Tests
// =============================================================================

describe('calculateRelevanceScore', () => {
  it('returns 1.0 for empty query', () => {
    const score = calculateRelevanceScore('', 'some value');
    expect(score).toBe(1.0);
  });

  it('returns 1.0 for undefined query', () => {
    const score = calculateRelevanceScore(undefined, 'some value');
    expect(score).toBe(1.0);
  });

  it('returns 1.0 for exact match', () => {
    const score = calculateRelevanceScore('hello world', 'hello world');
    expect(score).toBe(1.0);
  });

  it('returns partial score for partial match', () => {
    const score = calculateRelevanceScore('hello world', 'hello there');
    expect(score).toBe(0.5); // 1 of 2 tokens match
  });

  it('returns 0 for no match', () => {
    const score = calculateRelevanceScore('hello world', 'foo bar');
    expect(score).toBe(0);
  });
});

// =============================================================================
// Priority Score Tests
// =============================================================================

describe('calculatePriorityScore', () => {
  it('calculates combined score with all components', () => {
    const now = new Date();
    const entry = {
      key: 'test',
      value: 'hello world',
      metadata: { importance: MemoryImportance.HIGH },
      createdAt: now,
      accessedAt: now,
    };

    const result = calculatePriorityScore({
      entry,
      query: 'hello',
      now,
      config: DEFAULT_SCORING_CONFIG,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.components.recency).toBe(1.0);
    expect(result.components.importance).toBe(1.0);
    expect(result.components.relevance).toBe(1.0);
  });

  it('applies weight overrides', () => {
    const now = new Date();
    const entry = {
      key: 'test',
      value: 'hello world',
      metadata: { importance: MemoryImportance.HIGH },
      createdAt: now,
      accessedAt: now,
    };

    const result = calculatePriorityScore({
      entry,
      query: 'hello',
      now,
      config: DEFAULT_SCORING_CONFIG,
      weightOverrides: { recency: 1.0, importance: 0, relevance: 0 },
    });

    // With only recency weighted, score should equal recency component
    expect(result.score).toBeCloseTo(result.components.recency, 2);
  });
});

// =============================================================================
// Filter Tests
// =============================================================================

describe('filterScoredEntries', () => {
  const now = new Date();
  const createScoredEntry = (
    key: string,
    score: number,
    importance: string,
    tags: string[] = []
  ): ScoredMemoryEntry => ({
    entry: {
      key,
      value: 'test',
      metadata: { importance: importance as 'low' | 'medium' | 'high', tags },
      createdAt: now,
      accessedAt: now,
    },
    priority: {
      score,
      components: { recency: 1, importance: 0.5, relevance: 0.5 },
    },
  });

  it('filters by minimum score', () => {
    const entries = [
      createScoredEntry('a', 0.8, 'high'),
      createScoredEntry('b', 0.3, 'low'),
      createScoredEntry('c', 0.6, 'medium'),
    ];

    const filtered = filterScoredEntries(entries, { minScore: 0.5 });
    expect(filtered.length).toBe(2);
    expect(filtered.map((e) => e.entry.key)).toContain('a');
    expect(filtered.map((e) => e.entry.key)).toContain('c');
  });

  it('filters by importance', () => {
    const entries = [
      createScoredEntry('a', 0.8, 'high'),
      createScoredEntry('b', 0.7, 'low'),
      createScoredEntry('c', 0.6, 'medium'),
    ];

    const filtered = filterScoredEntries(entries, { importanceFilter: ['high', 'medium'] });
    expect(filtered.length).toBe(2);
    expect(filtered.map((e) => e.entry.key)).not.toContain('b');
  });

  it('filters by tags', () => {
    const entries = [
      createScoredEntry('a', 0.8, 'high', ['important', 'work']),
      createScoredEntry('b', 0.7, 'medium', ['personal']),
      createScoredEntry('c', 0.6, 'low', []),
    ];

    const filtered = filterScoredEntries(entries, { tagFilter: ['work'] });
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.entry.key).toBe('a');
  });
});

// =============================================================================
// Config Merging Tests
// =============================================================================

describe('mergeScoringConfig', () => {
  it('returns defaults for undefined config', () => {
    const config = mergeScoringConfig(undefined);
    expect(config).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const config = mergeScoringConfig({
      decay: { halfLifeMs: 1000, minScore: 0.2 },
    });
    expect(config.decay.halfLifeMs).toBe(1000);
    expect(config.weights).toEqual(DEFAULT_SCORING_CONFIG.weights);
  });
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('AdaptiveMemoryBackend', () => {
  describe('constructor', () => {
    it('creates with valid config', () => {
      const backend = new AdaptiveMemoryBackend(testConfig);
      expect(backend).toBeDefined();
    });

    it('throws on invalid config', () => {
      expect(() => new AdaptiveMemoryBackend({ dbPath: '', markdownDir: '' })).toThrow();
    });
  });

  describe('createAdaptiveMemory', () => {
    it('creates backend instance', () => {
      const backend = createAdaptiveMemory(testConfig);
      expect(backend).toBeInstanceOf(AdaptiveMemoryBackend);
    });
  });
});

// =============================================================================
// Initialization Tests
// =============================================================================

describe('initialization', () => {
  let backend: AdaptiveMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    backend = new AdaptiveMemoryBackend(testConfig);
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
// Priority Retrieval Tests
// =============================================================================

describe('priority retrieval', () => {
  let backend: AdaptiveMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    backend = new AdaptiveMemoryBackend(testConfig);
    mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);

    // Add test memories with different ages and importance
    const now = Date.now();
    mockDb.store.memories.set(
      'recent-high',
      createMockEntry('recent-high', 'Recent high importance', 'high', new Date(now))
    );
    mockDb.store.memories.set(
      'old-high',
      createMockEntry(
        'old-high',
        'Old high importance',
        'high',
        new Date(now - 48 * 60 * 60 * 1000)
      )
    );
    mockDb.store.memories.set(
      'recent-low',
      createMockEntry('recent-low', 'Recent low importance', 'low', new Date(now))
    );
  });

  afterEach(() => {
    backend.close();
  });

  describe('retrieveByPriority', () => {
    it('returns entries sorted by priority', async () => {
      const result = await backend.retrieveByPriority();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        // Recent high should be first (best recency + best importance)
        expect(result.value[0]?.entry.key).toBe('recent-high');
      }
    });

    it('applies limit', async () => {
      const result = await backend.retrieveByPriority({ limit: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBe(2);
    });

    it('filters by minimum score', async () => {
      const result = await backend.retrieveByPriority({ minScore: 0.8 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const entry of result.value) {
          expect(entry.priority.score).toBeGreaterThanOrEqual(0.8);
        }
      }
    });

    it('applies query for relevance scoring', async () => {
      const result = await backend.retrieveByPriority({ query: 'recent' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Entries with 'recent' in value should score higher on relevance
        const recentEntries = result.value.filter((e) => String(e.entry.value).includes('Recent'));
        expect(recentEntries.length).toBe(2);
      }
    });
  });

  describe('getPriorityScore', () => {
    it('returns score for existing key', async () => {
      const result = await backend.getPriorityScore('recent-high');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeGreaterThan(0);
        expect(result.value.components.recency).toBeCloseTo(1.0, 5);
        expect(result.value.components.importance).toBe(1.0);
      }
    });

    it('applies query for relevance', async () => {
      const result = await backend.getPriorityScore('recent-high', 'recent');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.components.relevance).toBeGreaterThan(0);
      }
    });

    it('fails for non-existent key', async () => {
      const result = await backend.getPriorityScore('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Key not found');
    });
  });

  describe('touch', () => {
    it('updates access time', async () => {
      const before = mockDb.store.memories.get('old-high')?.accessed_at;
      const result = await backend.touch('old-high');
      expect(result.ok).toBe(true);
      const after = mockDb.store.memories.get('old-high')?.accessed_at;
      expect(after).toBeGreaterThan(before ?? 0);
    });

    it('fails for non-existent key', async () => {
      const result = await backend.touch('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Key not found');
    });
  });
});

// =============================================================================
// Scoring Config Tests
// =============================================================================

describe('scoring configuration', () => {
  let backend: AdaptiveMemoryBackend;

  beforeEach(() => {
    backend = new AdaptiveMemoryBackend(testConfig);
    const mockDb = createMockDatabase();
    backend.initializeWithDatabase(mockDb);
  });

  afterEach(() => {
    backend.close();
  });

  it('returns default config', () => {
    const config = backend.getScoringConfig();
    expect(config).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('updates config', () => {
    backend.updateScoringConfig({
      decay: { halfLifeMs: 1000, minScore: 0.2 },
    });
    const config = backend.getScoringConfig();
    expect(config.decay.halfLifeMs).toBe(1000);
  });
});

// =============================================================================
// Delegated Methods Tests
// =============================================================================

describe('delegated methods', () => {
  let backend: AdaptiveMemoryBackend;
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    backend = new AdaptiveMemoryBackend(testConfig);
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
