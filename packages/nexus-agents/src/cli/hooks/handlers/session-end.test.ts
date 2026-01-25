/**
 * Tests for session-end handler
 *
 * Tests session finalization and metrics export.
 *
 * @module cli/hooks/handlers/session-end.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSessionEnd, type SessionEndHandlerConfig } from './session-end.js';
import type { SessionEndInput } from '../hook-types.js';

// Mock the logger
vi.mock('../../../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock fs/promises for metrics export
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock session storage
const mockStorage = {
  initialize: vi.fn(),
  listSessions: vi.fn(),
  updateSessionStatus: vi.fn(),
  getSessionWithTasks: vi.fn(),
  close: vi.fn(),
};

vi.mock('../../session-storage.js', () => ({
  SQLiteSessionStorage: vi.fn().mockImplementation(() => mockStorage),
}));

describe('session-end handler', () => {
  const createInput = (overrides: Partial<SessionEndInput> = {}): SessionEndInput => ({
    session_id: 'ses_123',
    transcript_path: '/tmp/transcript.json',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'SessionEnd',
    reason: 'logout',
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
    mockStorage.updateSessionStatus.mockResolvedValue({ ok: true });
    mockStorage.getSessionWithTasks.mockResolvedValue({
      ok: true,
      value: {
        id: 'stored_ses_456',
        createdAt: '2026-01-25T10:00:00Z',
        updatedAt: '2026-01-25T11:00:00Z',
        status: 'completed',
        metadata: {},
        tasks: [],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handleSessionEnd', () => {
    it('should acknowledge session end', async () => {
      const input = createInput();

      const result = await handleSessionEnd(input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Session ses_123 ended');
      expect(result.stdout).toContain('reason: logout');
    });

    it('should handle different reason values', async () => {
      const reasons: Array<SessionEndInput['reason']> = [
        'clear',
        'logout',
        'prompt_input_exit',
        'other',
      ];

      for (const reason of reasons) {
        vi.clearAllMocks();
        mockStorage.initialize.mockResolvedValue({ ok: true });
        mockStorage.listSessions.mockResolvedValue({
          ok: true,
          value: [{ id: 'stored_ses_456', status: 'active' }],
        });
        mockStorage.updateSessionStatus.mockResolvedValue({ ok: true });

        const input = createInput({ reason });
        const result = await handleSessionEnd(input);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`reason: ${reason}`);
      }
    });

    describe('session tracking disabled', () => {
      it('should return early when NEXUS_DISABLE_SESSIONS is set', async () => {
        process.env['NEXUS_DISABLE_SESSIONS'] = '1';
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('tracking disabled');
        expect(mockStorage.initialize).not.toHaveBeenCalled();
      });

      it('should return early when NEXUS_DISABLE_SESSIONS is true', async () => {
        process.env['NEXUS_DISABLE_SESSIONS'] = 'true';
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('tracking disabled');
      });
    });

    describe('storage initialization failure', () => {
      it('should acknowledge session when storage init fails', async () => {
        mockStorage.initialize.mockResolvedValue({
          ok: false,
          error: new Error('Database locked'),
        });
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 ended');
        expect(result.stdout).toContain('storage unavailable');
      });
    });

    describe('session update', () => {
      it('should update session status to completed', async () => {
        const input = createInput();

        await handleSessionEnd(input);

        expect(mockStorage.updateSessionStatus).toHaveBeenCalledWith('stored_ses_456', 'completed');
      });

      it('should handle no active sessions', async () => {
        mockStorage.listSessions.mockResolvedValue({ ok: true, value: [] });
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(mockStorage.updateSessionStatus).not.toHaveBeenCalled();
      });

      it('should only update active sessions', async () => {
        mockStorage.listSessions.mockResolvedValue({
          ok: true,
          value: [
            { id: 'ses_1', status: 'completed' },
            { id: 'ses_2', status: 'active' },
          ],
        });
        const input = createInput();

        await handleSessionEnd(input);

        expect(mockStorage.updateSessionStatus).toHaveBeenCalledWith('ses_2', 'completed');
      });

      it('should handle listSessions failure', async () => {
        mockStorage.listSessions.mockResolvedValue({
          ok: false,
          error: new Error('Query failed'),
        });
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 ended');
      });
    });

    describe('metrics export', () => {
      it('should export metrics when enabled', async () => {
        const input = createInput();
        const config: SessionEndHandlerConfig = {
          exportMetrics: true,
          metricsExportPath: '/tmp/metrics.json',
        };

        await handleSessionEnd(input, config);

        const { writeFile } = await import('node:fs/promises');
        expect(writeFile).toHaveBeenCalled();
      });

      it('should not export metrics when disabled', async () => {
        const input = createInput();
        const config: SessionEndHandlerConfig = { exportMetrics: false };

        await handleSessionEnd(input, config);

        const { writeFile } = await import('node:fs/promises');
        expect(writeFile).not.toHaveBeenCalled();
      });

      it('should handle getSessionWithTasks failure', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: false,
          error: new Error('Not found'),
        });
        const input = createInput();
        const config: SessionEndHandlerConfig = {
          exportMetrics: true,
          metricsExportPath: '/tmp/metrics.json',
        };

        const result = await handleSessionEnd(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should handle null session result', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({ ok: true, value: null });
        const input = createInput();
        const config: SessionEndHandlerConfig = {
          exportMetrics: true,
          metricsExportPath: '/tmp/metrics.json',
        };

        const result = await handleSessionEnd(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should include task metrics in export', async () => {
        mockStorage.getSessionWithTasks.mockResolvedValue({
          ok: true,
          value: {
            id: 'stored_ses_456',
            createdAt: '2026-01-25T10:00:00Z',
            updatedAt: '2026-01-25T11:00:00Z',
            status: 'completed',
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
                status: 'completed',
                durationMs: 200,
                tokensUsed: 75,
                costUsd: 0.02,
              },
            ],
          },
        });
        const input = createInput();
        const config: SessionEndHandlerConfig = {
          exportMetrics: true,
          metricsExportPath: '/tmp/metrics.json',
        };

        await handleSessionEnd(input, config);

        const { writeFile } = await import('node:fs/promises');
        expect(writeFile).toHaveBeenCalled();
        const mockFn = writeFile as ReturnType<typeof vi.fn>;
        const writeCall = mockFn.mock.calls[0];
        expect(writeCall).toBeDefined();
        const metricsJson = writeCall?.[1] as string;
        const metrics = JSON.parse(metricsJson) as Record<string, unknown>;
        expect(metrics['taskCount']).toBe(2);
        const totals = metrics['totals'] as Record<string, unknown>;
        expect(totals['durationMs']).toBe(300);
        expect(totals['tokensUsed']).toBe(125);
        expect(totals['costUsd']).toBe(0.03);
      });

      it('should handle write failure gracefully', async () => {
        const { writeFile } = await import('node:fs/promises');
        (writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permission denied'));

        const input = createInput();
        const config: SessionEndHandlerConfig = {
          exportMetrics: true,
          metricsExportPath: '/tmp/metrics.json',
        };

        const result = await handleSessionEnd(input, config);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('exception handling', () => {
      it('should handle unexpected errors gracefully', async () => {
        mockStorage.initialize.mockRejectedValue(new Error('Unexpected error'));
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 ended');
        expect(result.stdout).toContain('error');
      });

      it('should handle non-Error throws', async () => {
        mockStorage.initialize.mockRejectedValue('String error');
        const input = createInput();

        const result = await handleSessionEnd(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 ended');
      });
    });

    describe('database path configuration', () => {
      it('should use custom database path when provided', async () => {
        const input = createInput();
        const config: SessionEndHandlerConfig = { dbPath: '/custom/path/sessions.db' };

        await handleSessionEnd(input, config);

        expect(mockStorage.initialize).toHaveBeenCalled();
      });
    });

    describe('storage cleanup', () => {
      it('should close storage after successful update', async () => {
        const input = createInput();

        await handleSessionEnd(input);

        expect(mockStorage.close).toHaveBeenCalled();
      });
    });
  });
});
