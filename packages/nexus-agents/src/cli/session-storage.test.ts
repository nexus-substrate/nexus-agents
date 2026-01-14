/**
 * Tests for session-storage
 *
 * (Source: Issue #249 - CLI test coverage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQLiteSessionStorage, createSessionStorage } from './session-storage.js';
import type { ISQLiteDatabase, SessionStorageConfig } from './session-storage-types.js';

// Mock core modules
vi.mock('../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('session-storage', () => {
  const createMockDb = (): {
    exec: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } => {
    const mockStatement = {
      run: vi.fn().mockReturnValue({ changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    };
    return {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue(mockStatement),
      close: vi.fn(),
    };
  };

  const createValidConfig = (): SessionStorageConfig => ({
    dbPath: '/tmp/test.db',
    maxSessions: 100,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create storage with valid config', () => {
      const config = createValidConfig();

      const storage = new SQLiteSessionStorage(config);

      expect(storage).toBeInstanceOf(SQLiteSessionStorage);
    });

    it('should throw on invalid config', () => {
      const invalidConfig = { dbPath: '' };

      expect(() => new SQLiteSessionStorage(invalidConfig as SessionStorageConfig)).toThrow(
        'Invalid SessionStorageConfig'
      );
    });

    it('should use default maxSessions', () => {
      const config = { dbPath: '/tmp/test.db' };

      const storage = new SQLiteSessionStorage(config);

      expect(storage).toBeInstanceOf(SQLiteSessionStorage);
    });
  });

  describe('initializeWithDatabase', () => {
    it('should initialize with provided database', () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      expect(mockDb.exec).toHaveBeenCalled();
    });

    it('should create tables on initialization', () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      // Should create sessions table, tasks table, and indexes
      expect(mockDb.exec).toHaveBeenCalledTimes(6); // 2 tables + 4 indexes
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.createSession({ tags: ['test'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toMatch(/^ses_/);
        expect(result.value.status).toBe('active');
        expect(result.value.metadata).toEqual({ tags: ['test'] });
      }
    });

    it('should create session without metadata', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.createSession();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata).toEqual({});
      }
    });

    it('should fail if not initialized', async () => {
      const storage = new SQLiteSessionStorage(createValidConfig());

      const result = await storage.createSession();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to create session');
      }
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      const mockDb = createMockDb();
      const mockStatement = mockDb.prepare();
      (mockStatement.get as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'ses_test',
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T10:00:00Z',
        status: 'active',
        metadata: '{}',
      });

      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.getSession('ses_test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.id).toBe('ses_test');
      }
    });

    it('should return null when session not found', async () => {
      const mockDb = createMockDb();
      const mockStatement = mockDb.prepare();
      (mockStatement.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.getSession('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('getSessionWithTasks', () => {
    it('should return session with tasks', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      let prepareCallCount = 0;

      mockDb.prepare.mockImplementation(() => {
        prepareCallCount++;
        // First call is session query, second is tasks query
        if (prepareCallCount === 1) {
          return {
            get: vi.fn().mockReturnValue({
              id: 'ses_test',
              created_at: '2026-01-14T10:00:00Z',
              updated_at: '2026-01-14T10:00:00Z',
              status: 'completed',
              metadata: '{}',
            }),
            run: vi.fn(),
            all: vi.fn(),
          };
        }
        // Tasks query
        return {
          get: vi.fn(),
          run: vi.fn(),
          all: vi.fn().mockReturnValue([
            {
              id: 'tsk_1',
              session_id: 'ses_test',
              task: 'Task 1',
              result: 'Done',
              status: 'completed',
              duration_ms: 1000,
              tokens_used: 100,
              cost_usd: 0.01,
              created_at: '2026-01-14T10:00:00Z',
            },
          ]),
        };
      });

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);
      prepareCallCount = 0; // Reset after initialization
      const result = await storage.getSessionWithTasks('ses_test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.id).toBe('ses_test');
        expect(result.value?.tasks).toHaveLength(1);
        expect(result.value?.tasks[0]?.task).toBe('Task 1');
      }
    });

    it('should return null when session not found', async () => {
      const mockDb = createMockDb();
      const mockStatement = mockDb.prepare();
      (mockStatement.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.getSessionWithTasks('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.updateSessionStatus('ses_test', 'completed');

      expect(result.ok).toBe(true);
    });
  });

  describe('updateSessionMetadata', () => {
    it('should update session metadata', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.updateSessionMetadata('ses_test', { cliVersion: '1.0.0' });

      expect(result.ok).toBe(true);
    });
  });

  describe('listSessions', () => {
    it('should list sessions with summaries', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());

      mockDb.prepare.mockImplementation(() => {
        return {
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn().mockReturnValue([
            {
              id: 'ses_1',
              created_at: '2026-01-14T10:00:00Z',
              updated_at: '2026-01-14T11:00:00Z',
              status: 'completed',
              task_count: 5,
              total_duration_ms: 10000,
              total_tokens: 5000,
              total_cost_usd: 0.25,
            },
          ]),
        };
      });

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);
      const result = await storage.listSessions(10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.taskCount).toBe(5);
      }
    });
  });

  describe('addTask', () => {
    it('should add a task to session', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

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
    it('should update task', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.updateTask('tsk_test', {
        status: 'completed',
        result: 'Task completed',
        durationMs: 1500,
        tokensUsed: 2000,
        costUsd: 0.05,
      });

      expect(result.ok).toBe(true);
    });

    it('should update task with minimal fields', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.updateTask('tsk_test', { status: 'failed' });

      expect(result.ok).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('should return tasks for session', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());

      mockDb.prepare.mockImplementation(() => {
        return {
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn().mockReturnValue([
            {
              id: 'tsk_1',
              session_id: 'ses_test',
              task: 'Task 1',
              result: null,
              status: 'pending',
              duration_ms: null,
              tokens_used: null,
              cost_usd: null,
              created_at: '2026-01-14T10:00:00Z',
            },
          ]),
        };
      });

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);
      const result = await storage.getTasks('ses_test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });

  describe('deleteSession', () => {
    it('should delete session and return true', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.deleteSession('ses_test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('should return false when session not found', async () => {
      const mockDb = createMockDb();
      const mockStatement = mockDb.prepare();
      (mockStatement.run as ReturnType<typeof vi.fn>).mockReturnValue({ changes: 0 });

      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const result = await storage.deleteSession('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('prune', () => {
    it('should prune old sessions', async () => {
      const mockDb = createMockDb();
      const mockStatement = mockDb.prepare();
      (mockStatement.run as ReturnType<typeof vi.fn>).mockReturnValue({ changes: 5 });

      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      const cutoffDate = new Date('2026-01-01T00:00:00Z');
      const result = await storage.prune(cutoffDate);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(5);
      }
    });
  });

  describe('getStats', () => {
    it('should return session and task counts', async () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      let prepareCallCount = 0;

      mockDb.prepare.mockImplementation(() => {
        prepareCallCount++;
        // After init reset, first call is sessions count, second is tasks count
        if (prepareCallCount === 1) {
          return { get: vi.fn().mockReturnValue({ count: 10 }), run: vi.fn(), all: vi.fn() };
        }
        return { get: vi.fn().mockReturnValue({ count: 25 }), run: vi.fn(), all: vi.fn() };
      });

      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);
      prepareCallCount = 0;
      const result = await storage.getStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessions).toBe(10);
        expect(result.value.tasks).toBe(25);
      }
    });
  });

  describe('close', () => {
    it('should close the database', () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      storage.close();

      expect(mockDb.close).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple close calls', () => {
      const mockDb = createMockDb();
      const storage = new SQLiteSessionStorage(createValidConfig());
      storage.initializeWithDatabase(mockDb as unknown as ISQLiteDatabase);

      storage.close();
      storage.close();

      expect(mockDb.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('createSessionStorage factory', () => {
    it('should create SQLiteSessionStorage instance', () => {
      const storage = createSessionStorage(createValidConfig());

      expect(storage).toBeInstanceOf(SQLiteSessionStorage);
    });
  });
});
