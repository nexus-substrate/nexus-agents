/**
 * Tests for session-storage-helpers
 *
 * (Source: Issue #249 - CLI test coverage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSessionsTable,
  createTasksTable,
  createSessionIndexes,
  parseSessionMetadata,
  rowToSession,
  rowToTask,
  rowToSessionSummary,
  generateSessionId,
  generateTaskId,
  getCurrentTimestamp,
} from './session-storage-helpers.js';
import type {
  ISQLiteDatabase,
  SessionRow,
  TaskRow,
  SessionSummaryRow,
} from './session-storage-types.js';

describe('session-storage-helpers', () => {
  describe('Table Creation', () => {
    it('should create sessions table', () => {
      const mockDb = { exec: vi.fn() } as unknown as ISQLiteDatabase;

      createSessionsTable(mockDb);

      expect(mockDb.exec).toHaveBeenCalledTimes(1);
      const sql = (mockDb.exec as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS sessions');
      expect(sql).toContain('id TEXT PRIMARY KEY');
      expect(sql).toContain('status TEXT');
    });

    it('should create tasks table', () => {
      const mockDb = { exec: vi.fn() } as unknown as ISQLiteDatabase;

      createTasksTable(mockDb);

      expect(mockDb.exec).toHaveBeenCalledTimes(1);
      const sql = (mockDb.exec as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS tasks');
      expect(sql).toContain('session_id TEXT NOT NULL');
      expect(sql).toContain('FOREIGN KEY');
    });

    it('should create indexes', () => {
      const mockDb = { exec: vi.fn() } as unknown as ISQLiteDatabase;

      createSessionIndexes(mockDb);

      expect(mockDb.exec).toHaveBeenCalledTimes(4);
      const calls = (mockDb.exec as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
      expect(calls.some((c) => c[0].includes('idx_sessions_created_at'))).toBe(true);
      expect(calls.some((c) => c[0].includes('idx_sessions_status'))).toBe(true);
      expect(calls.some((c) => c[0].includes('idx_tasks_session_id'))).toBe(true);
      expect(calls.some((c) => c[0].includes('idx_tasks_created_at'))).toBe(true);
    });
  });

  describe('parseSessionMetadata', () => {
    it('should parse valid JSON metadata', () => {
      const result = parseSessionMetadata('{"key": "value", "count": 42}');

      expect(result).toEqual({ key: 'value', count: 42 });
    });

    it('should return empty object for invalid JSON', () => {
      const result = parseSessionMetadata('not valid json');

      expect(result).toEqual({});
    });

    it('should return empty object for empty string', () => {
      const result = parseSessionMetadata('');

      expect(result).toEqual({});
    });
  });

  describe('rowToSession', () => {
    it('should convert session row to StoredSession', () => {
      const row: SessionRow = {
        id: 'ses_abc123',
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T11:00:00Z',
        status: 'completed',
        metadata: '{"workflow": "test"}',
      };

      const result = rowToSession(row);

      expect(result).toEqual({
        id: 'ses_abc123',
        createdAt: '2026-01-14T10:00:00Z',
        updatedAt: '2026-01-14T11:00:00Z',
        status: 'completed',
        metadata: { workflow: 'test' },
      });
    });

    it('should handle empty metadata', () => {
      const row: SessionRow = {
        id: 'ses_abc123',
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T10:00:00Z',
        status: 'active',
        metadata: '{}',
      };

      const result = rowToSession(row);

      expect(result.metadata).toEqual({});
    });

    it('should handle all status types', () => {
      const statuses = ['active', 'completed', 'error'] as const;

      for (const status of statuses) {
        const row: SessionRow = {
          id: 'ses_test',
          created_at: '2026-01-14T10:00:00Z',
          updated_at: '2026-01-14T10:00:00Z',
          status,
          metadata: '{}',
        };

        const result = rowToSession(row);
        expect(result.status).toBe(status);
      }
    });
  });

  describe('rowToTask', () => {
    it('should convert task row to StoredTask', () => {
      const row: TaskRow = {
        id: 'tsk_xyz789',
        session_id: 'ses_abc123',
        task: 'Test task description',
        result: 'Task completed successfully',
        status: 'completed',
        duration_ms: 1500,
        tokens_used: 2000,
        cost_usd: 0.05,
        created_at: '2026-01-14T10:00:00Z',
      };

      const result = rowToTask(row);

      expect(result).toEqual({
        id: 'tsk_xyz789',
        sessionId: 'ses_abc123',
        task: 'Test task description',
        result: 'Task completed successfully',
        status: 'completed',
        durationMs: 1500,
        tokensUsed: 2000,
        costUsd: 0.05,
        createdAt: '2026-01-14T10:00:00Z',
      });
    });

    it('should handle null optional fields', () => {
      const row: TaskRow = {
        id: 'tsk_xyz789',
        session_id: 'ses_abc123',
        task: 'Pending task',
        result: null,
        status: 'pending',
        duration_ms: null,
        tokens_used: null,
        cost_usd: null,
        created_at: '2026-01-14T10:00:00Z',
      };

      const result = rowToTask(row);

      expect(result.result).toBeUndefined();
      expect(result.durationMs).toBeUndefined();
      expect(result.tokensUsed).toBeUndefined();
      expect(result.costUsd).toBeUndefined();
    });

    it('should handle all task statuses', () => {
      const statuses = ['pending', 'running', 'completed', 'failed'] as const;

      for (const status of statuses) {
        const row: TaskRow = {
          id: 'tsk_test',
          session_id: 'ses_test',
          task: 'test',
          result: null,
          status,
          duration_ms: null,
          tokens_used: null,
          cost_usd: null,
          created_at: '2026-01-14T10:00:00Z',
        };

        const result = rowToTask(row);
        expect(result.status).toBe(status);
      }
    });
  });

  describe('rowToSessionSummary', () => {
    it('should convert summary row to SessionSummary', () => {
      const row: SessionSummaryRow = {
        id: 'ses_abc123',
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T11:00:00Z',
        status: 'completed',
        task_count: 5,
        total_duration_ms: 10000,
        total_tokens: 5000,
        total_cost_usd: 0.25,
      };

      const result = rowToSessionSummary(row);

      expect(result).toEqual({
        id: 'ses_abc123',
        createdAt: '2026-01-14T10:00:00Z',
        updatedAt: '2026-01-14T11:00:00Z',
        status: 'completed',
        taskCount: 5,
        totalDurationMs: 10000,
        totalTokens: 5000,
        totalCostUsd: 0.25,
      });
    });

    it('should default null aggregates to zero', () => {
      const row: SessionSummaryRow = {
        id: 'ses_abc123',
        created_at: '2026-01-14T10:00:00Z',
        updated_at: '2026-01-14T10:00:00Z',
        status: 'active',
        task_count: 0,
        total_duration_ms: null,
        total_tokens: null,
        total_cost_usd: null,
      };

      const result = rowToSessionSummary(row);

      expect(result.totalDurationMs).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.totalCostUsd).toBe(0);
    });
  });

  describe('ID Generation', () => {
    describe('generateSessionId', () => {
      it('should generate unique session IDs', () => {
        const ids = new Set<string>();

        for (let i = 0; i < 100; i++) {
          ids.add(generateSessionId());
        }

        expect(ids.size).toBe(100);
      });

      it('should have correct format', () => {
        const id = generateSessionId();

        expect(id).toMatch(/^ses_[a-z0-9]+_[a-z0-9]+$/);
      });
    });

    describe('generateTaskId', () => {
      it('should generate unique task IDs', () => {
        const ids = new Set<string>();

        for (let i = 0; i < 100; i++) {
          ids.add(generateTaskId());
        }

        expect(ids.size).toBe(100);
      });

      it('should have correct format', () => {
        const id = generateTaskId();

        expect(id).toMatch(/^tsk_[a-z0-9]+_[a-z0-9]+$/);
      });
    });
  });

  describe('getCurrentTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return ISO format timestamp', () => {
      vi.setSystemTime(new Date('2026-01-14T12:30:45.123Z'));

      const timestamp = getCurrentTimestamp();

      expect(timestamp).toBe('2026-01-14T12:30:45.123Z');
    });

    it('should return current time', () => {
      const before = new Date().toISOString();
      vi.useRealTimers();

      const timestamp = getCurrentTimestamp();

      vi.useFakeTimers();
      const after = new Date().toISOString();

      // Timestamp should be between before and after (or equal)
      expect(timestamp >= before || timestamp <= after).toBe(true);
    });
  });
});
