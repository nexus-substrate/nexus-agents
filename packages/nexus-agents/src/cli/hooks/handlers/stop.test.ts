/**
 * Tests for stop handler
 *
 * Tests incomplete task checking and session summaries.
 *
 * @module cli/hooks/handlers/stop.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StopInput } from '../hook-types.js';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const mockStorage = {
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    getTasks: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: null }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockLogger, mockStorage };
});

// Mock the logger
vi.mock('../../../core/logger.js', () => ({
  createLogger: vi.fn(() => mocks.mockLogger),
}));

// Mock session storage - use class with constructor
vi.mock('../../session-storage.js', () => ({
  SQLiteSessionStorage: class MockSQLiteSessionStorage {
    initialize = mocks.mockStorage.initialize;
    listSessions = mocks.mockStorage.listSessions;
    getTasks = mocks.mockStorage.getTasks;
    getSessionWithTasks = mocks.mockStorage.getSessionWithTasks;
    close = mocks.mockStorage.close;
  },
}));

// Re-export for test access
const mockStorage = mocks.mockStorage;

import { handleStop, type StopHandlerConfig } from './stop.js';

describe('stop handler', () => {
  const createInput = (overrides: Partial<StopInput> = {}): StopInput => ({
    session_id: 'ses_123',
    transcript_path: '/tmp/transcript.json',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...overrides,
  });

  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockStorage.initialize.mockResolvedValue({ ok: true });
    mockStorage.listSessions.mockResolvedValue({
      ok: true,
      value: [{ id: 'stored_ses_456', status: 'active' }],
    });
    mockStorage.getTasks.mockResolvedValue({ ok: true, value: [] });
    mockStorage.getSessionWithTasks.mockResolvedValue({
      ok: true,
      value: {
        id: 'stored_ses_456',
        createdAt: '2026-01-25T10:00:00Z',
        updatedAt: '2026-01-25T11:00:00Z',
        status: 'active',
        metadata: {},
        tasks: [],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handleStop', () => {
    it('should allow stop by default', async () => {
      const input = createInput();

      const result = await handleStop(input);

      expect(result.exitCode).toBe(0);
    });

    it('should allow stop when stop_hook_active is true', async () => {
      const input = createInput({ stop_hook_active: true });

      const result = await handleStop(input);

      expect(result.exitCode).toBe(0);
      expect(mockStorage.initialize).not.toHaveBeenCalled();
    });

    describe('session tracking disabled', () => {
      it('should allow stop when NEXUS_DISABLE_SESSIONS is set', async () => {
        process.env['NEXUS_DISABLE_SESSIONS'] = '1';
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
        expect(mockStorage.initialize).not.toHaveBeenCalled();
      });
    });

    describe('no features enabled', () => {
      it('should allow stop when no features enabled', async () => {
        const input = createInput();
        const config: StopHandlerConfig = {};

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
        expect(mockStorage.initialize).not.toHaveBeenCalled();
      });
    });

    describe('task checking', () => {
      const taskCheckConfig: StopHandlerConfig = { checkTasks: true };

      it('should allow stop when no pending tasks', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: true,
          value: [
            { id: 'tsk_1', task: 'Task 1', status: 'completed' },
            { id: 'tsk_2', task: 'Task 2', status: 'completed' },
          ],
        });
        const input = createInput();

        const result = await handleStop(input, taskCheckConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should allow stop when tasks are failed', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: true,
          value: [{ id: 'tsk_1', task: 'Task 1', status: 'failed' }],
        });
        const input = createInput();

        const result = await handleStop(input, taskCheckConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should not block by default when pending tasks exist', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: true,
          value: [{ id: 'tsk_1', task: 'Pending Task', status: 'pending' }],
        });
        const input = createInput();

        const result = await handleStop(input, taskCheckConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should block when blockOnPendingTasks is true and pending tasks exist', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: true,
          value: [
            { id: 'tsk_1', task: 'Pending Task 1', status: 'pending' },
            { id: 'tsk_2', task: 'Running Task', status: 'running' },
          ],
        });
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true, blockOnPendingTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.decision).toBe('block');
        expect(output.reason).toContain('2 incomplete task(s)');
        expect(output.reason).toContain('Pending Task 1');
        expect(output.reason).toContain('Running Task');
      });

      it('should limit tasks shown in block message', async () => {
        const tasks = Array.from({ length: 10 }, (_, i) => ({
          id: `tsk_${String(i)}`,
          task: `Task ${String(i)}`,
          status: 'pending',
        }));
        mockStorage.getTasks.mockResolvedValue({ ok: true, value: tasks });
        const input = createInput();
        const config: StopHandlerConfig = {
          checkTasks: true,
          blockOnPendingTasks: true,
          maxPendingTasksToShow: 3,
        };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.reason).toContain('Task 0');
        expect(output.reason).toContain('Task 1');
        expect(output.reason).toContain('Task 2');
        expect(output.reason).toContain('and 7 more');
      });

      it('should handle getTasks failure', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: false,
          error: new Error('Query failed'),
        });
        const input = createInput();

        const result = await handleStop(input, taskCheckConfig);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('session summary', () => {
      const summaryConfig: StopHandlerConfig = { generateSummary: true };

      it('should generate session summary', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: true,
          value: {
            id: 'stored_ses_456',
            createdAt: '2026-01-25T10:00:00Z',
            updatedAt: '2026-01-25T11:00:00Z',
            status: 'active',
            metadata: {},
            tasks: [
              {
                id: 'tsk_1',
                task: 'Task 1',
                status: 'completed',
                durationMs: 100,
                tokensUsed: 50,
                costUsd: 0.01,
              },
              {
                id: 'tsk_2',
                task: 'Task 2',
                status: 'failed',
                durationMs: 50,
                tokensUsed: 25,
                costUsd: 0.005,
              },
              {
                id: 'tsk_3',
                task: 'Task 3',
                status: 'pending',
                durationMs: null,
                tokensUsed: null,
                costUsd: null,
              },
            ],
          },
        });
        const input = createInput();

        const result = await handleStop(input, summaryConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should handle getSessionWithTasks failure', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: false,
          error: new Error('Not found'),
        });
        const input = createInput();

        const result = await handleStop(input, summaryConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should handle null session result', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({ ok: true, value: null });
        const input = createInput();

        const result = await handleStop(input, summaryConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should handle empty tasks array', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: true,
          value: {
            id: 'stored_ses_456',
            createdAt: '2026-01-25T10:00:00Z',
            updatedAt: '2026-01-25T11:00:00Z',
            status: 'active',
            metadata: {},
            tasks: [],
          },
        });
        const input = createInput();

        const result = await handleStop(input, summaryConfig);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('storage initialization failure', () => {
      it('should allow stop when storage init fails', async () => {
        mockStorage.initialize.mockResolvedValue({
          ok: false,
          error: new Error('Database locked'),
        });
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('no active session', () => {
      it('should allow stop when no sessions exist', async () => {
        mockStorage.listSessions.mockResolvedValue({ ok: true, value: [] });
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should handle listSessions failure', async () => {
        mockStorage.listSessions.mockResolvedValue({
          ok: false,
          error: new Error('Query failed'),
        });
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('exception handling', () => {
      it('should allow stop on unexpected errors', async () => {
        mockStorage.initialize.mockRejectedValue(new Error('Unexpected error'));
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should handle non-Error throws', async () => {
        mockStorage.initialize.mockRejectedValue('String error');
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('database path configuration', () => {
      it('should use custom database path when provided', async () => {
        const input = createInput();
        const config: StopHandlerConfig = {
          checkTasks: true,
          dbPath: '/custom/path/sessions.db',
        };

        await handleStop(input, config);

        expect(mockStorage.initialize).toHaveBeenCalled();
      });
    });

    describe('storage cleanup', () => {
      it('should close storage after processing', async () => {
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true };

        await handleStop(input, config);

        expect(mockStorage.close).toHaveBeenCalled();
      });
    });

    describe('combined features', () => {
      it('should check tasks and generate summary', async () => {
        mockStorage.getTasks.mockResolvedValue({
          ok: true,
          value: [{ id: 'tsk_1', task: 'Task 1', status: 'completed' }],
        });
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: true,
          value: {
            id: 'stored_ses_456',
            createdAt: '2026-01-25T10:00:00Z',
            updatedAt: '2026-01-25T11:00:00Z',
            status: 'active',
            metadata: {},
            tasks: [
              {
                id: 'tsk_1',
                task: 'Task 1',
                status: 'completed',
                durationMs: 100,
                tokensUsed: 50,
                costUsd: 0.01,
              },
            ],
          },
        });
        const input = createInput();
        const config: StopHandlerConfig = { checkTasks: true, generateSummary: true };

        const result = await handleStop(input, config);

        expect(result.exitCode).toBe(0);
        expect(mockStorage.getTasks).toHaveBeenCalled();
        expect(mockStorage.getSessionWithTasks).toHaveBeenCalled();
      });
    });
  });
});
