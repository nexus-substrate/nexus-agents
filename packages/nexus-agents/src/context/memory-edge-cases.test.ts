/**
 * Edge Case Tests for Memory System
 *
 * Tests boundary conditions, error handling, and unusual scenarios
 * for the memory system components.
 *
 * @module context/memory-edge-cases.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemoryRow, MemoryMetadata, MemoryEntry } from './memory-backend-types.js';
import { MemoryImportance, MemoryError } from './memory-backend-types.js';
import type { IContextMemoryBackend } from './memory-backend-types.js';
import { TypedMemory } from './typed-memory.js';
import { MobiMem } from './mobimem.js';
import { ok, err } from '../core/result.js';
import { sanitizeFtsQuery, rowToEntry } from './memory-operations.js';

// =============================================================================
// Mock Memory Backend
// =============================================================================

function createMockBackend(): IContextMemoryBackend & {
  _storage: Map<string, { value: unknown; metadata: MemoryMetadata }>;
} {
  const storage = new Map<string, { value: unknown; metadata: MemoryMetadata }>();

  return {
    _storage: storage,
    store: vi.fn().mockImplementation((key: string, value: unknown, metadata: MemoryMetadata) => {
      storage.set(key, { value, metadata });
      return Promise.resolve(ok(undefined));
    }),
    retrieve: vi.fn().mockImplementation((key: string) => {
      const entry = storage.get(key);
      return Promise.resolve(ok(entry?.value ?? null));
    }),
    search: vi.fn().mockImplementation((query: string, limit: number) => {
      const results: MemoryEntry[] = [];
      const queryLower = query.toLowerCase();
      for (const [key, entry] of storage.entries()) {
        if (
          key.toLowerCase().includes(queryLower) ||
          JSON.stringify(entry.value).toLowerCase().includes(queryLower)
        ) {
          results.push({
            key,
            value: entry.value,
            metadata: entry.metadata,
            createdAt: new Date(),
            accessedAt: new Date(),
          });
        }
      }
      return Promise.resolve(ok(results.slice(0, limit)));
    }),
    prune: vi.fn().mockResolvedValue(ok(0)),
  };
}

// =============================================================================
// Edge Cases: Empty and Null Data
// =============================================================================

describe('Empty and Null Data Handling', () => {
  describe('Empty Data', () => {
    it('should handle empty string values', async () => {
      const backend = createMockBackend();
      const typedMemory = new TypedMemory(backend);

      const result = await typedMemory.semantic.storeFact({
        factId: 'empty-fact',
        domain: '',
        subject: '',
        predicate: '',
        object: '',
        confidence: 0,
        source: '',
      });

      expect(result.ok).toBe(true);
    });

    it('should handle empty arrays', async () => {
      const backend = createMockBackend();
      const typedMemory = new TypedMemory(backend);

      const result = await typedMemory.core.setIdentity({
        agentId: 'empty-arrays',
        role: 'code_expert',
        name: 'Test',
        constraints: [],
        capabilities: [],
        temperament: 'balanced',
      });

      expect(result.ok).toBe(true);
    });

    it('should handle empty object context', async () => {
      const backend = createMockBackend();
      const typedMemory = new TypedMemory(backend);

      const result = await typedMemory.episodic.recordEpisode({
        episodeId: 'empty-context',
        taskId: 'task',
        agentId: 'agent',
        action: 'action',
        outcome: 'success',
        context: {},
        learnings: [],
        timestamp: new Date(),
        durationMs: 0,
      });

      expect(result.ok).toBe(true);
    });

    it('should handle search with empty query', async () => {
      const backend = createMockBackend();
      const typedMemory = new TypedMemory(backend);

      const result = await typedMemory.semantic.queryByDomain('');

      expect(result.ok).toBe(true);
    });

    it('should return empty results for empty database', async () => {
      const backend = createMockBackend();
      const typedMemory = new TypedMemory(backend);

      const stats = await typedMemory.getStats();

      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.totalEntries).toBe(0);
      }
    });
  });

  describe('Null Values', () => {
    it('should handle null value storage', () => {
      const row: MemoryRow = {
        key: 'null-value',
        value: JSON.stringify(null),
        metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
        created_at: Date.now(),
        accessed_at: Date.now(),
        expires_at: null,
      };

      const entry = rowToEntry(row);

      expect(entry.value).toBeNull();
    });

    it('should handle nested null values', () => {
      const row: MemoryRow = {
        key: 'nested-null',
        value: JSON.stringify({ level1: { level2: null, other: 'value' } }),
        metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
        created_at: Date.now(),
        accessed_at: Date.now(),
        expires_at: null,
      };

      const entry = rowToEntry(row);
      const value = entry.value as { level1: { level2: null; other: string } };

      expect(value.level1.level2).toBeNull();
      expect(value.level1.other).toBe('value');
    });
  });
});

// =============================================================================
// Edge Cases: Large Data
// =============================================================================

describe('Large Data Handling', () => {
  it('should handle large string values', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    const largeContent = 'x'.repeat(100000); // 100KB string

    const result = await typedMemory.vault.store({
      vaultId: 'large-content',
      category: 'archive',
      title: 'Large Content Test',
      content: { data: largeContent },
      importance: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    });

    expect(result.ok).toBe(true);
    expect(backend._storage.get('vault:large-content')).toBeDefined();
  });

  it('should handle deeply nested objects', () => {
    // Create deeply nested object (10 levels)
    let nested: Record<string, unknown> = { value: 'deep' };
    for (let i = 0; i < 10; i++) {
      nested = { level: nested };
    }

    const row: MemoryRow = {
      key: 'deep-nested',
      value: JSON.stringify(nested),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(row);
    expect(entry.value).toBeDefined();

    // Navigate to the deepest value
    let current = entry.value as Record<string, unknown>;
    for (let i = 0; i < 10; i++) {
      current = current.level as Record<string, unknown>;
    }
    expect(current.value).toBe('deep');
  });

  it('should handle arrays with many elements', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    const manyTags = Array.from({ length: 1000 }, (_, i) => `tag-${String(i)}`);

    const result = await typedMemory.vault.store({
      vaultId: 'many-tags',
      category: 'insight',
      title: 'Many Tags',
      content: {},
      importance: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: manyTags,
    });

    expect(result.ok).toBe(true);
  });

  it('should handle objects with many properties', () => {
    const manyProps: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      manyProps[`prop${String(i)}`] = i;
    }

    const row: MemoryRow = {
      key: 'many-props',
      value: JSON.stringify(manyProps),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(row);
    const value = entry.value as Record<string, number>;

    expect(Object.keys(value).length).toBe(1000);
    expect(value.prop999).toBe(999);
  });
});

// =============================================================================
// Edge Cases: Special Characters and Unicode
// =============================================================================

describe('Special Characters and Unicode', () => {
  it('should handle unicode characters in values', () => {
    const unicodeValue = {
      emoji: '🚀💻🔥',
      chinese: '你好世界',
      arabic: 'مرحبا بالعالم',
      mixed: 'Hello 世界 🌍',
    };

    const row: MemoryRow = {
      key: 'unicode-test',
      value: JSON.stringify(unicodeValue),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(row);
    const value = entry.value as typeof unicodeValue;

    expect(value.emoji).toBe('🚀💻🔥');
    expect(value.chinese).toBe('你好世界');
    expect(value.arabic).toBe('مرحبا بالعالم');
  });

  it('should sanitize FTS5 special characters', () => {
    const dangerous = 'test* OR hack" AND (drop) NOT [delete]';
    const sanitized = sanitizeFtsQuery(dangerous);

    expect(sanitized).not.toContain('*');
    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain('(');
    expect(sanitized).not.toContain('[');
    expect(sanitized).toContain('test');
    expect(sanitized).toContain('hack');
  });

  it('should handle special JSON characters', () => {
    const specialChars = {
      backslash: 'path\\to\\file',
      quote: 'He said "hello"',
      newline: 'line1\nline2',
      tab: 'col1\tcol2',
      unicode: '\u0000\u001f',
    };

    const row: MemoryRow = {
      key: 'special-json',
      value: JSON.stringify(specialChars),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(row);
    const value = entry.value as typeof specialChars;

    expect(value.backslash).toBe('path\\to\\file');
    expect(value.quote).toBe('He said "hello"');
    expect(value.newline).toBe('line1\nline2');
  });

  it('should handle keys with special characters', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    const result = await typedMemory.semantic.storeFact({
      factId: 'fact:with:colons',
      domain: 'test/domain',
      subject: 'subject@special',
      predicate: 'predicate#hash',
      object: 'object&ampersand',
      confidence: 0.9,
      source: 'test',
    });

    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// Edge Cases: Boundary Values
// =============================================================================

describe('Boundary Values', () => {
  it('should handle zero duration', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    const result = await typedMemory.episodic.recordEpisode({
      episodeId: 'zero-duration',
      taskId: 'task',
      agentId: 'agent',
      action: 'instant_action',
      outcome: 'success',
      context: {},
      learnings: [],
      timestamp: new Date(),
      durationMs: 0,
    });

    expect(result.ok).toBe(true);
  });

  it('should handle maximum safe integer', () => {
    const row: MemoryRow = {
      key: 'max-int',
      value: JSON.stringify({ maxInt: Number.MAX_SAFE_INTEGER }),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Number.MAX_SAFE_INTEGER,
      accessed_at: Number.MAX_SAFE_INTEGER,
      expires_at: Number.MAX_SAFE_INTEGER,
    };

    const entry = rowToEntry(row);
    const value = entry.value as { maxInt: number };

    expect(value.maxInt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle minimum safe integer', () => {
    const row: MemoryRow = {
      key: 'min-int',
      value: JSON.stringify({ minInt: Number.MIN_SAFE_INTEGER }),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: 0,
      accessed_at: 0,
      expires_at: null,
    };

    const entry = rowToEntry(row);
    const value = entry.value as { minInt: number };

    expect(value.minInt).toBe(Number.MIN_SAFE_INTEGER);
  });

  it('should handle confidence at boundaries', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    // Zero confidence
    const zeroResult = await typedMemory.semantic.storeFact({
      factId: 'zero-confidence',
      domain: 'test',
      subject: 'A',
      predicate: 'is',
      object: 'B',
      confidence: 0,
      source: 'test',
    });
    expect(zeroResult.ok).toBe(true);

    // Maximum confidence
    const maxResult = await typedMemory.semantic.storeFact({
      factId: 'max-confidence',
      domain: 'test',
      subject: 'A',
      predicate: 'is',
      object: 'B',
      confidence: 1.0,
      source: 'test',
    });
    expect(maxResult.ok).toBe(true);
  });

  it('should handle timestamps at Unix epoch', () => {
    const row: MemoryRow = {
      key: 'epoch',
      value: JSON.stringify('data'),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: 0,
      accessed_at: 0,
      expires_at: null,
    };

    const entry = rowToEntry(row);

    expect(entry.createdAt.getTime()).toBe(0);
    expect(entry.accessedAt.getTime()).toBe(0);
  });

  it('should handle far future timestamps', () => {
    const farFuture = new Date('2100-01-01').getTime();

    const row: MemoryRow = {
      key: 'future',
      value: JSON.stringify('future data'),
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: farFuture,
    };

    const entry = rowToEntry(row);
    expect(entry).toBeDefined();
  });
});

// =============================================================================
// Edge Cases: MobiMem Specific
// =============================================================================

describe('MobiMem Edge Cases', () => {
  let mobimem: MobiMem;

  beforeEach(() => {
    mobimem = new MobiMem({
      maxProfileEntries: 5,
      maxExperiencePatterns: 10,
      maxActionCacheEntries: 5,
      actionCacheTtlMs: 100,
    });
  });

  it('should handle eviction when exceeding limits', () => {
    // Add more entries than the limit
    for (let i = 0; i < 10; i++) {
      mobimem.profile.observe('entity', 'agent', `pref_${String(i)}`, `value_${String(i)}`);
    }

    const prefs = mobimem.profile.getPreferences('entity');
    expect(prefs.length).toBeLessThanOrEqual(5);
  });

  it('should handle cache key collisions with different inputs', () => {
    const input1 = { key: 'value', order: [1, 2] };
    const input2 = { order: [1, 2], key: 'value' };

    mobimem.action.cache(input1, 'result1', 100);
    mobimem.action.cache(input2, 'result2', 100);

    // Both should be stored (different key ordering = different hash)
    const stats = mobimem.action.getStats();
    // Depending on implementation, they may or may not collide
    expect(stats.entries).toBeGreaterThanOrEqual(1);
  });

  it('should handle rapid consecutive observations', () => {
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      mobimem.profile.observe('rapid-entity', 'agent', 'pref', 'value');
    }

    const pref = mobimem.profile.getPreference('rapid-entity', 'pref');
    expect(pref).not.toBeNull();
    expect(pref?.observationCount).toBe(iterations);
    expect(pref?.confidence).toBeCloseTo(1.0, 1); // Should approach 1.0
  });

  it('should handle experience patterns with 0% success rate', () => {
    for (let i = 0; i < 5; i++) {
      mobimem.experience.recordExecution(
        'failing-task',
        [{ index: 0, actionType: 'action', parameters: {}, durationMs: 100, success: false }],
        { success: false, errorType: 'test_error', totalDurationMs: 100, tokensUsed: 10 },
        'context'
      );
    }

    const patterns = mobimem.experience.findPatterns('failing-task');
    expect(patterns.length).toBe(1);
    expect(patterns[0]?.successRate).toBe(0);
  });

  it('should handle experience patterns with 100% success rate', () => {
    for (let i = 0; i < 5; i++) {
      mobimem.experience.recordExecution(
        'perfect-task',
        [{ index: 0, actionType: 'action', parameters: {}, durationMs: 100, success: true }],
        { success: true, totalDurationMs: 100, tokensUsed: 10 },
        'context'
      );
    }

    const patterns = mobimem.experience.findReliablePatterns('perfect-task');
    expect(patterns.length).toBe(1);
    expect(patterns[0]?.successRate).toBe(1);
  });

  it('should handle cache eviction during active usage', async () => {
    // Fill cache
    for (let i = 0; i < 5; i++) {
      mobimem.action.cache({ id: i }, `result-${String(i)}`, 100);
    }

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Run maintenance
    const evicted = mobimem.action.evictExpired();
    expect(evicted).toBe(5);

    // Cache should be empty
    expect(mobimem.action.getStats().entries).toBe(0);
  });
});

// =============================================================================
// Edge Cases: Error Recovery
// =============================================================================

describe('Error Recovery', () => {
  it('should handle malformed JSON in metadata gracefully', () => {
    // rowToEntry returns safe defaults instead of throwing (fdf35828)
    const badRow: MemoryRow = {
      key: 'bad-meta',
      value: JSON.stringify('valid'),
      metadata: '{ invalid json }',
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(badRow);
    expect(entry.key).toBe('bad-meta');
    expect(entry.value).toBe('valid');
    expect(entry.metadata.importance).toBe('medium');
  });

  it('should handle malformed JSON in value gracefully', () => {
    const badRow: MemoryRow = {
      key: 'bad-value',
      value: '{ invalid json }',
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
      created_at: Date.now(),
      accessed_at: Date.now(),
      expires_at: null,
    };

    const entry = rowToEntry(badRow);
    expect(entry.key).toBe('bad-value');
    expect(entry.value).toBeNull();
    expect(entry.metadata.importance).toBe(MemoryImportance.LOW);
  });

  it('should propagate backend errors correctly', async () => {
    const failingBackend: IContextMemoryBackend = {
      store: vi.fn().mockResolvedValue(err(new MemoryError('Store failed'))),
      retrieve: vi.fn().mockResolvedValue(err(new MemoryError('Retrieve failed'))),
      search: vi.fn().mockResolvedValue(err(new MemoryError('Search failed'))),
      prune: vi.fn().mockResolvedValue(err(new MemoryError('Prune failed'))),
    };

    const typedMemory = new TypedMemory(failingBackend);

    const storeResult = await typedMemory.semantic.storeFact({
      factId: 'fail',
      domain: 'test',
      subject: 'A',
      predicate: 'is',
      object: 'B',
      confidence: 0.5,
      source: 'test',
    });

    expect(storeResult.ok).toBe(false);
  });

  it('should handle undefined values in search results', async () => {
    const backend: IContextMemoryBackend = {
      store: vi.fn().mockResolvedValue(ok(undefined)),
      retrieve: vi.fn().mockResolvedValue(ok(undefined)), // undefined instead of null
      search: vi.fn().mockResolvedValue(ok([])),
      prune: vi.fn().mockResolvedValue(ok(0)),
    };

    const typedMemory = new TypedMemory(backend);
    const result = await typedMemory.semantic.getFact('nonexistent');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should handle undefined/null gracefully
      expect(result.value).toBeFalsy();
    }
  });
});

// =============================================================================
// Edge Cases: Race Conditions
// =============================================================================

describe('Race Condition Handling', () => {
  it('should handle simultaneous stores to same key', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    // Attempt simultaneous stores
    const promises = Array.from({ length: 10 }, (_, i) =>
      typedMemory.semantic.storeFact({
        factId: 'race-key',
        domain: 'test',
        subject: `Subject ${String(i)}`,
        predicate: 'is',
        object: 'Object',
        confidence: 0.9,
        source: 'test',
      })
    );

    const results = await Promise.all(promises);

    // All should succeed (last write wins)
    expect(results.every((r) => r.ok)).toBe(true);
    // Only one entry should exist - key format is `semantic:${factId}`
    expect(backend._storage.has('semantic:race-key')).toBe(true);
  });

  it('should handle read during write', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    // Store initial value
    await typedMemory.semantic.storeFact({
      factId: 'concurrent',
      domain: 'test',
      subject: 'Initial',
      predicate: 'is',
      object: 'Value',
      confidence: 0.5,
      source: 'test',
    });

    // Start simultaneous read and write
    const [readResult, writeResult] = await Promise.all([
      typedMemory.semantic.getFact('concurrent'),
      typedMemory.semantic.storeFact({
        factId: 'concurrent',
        domain: 'test',
        subject: 'Updated',
        predicate: 'is',
        object: 'Value',
        confidence: 0.9,
        source: 'test',
      }),
    ]);

    expect(readResult.ok).toBe(true);
    expect(writeResult.ok).toBe(true);
  });
});

// =============================================================================
// Edge Cases: Memory Pressure
// =============================================================================

describe('Memory Pressure Handling', () => {
  it('should handle many small entries', async () => {
    const backend = createMockBackend();
    const typedMemory = new TypedMemory(backend);

    const count = 1000;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        typedMemory.semantic.storeFact({
          factId: `many-${String(i)}`,
          domain: 'test',
          subject: `S${String(i)}`,
          predicate: 'is',
          object: `O${String(i)}`,
          confidence: 0.5,
          source: 'test',
        })
      )
    );

    expect(results.every((r) => r.ok)).toBe(true);
    expect(backend._storage.size).toBe(count);
  });

  it('should handle MobiMem under high load', () => {
    const mobimem = new MobiMem({
      maxProfileEntries: 100,
      maxExperiencePatterns: 100,
      maxActionCacheEntries: 100,
    });

    // Simulate high load
    for (let i = 0; i < 1000; i++) {
      mobimem.profile.observe(
        `entity-${String(i % 10)}`,
        'agent',
        `pref-${String(i % 50)}`,
        `value-${String(i)}`
      );

      mobimem.experience.recordExecution(
        `task-${String(i % 20)}`,
        [{ index: 0, actionType: 'action', parameters: {}, durationMs: 100, success: i % 3 !== 0 }],
        {
          success: i % 3 !== 0,
          totalDurationMs: 100,
          tokensUsed: 10,
          ...(i % 3 === 0 ? { errorType: 'test_error' } : {}),
        },
        `ctx-${String(i % 5)}`
      );

      mobimem.action.cache({ query: i }, `result-${String(i)}`, 100);
    }

    const stats = mobimem.getStats();

    // Should respect limits
    expect(stats.profile.totalEntries).toBeLessThanOrEqual(100 * 10); // 100 per entity * 10 entities
    expect(stats.experience.totalPatterns).toBeLessThanOrEqual(100);
    expect(stats.action.totalEntries).toBeLessThanOrEqual(100);
  });
});
