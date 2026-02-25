/**
 * nexus-agents/context - Hybrid Memory Backend Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILogger } from '../core/index.js';
import { ValidationError } from '../core/index.js';
import {
  HybridMemoryBackend,
  MemoryImportance,
  MemoryError,
  type MemoryMetadata,
  type ISQLiteDatabase,
  type ISQLiteStatement,
  type HybridMemoryConfig,
} from './memory-backend.js';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

/**
 * In-memory SQLite mock for testing without actual database.
 */
class MockSQLiteDatabase implements ISQLiteDatabase {
  private tables: Map<string, Map<string, unknown>> = new Map();
  private ftsData: Map<string, { key: string; value: string; tags: string }> = new Map();
  private rowIdCounter = 0;

  exec(sql: string): void {
    // Simple parsing for CREATE TABLE and CREATE INDEX
    if (
      sql.includes('CREATE TABLE') ||
      sql.includes('CREATE VIRTUAL TABLE') ||
      sql.includes('CREATE TRIGGER') ||
      sql.includes('CREATE INDEX')
    ) {
      // Initialize tables structure
      if (!this.tables.has('memories')) {
        this.tables.set('memories', new Map());
      }
      return;
    }
    // Ignore other exec calls (they're for schema setup)
  }

  prepare<T = unknown>(sql: string): ISQLiteStatement<T> {
    return new MockSQLiteStatement<T>(this, sql);
  }

  close(): void {
    this.tables.clear();
    this.ftsData.clear();
  }

  // Internal methods for MockSQLiteStatement
  _getMemories(): Map<string, unknown> {
    if (!this.tables.has('memories')) {
      this.tables.set('memories', new Map());
    }
    return this.tables.get('memories')!;
  }

  _getFtsData(): Map<string, { key: string; value: string; tags: string }> {
    return this.ftsData;
  }

  _getNextRowId(): number {
    return ++this.rowIdCounter;
  }
}

// SQL operation type identifiers
type SqlOperationType =
  | 'insert_replace'
  | 'delete_by_key'
  | 'delete_by_created_at'
  | 'delete_by_expires_at'
  | 'delete_by_keys'
  | 'update_accessed_at'
  | 'unknown';

// Determine SQL operation type from SQL string
function getSqlOperationType(sql: string): SqlOperationType {
  if (sql.includes('INSERT OR REPLACE INTO memories')) return 'insert_replace';
  if (sql.includes('DELETE FROM memories WHERE key = ?')) return 'delete_by_key';
  if (sql.includes('DELETE FROM memories WHERE created_at < ?')) return 'delete_by_created_at';
  if (sql.includes('DELETE FROM memories WHERE expires_at IS NOT NULL'))
    return 'delete_by_expires_at';
  if (sql.includes('DELETE FROM memories WHERE key IN')) return 'delete_by_keys';
  if (sql.includes('UPDATE memories SET accessed_at')) return 'update_accessed_at';
  return 'unknown';
}

// Helper: Insert or replace memory
function handleInsertReplace(db: MockSQLiteDatabase, params: unknown[]): { changes: number } {
  const memories = db._getMemories();
  const ftsData = db._getFtsData();
  const [key, value, metadata, created_at, accessed_at, expires_at] = params as [
    string,
    string,
    string,
    number,
    number,
    number | null,
  ];
  const rowId = db._getNextRowId();
  memories.set(key, { key, value, metadata, created_at, accessed_at, expires_at, rowid: rowId });
  const parsedMetadata = JSON.parse(metadata) as MemoryMetadata;
  ftsData.set(key, { key, value, tags: parsedMetadata.tags?.join(' ') ?? '' });
  return { changes: 1 };
}

