/**
 * Tests for session-commands CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure proper hoisting with forks pool (Issue #582)
const mocks = vi.hoisted(() => {
  const mockExistsSync = vi.fn();
  const mockMkdirSync = vi.fn();
  const mockWriteFileSync = vi.fn();
  const mockCreateSessionStorage = vi.fn();
  return { mockExistsSync, mockMkdirSync, mockWriteFileSync, mockCreateSessionStorage };
});

// Mock node modules
vi.mock('node:fs', () => ({
  existsSync: mocks.mockExistsSync,
  mkdirSync: mocks.mockMkdirSync,
  writeFileSync: mocks.mockWriteFileSync,
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
}));

// Mock session-storage
vi.mock('./session-storage.js', () => ({
  createSessionStorage: mocks.mockCreateSessionStorage,
  SQLiteSessionStorage: vi.fn(),
}));

// Re-export for test access
const mockCreateSessionStorage = mocks.mockCreateSessionStorage;
const mockExistsSync = mocks.mockExistsSync;
const mockMkdirSync = mocks.mockMkdirSync;
const mockWriteFileSync = mocks.mockWriteFileSync;

import {
  sessionList,
  printSessionList,
  sessionShow,
  printSessionShow,
  sessionExport,
  sessionDelete,
  sessionPrune,
  sessionCommand,
  getDefaultDbPath,
} from './session-commands.js';

describe('session-commands', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: any;

  const createMockStorage = (
    overrides: Record<string, unknown> = {}
  ): {
    initialize: ReturnType<typeof vi.fn>;
    listSessions: ReturnType<typeof vi.fn>;
    getSessionWithTasks: ReturnType<typeof vi.fn>;
    deleteSession: ReturnType<typeof vi.fn>;
    prune: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } => ({
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: null }),
    deleteSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    prune: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    close: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockExistsSync.mockReturnValue(true);
    // Set up default mock storage (Issue #582 - process.exit mock doesn't stop execution)
    mockCreateSessionStorage.mockReturnValue(createMockStorage() as never);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('getDefaultDbPath', () => {
    it('should return path in home directory', () => {
      const path = getDefaultDbPath();
      expect(path).toContain('.nexus-agents');
      expect(path).toContain('sessions.db');
    });
  });

  describe('sessionList', () => {
    it('should list sessions successfully', async () => {
      const mockStorage = createMockStorage({
        listSessions: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            {
              id: 'session-1',
              status: 'completed',
              taskCount: 5,
              totalDurationMs: 60000,
              totalTokens: 1000,
              totalCostUsd: 0.05,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionList({ limit: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.id).toBe('session-1');
      }
    });

    it('should return error when storage init fails', async () => {
      const mockStorage = createMockStorage({
        initialize: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('DB init failed'),
        }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionList();

      expect(result.ok).toBe(false);
    });

    it('should create directory if not exists', async () => {
      mockExistsSync.mockReturnValue(false);
      const mockStorage = createMockStorage();
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionList();

      expect(mockMkdirSync).toHaveBeenCalled();
    });
  });

  describe('printSessionList', () => {
    it('should print JSON format', () => {
      const sessions = [
        {
          id: 'session-1',
          status: 'completed' as const,
          taskCount: 5,
          totalDurationMs: 60000,
          totalTokens: 1000,
          totalCostUsd: 0.05,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      printSessionList(sessions, 'json');

      const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
      expect((): unknown => JSON.parse(output)).not.toThrow();
    });

    it('should print table format', () => {
      const sessions = [
        {
          id: 'session-1',
          status: 'completed' as const,
          taskCount: 5,
          totalDurationMs: 60000,
          totalTokens: 1000,
          totalCostUsd: 0.05,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      printSessionList(sessions, 'table');

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Sessions');
      expect(output).toContain('session-1');
    });

    it('should handle empty list', () => {
      printSessionList([], 'table');

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('No sessions found');
    });
  });

  describe('sessionShow', () => {
    it('should return session with tasks', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'completed',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: {},
        tasks: [
          {
            id: 'task-1',
            task: 'Test task',
            status: 'completed',
            durationMs: 1000,
          },
        ],
      };
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: mockSession }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionShow({ sessionId: 'session-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.id).toBe('session-1');
      }
    });
  });

  describe('printSessionShow', () => {
    it('should print session not found', () => {
      printSessionShow(null);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('Session not found');
    });

    it('should print session details', () => {
      const session = {
        id: 'session-1',
        status: 'completed' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: { custom: { key: 'value' } },
        tasks: [
          {
            id: 'task-1',
            sessionId: 'session-1',
            task: 'Test task description that is very long and should be truncated',
            status: 'completed' as const,
            durationMs: 1000,
            tokensUsed: 500,
            result: 'Success',
            createdAt: '2026-01-01T10:00:00Z',
          },
        ],
      };

      printSessionShow(session, 'text');

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('session-1');
      expect(output).toContain('Tasks');
    });

    it('should print JSON format', () => {
      const session = {
        id: 'session-1',
        status: 'completed' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: {},
        tasks: [],
      };

      printSessionShow(session, 'json');

      const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
      expect((): unknown => JSON.parse(output)).not.toThrow();
    });
  });

  describe('sessionExport', () => {
    it('should export session as JSON', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'completed',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: {},
        tasks: [],
      };
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: mockSession }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionExport({ sessionId: 'session-1', format: 'json' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((): unknown => JSON.parse(result.value)).not.toThrow();
      }
    });

    it('should export session as markdown', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'completed',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: { custom: { key: 'value' } },
        tasks: [
          {
            id: 'task-1',
            task: 'Test task',
            status: 'completed',
            durationMs: 1000,
            result: 'Done',
          },
        ],
      };
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: mockSession }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionExport({ sessionId: 'session-1', format: 'markdown' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('# Session:');
        expect(result.value).toContain('## Tasks');
      }
    });

    it('should write to file when output specified', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'completed',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: {},
        tasks: [],
      };
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: mockSession }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionExport({
        sessionId: 'session-1',
        output: '/tmp/session.json',
        format: 'json',
      });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/session.json',
        expect.any(String),
        'utf-8'
      );
    });

    it('should return error when session not found', async () => {
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: null }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionExport({ sessionId: 'nonexistent' });

      expect(result.ok).toBe(false);
    });
  });

  describe('sessionDelete', () => {
    it('should delete session successfully', async () => {
      const mockStorage = createMockStorage({
        deleteSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionDelete({ sessionId: 'session-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe('sessionPrune', () => {
    it('should prune old sessions', async () => {
      const mockStorage = createMockStorage({
        prune: vi.fn().mockResolvedValue({ ok: true, value: 5 }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionPrune({ days: 30 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(5);
      }
    });

    it('should do dry run', async () => {
      const mockStorage = createMockStorage({
        listSessions: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: 'old-1', updatedAt: '2025-01-01' },
            { id: 'old-2', updatedAt: '2025-01-01' },
          ],
        }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      const result = await sessionPrune({ days: 30, dryRun: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });
  });

  describe('sessionCommand', () => {
    it('should handle list subcommand', async () => {
      const mockStorage = createMockStorage({
        listSessions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('list', []);

      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should handle show subcommand without session ID', async () => {
      await sessionCommand('show', []);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Session ID required'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle export subcommand', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'completed',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        metadata: {},
        tasks: [],
      };
      const mockStorage = createMockStorage({
        getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: mockSession }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('export', ['session-1']);

      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should handle delete subcommand', async () => {
      const mockStorage = createMockStorage({
        deleteSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('delete', ['session-1']);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('deleted');
    });

    it('should handle prune subcommand', async () => {
      const mockStorage = createMockStorage({
        prune: vi.fn().mockResolvedValue({ ok: true, value: 3 }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('prune', ['30']);

      const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
      expect(output).toContain('3');
    });

    it('should handle prune without days argument', async () => {
      await sessionCommand('prune', []);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Days argument required')
      );
    });

    it('should handle JSON format flag', async () => {
      const mockStorage = createMockStorage({
        listSessions: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            {
              id: 'session-1',
              status: 'completed',
              taskCount: 1,
              totalDurationMs: 1000,
              totalTokens: 100,
              totalCostUsd: 0.01,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        }),
      });
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('list', ['--json']);

      const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
      expect((): unknown => JSON.parse(output)).not.toThrow();
    });

    it('should handle limit flag', async () => {
      const mockStorage = createMockStorage();
      mockCreateSessionStorage.mockReturnValue(mockStorage as never);

      await sessionCommand('list', ['--limit', '5']);

      expect(mockStorage.listSessions).toHaveBeenCalledWith(5);
    });
  });
});
