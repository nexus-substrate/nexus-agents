/**
 * Tests for SQLite Session Storage.
 * (Source: Issue #190)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteSessionStorage, createSessionStorage } from './session-storage.js';
import type {
  ISQLiteDatabase,
  ISQLiteStatement,
  SessionRow,
  TaskRow,
  SessionSummaryRow,
} from './session-storage-types.js';

// ============================================================================
// Mock Helpers (split to reduce complexity)
// ============================================================================

function createMockStatement<T>(
  data: Map<string, T>,
  type: 'insert' | 'select' | 'delete' | 'update'
): ISQLiteStatement<T> {
  let lastInsertId = 0;
  return {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
      if (type === 'delete') {
        const deleted = data.has(String(params[0])) ? 1 : 0;
        data.delete(String(params[0]));
        return { changes: deleted, lastInsertRowid: 0 };
      }
      if (type === 'insert') return { changes: 1, lastInsertRowid: ++lastInsertId };
      return { changes: 1, lastInsertRowid: 0 };
    },
    get(...params: unknown[]): T | undefined {
      return data.get(String(params[0]));
    },
    all(): T[] {
      return [...data.values()];
    },
  };
}

function createCountStatement<T>(count: number): ISQLiteStatement<T> {
  return {
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
    get: () => ({ count }) as T,
    all: () => [],
  };
}

function createSummaryStatement<T>(
  sessions: Map<string, SessionRow>,
  tasks: Map<string, TaskRow>
): ISQLiteStatement<T> {
  const summaries: SessionSummaryRow[] = [...sessions.values()].map((s) => ({
    id: s.id,
    created_at: s.created_at,
    updated_at: s.updated_at,
    status: s.status,
    task_count: [...tasks.values()].filter((t) => t.session_id === s.id).length,
    total_duration_ms: null,
    total_tokens: null,
    total_cost_usd: null,
  }));
  return {
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
    get: () => summaries[0] as T,
    all: () => summaries as T[],
  };
}

function getStatementType(sql: string): 'insert' | 'select' | 'delete' | 'update' {
  if (sql.includes('INSERT')) return 'insert';
  if (sql.includes('UPDATE')) return 'update';
  if (sql.includes('DELETE')) return 'delete';
  return 'select';
}

// ============================================================================
// Mock Database
// ============================================================================

class MockDatabase implements ISQLiteDatabase {
  private readonly sessions: Map<string, SessionRow> = new Map();
  private readonly tasks: Map<string, TaskRow> = new Map();

  exec(): void {
    // No-op for CREATE TABLE statements
  }

  prepare<T>(sql: string): ISQLiteStatement<T> {
    if (sql.includes('COUNT(*)')) {
      const count = sql.includes('sessions') ? this.sessions.size : this.tasks.size;
      return createCountStatement<T>(count);
    }
    if (sql.includes('task_count')) {
      return createSummaryStatement<T>(this.sessions, this.tasks);
    }
    if (sql.includes('sessions')) {
      return createMockStatement(this.sessions as Map<string, T>, getStatementType(sql));
    }
    if (sql.includes('tasks')) {
      return createMockStatement(this.tasks as Map<string, T>, getStatementType(sql));
    }
    return createMockStatement(new Map<string, T>(), 'select');
  }

  close(): void {
    this.sessions.clear();
    this.tasks.clear();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('SQLiteSessionStorage', () => {
  let storage: SQLiteSessionStorage;
  let mockDb: MockDatabase;

  beforeEach(() => {
    mockDb = new MockDatabase();
    storage = createSessionStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(mockDb);
  });

  afterEach(() => {
    storage.close();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(storage).toBeInstanceOf(SQLiteSessionStorage);
    });

    it('should throw on invalid config', () => {
      expect(() => createSessionStorage({ dbPath: '' })).toThrow('Invalid SessionStorageConfig');
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const result = await storage.createSession();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toMatch(/^ses_/);
        expect(result.value.status).toBe('active');
        expect(result.value.metadata).toEqual({});
      }
    });

    it('should create session with metadata', async () => {
      const metadata = { cliVersion: '2.0.0', tags: ['test'] };
      const result = await storage.createSession(metadata);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata).toEqual(metadata);
      }
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await storage.getSession('nonexistent');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('listSessions', () => {
    it('should list sessions with summaries', async () => {
      const result = await storage.listSessions();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('should respect limit parameter', async () => {
      const result = await storage.listSessions(5);
      expect(result.ok).toBe(true);
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      const result = await storage.updateSessionStatus('ses_test', 'completed');
      expect(result.ok).toBe(true);
    });
  });

  describe('addTask', () => {
    it('should add a task to a session', async () => {
      const result = await storage.addTask('ses_test', 'Test task description');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toMatch(/^tsk_/);
        expect(result.value.task).toBe('Test task description');
        expect(result.value.status).toBe('pending');
      }
    });
  });

  describe('updateTask', () => {
    it('should update task with result', async () => {
      const result = await storage.updateTask('tsk_test', {
        result: 'Task completed successfully',
        status: 'completed',
        durationMs: 1500,
        tokensUsed: 2000,
        costUsd: 0.05,
      });
      expect(result.ok).toBe(true);
    });

    it('should update task with failure', async () => {
      const result = await storage.updateTask('tsk_test', {
        status: 'failed',
        result: 'Error: Connection timeout',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('should return tasks for session', async () => {
      const result = await storage.getTasks('ses_test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      const result = await storage.getStats();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.sessions).toBe('number');
        expect(typeof result.value.tasks).toBe('number');
      }
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      const result = await storage.deleteSession('ses_test');
      expect(result.ok).toBe(true);
    });
  });

  describe('prune', () => {
    it('should prune old sessions', async () => {
      const result = await storage.prune(new Date(Date.now() - 86400000)); // 1 day ago
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value).toBe('number');
      }
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      expect(() => {
        storage.close();
      }).not.toThrow();
    });

    it('should be idempotent', () => {
      storage.close();
      expect(() => {
        storage.close();
      }).not.toThrow();
    });
  });
});

describe('Session storage helpers', () => {
  describe('generateSessionId', () => {
    it('should generate unique IDs', async () => {
      const { generateSessionId } = await import('./session-storage-helpers.js');
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^ses_/);
    });
  });

  describe('generateTaskId', () => {
    it('should generate unique IDs', async () => {
      const { generateTaskId } = await import('./session-storage-helpers.js');
      const id1 = generateTaskId();
      const id2 = generateTaskId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^tsk_/);
    });
  });

  describe('rowToSession', () => {
    it('should convert row to session', async () => {
      const { rowToSession } = await import('./session-storage-helpers.js');
      const row = {
        id: 'ses_test',
        created_at: '2026-01-11T12:00:00Z',
        updated_at: '2026-01-11T12:00:00Z',
        status: 'active',
        metadata: '{"cliVersion":"2.0.0"}',
      };
      const session = rowToSession(row);
      expect(session.id).toBe('ses_test');
      expect(session.status).toBe('active');
      expect(session.metadata.cliVersion).toBe('2.0.0');
    });
  });
});