// Helper: Delete entries by time condition
function handleDeleteByTime(
  db: MockSQLiteDatabase,
  params: unknown[],
  field: 'created_at' | 'expires_at'
): { changes: number } {
  const memories = db._getMemories();
  const ftsData = db._getFtsData();
  const cutoff = params[0] as number;
  let changes = 0;
  for (const [key, row] of memories.entries()) {
    const fieldValue = (row as Record<string, number | null | undefined>)[field];
    const shouldDelete =
      field === 'expires_at'
        ? fieldValue !== null && fieldValue !== undefined && fieldValue < cutoff
        : fieldValue !== undefined && fieldValue !== null && fieldValue < cutoff;
    if (shouldDelete) {
      memories.delete(key);
      ftsData.delete(key);
      changes++;
    }
  }
  return { changes };
}

/**
 * Mock SQLite statement.
 */
class MockSQLiteStatement<T> implements ISQLiteStatement<T> {
  constructor(
    private readonly db: MockSQLiteDatabase,
    private readonly sql: string
  ) {}

  run(...params: unknown[]): { changes: number } {
    const opType = getSqlOperationType(this.sql);
    switch (opType) {
      case 'insert_replace':
        return handleInsertReplace(this.db, params);
      case 'delete_by_key':
        return this.handleDeleteByKey(params);
      case 'delete_by_created_at':
        return handleDeleteByTime(this.db, params, 'created_at');
      case 'delete_by_expires_at':
        return handleDeleteByTime(this.db, params, 'expires_at');
      case 'delete_by_keys':
        return this.handleDeleteByKeys(params);
      case 'update_accessed_at':
        return this.handleUpdateAccessedAt(params);
      default:
        return { changes: 0 };
    }
  }

  private handleDeleteByKey(params: unknown[]): { changes: number } {
    const memories = this.db._getMemories();
    const ftsData = this.db._getFtsData();
    const key = params[0] as string;
    const existed = memories.has(key);
    memories.delete(key);
    ftsData.delete(key);
    return { changes: existed ? 1 : 0 };
  }

  private handleDeleteByKeys(params: unknown[]): { changes: number } {
    const memories = this.db._getMemories();
    const ftsData = this.db._getFtsData();
    let changes = 0;
    for (const key of params) {
      if (memories.has(key as string)) {
        memories.delete(key as string);
        ftsData.delete(key as string);
        changes++;
      }
    }
    return { changes };
  }

  private handleUpdateAccessedAt(params: unknown[]): { changes: number } {
    const memories = this.db._getMemories();
    const [accessed_at, key] = params as [number, string];
    const row = memories.get(key);
    if (row !== undefined) {
      (row as { accessed_at: number }).accessed_at = accessed_at;
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  get(...params: unknown[]): T | undefined {
    const memories = this.db._getMemories();

    // SELECT by key
    if (this.sql.includes('SELECT') && this.sql.includes('WHERE key = ?')) {
      const key = params[0] as string;
      return memories.get(key) as T | undefined;
    }

    // COUNT
    if (this.sql.includes('SELECT COUNT(*)')) {
      return { count: memories.size } as T;
    }

    return undefined;
  }

  all(...params: unknown[]): T[] {
    const memories = this.db._getMemories();
    const ftsData = this.db._getFtsData();

    // FTS search
    if (this.sql.includes('memories_fts MATCH')) {
      const query = (params[0] as string).toLowerCase();
      const limit = params[1] as number;
      const results: T[] = [];

      for (const [key, fts] of ftsData.entries()) {
        if (results.length >= limit) break;

        const searchText = `${fts.key} ${fts.value} ${fts.tags}`.toLowerCase();
        if (searchText.includes(query)) {
          const row = memories.get(key);
          if (row !== undefined) {
            results.push(row as T);
          }
        }
      }

      return results;
    }

    // SELECT all with limit
    if (this.sql.includes('SELECT') && this.sql.includes('LIMIT')) {
      const limit = params[0] as number;
      const results: T[] = [];

      for (const row of memories.values()) {
        if (results.length >= limit) break;
        results.push(row as T);
      }

      return results;
    }

    return [];
  }
}

/**
 * Create test HybridMemoryBackend with mock database.
 */
function createTestBackend(
  overrides: Partial<HybridMemoryConfig> = {},
  mockDb?: MockSQLiteDatabase
): { backend: HybridMemoryBackend; mockDb: MockSQLiteDatabase; mockLogger: MockLogger } {
  const mockLogger = createMockLogger();
  const db = mockDb ?? new MockSQLiteDatabase();

  const backend = new HybridMemoryBackend({
    dbPath: ':memory:',
    markdownDir: '/tmp/test-memories',
    logger: mockLogger,
    ...overrides,
  });

  // Initialize with mock database
  backend.initializeWithDatabase(db);

  return { backend, mockDb: db, mockLogger };
}

// ============================================================================
// Tests
// ============================================================================

describe('HybridMemoryBackend', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Create temp directory for Markdown files
    tmpDir = `/tmp/test-memories-${String(Date.now())}`;
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create with valid config', () => {
      const backend = new HybridMemoryBackend({
        dbPath: ':memory:',
        markdownDir: tmpDir,
      });
      expect(backend).toBeInstanceOf(HybridMemoryBackend);
    });

    it('should throw ValidationError for empty dbPath', () => {
      expect(() => {
        new HybridMemoryBackend({
          dbPath: '',
          markdownDir: tmpDir,
        });
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for empty markdownDir', () => {
      expect(() => {
        new HybridMemoryBackend({
          dbPath: ':memory:',
          markdownDir: '',
        });
      }).toThrow(ValidationError);
    });

    it('should accept custom logger', () => {
      const mockLogger = createMockLogger();
      const backend = new HybridMemoryBackend({
        dbPath: ':memory:',
        markdownDir: tmpDir,
        logger: mockLogger,
      });

      backend.initializeWithDatabase(new MockSQLiteDatabase());
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('store', () => {
    it('should store a memory with low importance', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.store(
        'test-key',
        { data: 'test' },
        {
          importance: MemoryImportance.LOW,
        }
      );

      expect(result.ok).toBe(true);
    });

    it('should store a memory with high importance and create Markdown', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.store(
        'high-importance-key',
        { data: 'important' },
        {
          importance: MemoryImportance.HIGH,
          tags: ['important', 'test'],
        }
      );

      expect(result.ok).toBe(true);

      // Check Markdown file was created
      const mdPath = path.join(tmpDir, 'high-importance-key.md');
      expect(fs.existsSync(mdPath)).toBe(true);

      const content = fs.readFileSync(mdPath, 'utf-8');
      expect(content).toContain('# Memory: high-importance-key');
      expect(content).toContain('**Importance:** high');
      expect(content).toContain('**Tags:** important, test');
    });

    it('should store memory with TTL', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.store('ttl-key', 'expiring-data', {
        importance: MemoryImportance.MEDIUM,
        ttl: 60000, // 1 minute
      });

      expect(result.ok).toBe(true);
    });

    it('should reject empty key', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.store('', 'data', {
        importance: MemoryImportance.LOW,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.message).toContain('Invalid key');
      }
    });

    it('should reject invalid importance level', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.store('key', 'data', {
        importance: 'invalid' as MemoryImportance,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.message).toContain('Invalid metadata');
      }
    });

    it('should update existing memory with same key', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('update-key', 'original', {
        importance: MemoryImportance.LOW,
      });

      const result = await backend.store('update-key', 'updated', {
        importance: MemoryImportance.MEDIUM,
      });

      expect(result.ok).toBe(true);

      const retrieved = await backend.retrieve('update-key');
      expect(retrieved.ok).toBe(true);
      if (retrieved.ok) {
        expect(retrieved.value).toBe('updated');
      }
    });
  });

  describe('retrieve', () => {
    it('should retrieve stored memory', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store(
        'retrieve-key',
        { nested: { data: 123 } },
        {
          importance: MemoryImportance.LOW,
        }
      );

      const result = await backend.retrieve('retrieve-key');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ nested: { data: 123 } });
      }
    });

    it('should return null for non-existent key', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.retrieve('non-existent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should auto-expire TTL entries', async () => {
      const { backend, mockDb } = createTestBackend({ markdownDir: tmpDir });

      // Store with TTL that has already expired
      const memories = mockDb._getMemories();
      const now = Date.now();
      memories.set('expired-key', {
        key: 'expired-key',
        value: '"expired-data"',
        metadata: JSON.stringify({ importance: 'low', ttl: 1000 }),
        created_at: now - 10000,
        accessed_at: now - 10000,
        expires_at: now - 5000, // Expired 5 seconds ago
        rowid: 1,
      });

      const result = await backend.retrieve('expired-key');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should not expire valid TTL entries', async () => {
      const { backend, mockDb } = createTestBackend({ markdownDir: tmpDir });

      // Store with TTL that hasn't expired
      const memories = mockDb._getMemories();
      const now = Date.now();
      memories.set('valid-ttl-key', {
        key: 'valid-ttl-key',
        value: '"valid-data"',
        metadata: JSON.stringify({ importance: 'low', ttl: 60000 }),
        created_at: now - 1000,
        accessed_at: now - 1000,
        expires_at: now + 59000, // Expires in 59 seconds
        rowid: 1,
      });
      mockDb._getFtsData().set('valid-ttl-key', {
        key: 'valid-ttl-key',
        value: '"valid-data"',
        tags: '',
      });

      const result = await backend.retrieve('valid-ttl-key');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('valid-data');
      }
    });
  });

  describe('search', () => {
    it('should find memories by content', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('search-1', 'hello world', {
        importance: MemoryImportance.LOW,
      });
      await backend.store('search-2', 'goodbye world', {
        importance: MemoryImportance.LOW,
      });
      await backend.store('search-3', 'hello there', {
        importance: MemoryImportance.LOW,
      });

      const result = await backend.search('hello', 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const keys = result.value.map((e) => e.key);
        expect(keys).toContain('search-1');
        expect(keys).toContain('search-3');
      }
    });

    it('should find memories by key', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store(
        'user-preferences',
        { theme: 'dark' },
        {
          importance: MemoryImportance.HIGH,
        }
      );
      await backend.store(
        'system-config',
        { debug: true },
        {
          importance: MemoryImportance.LOW,
        }
      );

      const result = await backend.search('user', 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.key).toBe('user-preferences');
      }
    });

    it('should find memories by tags', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('tagged-1', 'data1', {
        importance: MemoryImportance.LOW,
        tags: ['config', 'important'],
      });
      await backend.store('tagged-2', 'data2', {
        importance: MemoryImportance.LOW,
        tags: ['logs', 'debug'],
      });

      const result = await backend.search('config', 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.key).toBe('tagged-1');
      }
    });

    it('should respect limit', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      for (let i = 0; i < 10; i++) {
        await backend.store(`limit-test-${String(i)}`, `content ${String(i)}`, {
          importance: MemoryImportance.LOW,
        });
      }

      const result = await backend.search('content', 3);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
      }
    });

    it('should reject invalid limit', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result1 = await backend.search('test', 0);
      expect(result1.ok).toBe(false);

      const result2 = await backend.search('test', 1001);
      expect(result2.ok).toBe(false);
    });

    it('should return empty array for no matches', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('some-key', 'some-value', {
        importance: MemoryImportance.LOW,
      });

      const result = await backend.search('nonexistent', 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('should sanitize FTS query', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('test-key', 'test value', {
        importance: MemoryImportance.LOW,
      });

      // These queries contain FTS5 special characters that should be sanitized
      const result = await backend.search('test* OR value"', 10);

      expect(result.ok).toBe(true);
      // Should not throw despite special characters
    });
  });

  describe('prune', () => {
    it('should remove memories older than cutoff', async () => {
      const { backend, mockDb } = createTestBackend({ markdownDir: tmpDir });

      const now = Date.now();
      const memories = mockDb._getMemories();

      // Add old memory
      memories.set('old-key', {
        key: 'old-key',
        value: '"old"',
        metadata: JSON.stringify({ importance: 'low' }),
        created_at: now - 100000, // 100 seconds ago
        accessed_at: now - 100000,
        expires_at: null,
        rowid: 1,
      });

      // Add new memory
      memories.set('new-key', {
        key: 'new-key',
        value: '"new"',
        metadata: JSON.stringify({ importance: 'low' }),
        created_at: now - 1000, // 1 second ago
        accessed_at: now - 1000,
        expires_at: null,
        rowid: 2,
      });

      const cutoff = new Date(now - 50000); // 50 seconds ago
      const result = await backend.prune(cutoff);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(1);
      }

      // Verify old key was deleted
      const oldResult = await backend.retrieve('old-key');
      expect(oldResult.ok).toBe(true);
      if (oldResult.ok) {
        expect(oldResult.value).toBeNull();
      }

      // Verify new key still exists
      const newResult = await backend.retrieve('new-key');
      expect(newResult.ok).toBe(true);
      if (newResult.ok) {
        expect(newResult.value).toBe('new');
      }
    });

    it('should return 0 when nothing to prune', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('recent-key', 'recent', {
        importance: MemoryImportance.LOW,
      });

      const cutoff = new Date(Date.now() - 1000000); // Very old cutoff
      const result = await backend.prune(cutoff);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe('expireAll', () => {
    it('should remove all expired entries', async () => {
      const { backend, mockDb } = createTestBackend({ markdownDir: tmpDir });

      const now = Date.now();
      const memories = mockDb._getMemories();

      // Add expired memory
      memories.set('expired-1', {
        key: 'expired-1',
        value: '"expired"',
        metadata: JSON.stringify({ importance: 'low', ttl: 1000 }),
        created_at: now - 10000,
        accessed_at: now - 10000,
        expires_at: now - 5000,
        rowid: 1,
      });

      // Add non-expired memory with TTL
      memories.set('valid-1', {
        key: 'valid-1',
        value: '"valid"',
        metadata: JSON.stringify({ importance: 'low', ttl: 60000 }),
        created_at: now - 1000,
        accessed_at: now - 1000,
        expires_at: now + 59000,
        rowid: 2,
      });

      // Add memory without TTL
      memories.set('no-ttl', {
        key: 'no-ttl',
        value: '"permanent"',
        metadata: JSON.stringify({ importance: 'high' }),
        created_at: now - 100000,
        accessed_at: now - 100000,
        expires_at: null,
        rowid: 3,
      });

      const result = await backend.expireAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(1);
      }
    });
  });

  describe('delete', () => {
    it('should delete existing memory', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('delete-key', 'to-delete', {
        importance: MemoryImportance.LOW,
      });

      const result = await backend.delete('delete-key');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }

      const retrieved = await backend.retrieve('delete-key');
      expect(retrieved.ok).toBe(true);
      if (retrieved.ok) {
        expect(retrieved.value).toBeNull();
      }
    });

    it('should return false for non-existent key', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.delete('non-existent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('should delete associated Markdown file', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('md-delete-key', 'important-data', {
        importance: MemoryImportance.HIGH,
      });

      const mdPath = path.join(tmpDir, 'md-delete-key.md');
      expect(fs.existsSync(mdPath)).toBe(true);

      await backend.delete('md-delete-key');

      expect(fs.existsSync(mdPath)).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all memories', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('key-1', 'value-1', { importance: MemoryImportance.LOW });
      await backend.store('key-2', 'value-2', { importance: MemoryImportance.MEDIUM });
      await backend.store('key-3', 'value-3', { importance: MemoryImportance.HIGH });

      const result = await backend.getAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
      }
    });

    it('should respect limit', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      for (let i = 0; i < 10; i++) {
        await backend.store(`key-${String(i)}`, `value-${String(i)}`, {
          importance: MemoryImportance.LOW,
        });
      }

      const result = await backend.getAll(5);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
      }
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('count-1', 'v1', { importance: MemoryImportance.LOW });
      await backend.store('count-2', 'v2', { importance: MemoryImportance.LOW });

      const result = await backend.count();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });

    it('should return 0 for empty backend', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      const result = await backend.count();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe('close', () => {
    it('should close database connection', () => {
      const { backend, mockLogger } = createTestBackend({ markdownDir: tmpDir });

      backend.close();

      expect(mockLogger.info).toHaveBeenCalledWith('HybridMemoryBackend closed');
    });

    it('should be safe to call multiple times', () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      backend.close();
      expect(() => {
        backend.close();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should return error Result for uninitialized backend', async () => {
      const backend = new HybridMemoryBackend({
        dbPath: ':memory:',
        markdownDir: tmpDir,
      });

      // Don't call initialize()

      const result = await backend.store('key', 'value', { importance: MemoryImportance.LOW });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.message).toContain('Failed to store memory');
      }
    });
  });

  describe('Markdown export', () => {
    it('should format string values correctly', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('string-key', 'This is a plain string value', {
        importance: MemoryImportance.HIGH,
      });

      const mdPath = path.join(tmpDir, 'string-key.md');
      const content = fs.readFileSync(mdPath, 'utf-8');

      expect(content).toContain('This is a plain string value');
      expect(content).not.toContain('```json');
    });

    it('should format object values as JSON', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store(
        'object-key',
        { nested: { data: [1, 2, 3] } },
        {
          importance: MemoryImportance.HIGH,
        }
      );

      const mdPath = path.join(tmpDir, 'object-key.md');
      const content = fs.readFileSync(mdPath, 'utf-8');

      expect(content).toContain('```json');
      expect(content).toContain('"nested"');
    });

    it('should format null values correctly', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('null-key', null, {
        importance: MemoryImportance.HIGH,
      });

      const mdPath = path.join(tmpDir, 'null-key.md');
      const content = fs.readFileSync(mdPath, 'utf-8');

      expect(content).toContain('`null`');
    });

    it('should include TTL expiration in Markdown', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('ttl-md-key', 'data', {
        importance: MemoryImportance.HIGH,
        ttl: 3600000, // 1 hour
      });

      const mdPath = path.join(tmpDir, 'ttl-md-key.md');
      const content = fs.readFileSync(mdPath, 'utf-8');

      expect(content).toContain('**Expires:**');
    });

    it('should sanitize unsafe characters in filename', async () => {
      const { backend } = createTestBackend({ markdownDir: tmpDir });

      await backend.store('unsafe/key:with*chars', 'data', {
        importance: MemoryImportance.HIGH,
      });

      // Should create file with sanitized name
      const mdPath = path.join(tmpDir, 'unsafe_key_with_chars.md');
      expect(fs.existsSync(mdPath)).toBe(true);
    });
  });
});

describe('MemoryImportance', () => {
  it('should have correct values', () => {
    expect(MemoryImportance.LOW).toBe('low');
    expect(MemoryImportance.MEDIUM).toBe('medium');
    expect(MemoryImportance.HIGH).toBe('high');
  });
});

describe('MemoryError', () => {
  it('should be instance of NexusError', () => {
    const error = new MemoryError('Test error');
    expect(error.name).toBe('MemoryError');
    expect(error.message).toBe('Test error');
  });

  it('should include context', () => {
    const error = new MemoryError('Test error', {
      context: { key: 'test-key' },
    });
    expect(error.context).toEqual({ key: 'test-key' });
  });

  it('should include cause', () => {
    const cause = new Error('Original error');
    const error = new MemoryError('Wrapped error', { cause });
    expect(error.cause).toBe(cause);
  });
});
