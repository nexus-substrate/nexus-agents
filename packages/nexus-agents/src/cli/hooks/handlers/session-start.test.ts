/**
 * Tests for session-start handler
 *
 * Tests session initialization and context provision.
 *
 * @module cli/hooks/handlers/session-start.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSessionStart, type SessionStartHandlerConfig } from './session-start.js';
import type { SessionStartInput } from '../hook-types.js';

// Mock the logger
vi.mock('../../../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock session storage
const mockStorage = {
  initialize: vi.fn(),
  createSession: vi.fn(),
  close: vi.fn(),
};

vi.mock('../../session-storage.js', () => ({
  SQLiteSessionStorage: vi.fn().mockImplementation(() => mockStorage),
}));

describe('session-start handler', () => {
  const createInput = (overrides: Partial<SessionStartInput> = {}): SessionStartInput => ({
    session_id: 'ses_123',
    transcript_path: '/tmp/transcript.json',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'SessionStart',
    source: 'startup',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.initialize.mockResolvedValue({ ok: true });
    mockStorage.createSession.mockResolvedValue({
      ok: true,
      value: {
        id: 'stored_ses_456',
        createdAt: '2026-01-25T10:00:00Z',
        updatedAt: '2026-01-25T10:00:00Z',
        status: 'active',
        metadata: {},
      },
    });
  });

  describe('handleSessionStart', () => {
    it('should acknowledge session start', async () => {
      const input = createInput();

      const result = await handleSessionStart(input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Session ses_123');
    });

    it('should include storage ID in success message', async () => {
      const input = createInput();

      const result = await handleSessionStart(input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('stored_ses_456');
    });

    it('should handle different source values', async () => {
      const sources: Array<SessionStartInput['source']> = ['startup', 'resume', 'clear', 'compact'];

      for (const source of sources) {
        const input = createInput({ source });
        const result = await handleSessionStart(input);
        expect(result.exitCode).toBe(0);
      }
    });

    it('should handle optional model', async () => {
      const input = createInput({ model: 'claude-sonnet-4-20250514' });

      const result = await handleSessionStart(input);

      expect(result.exitCode).toBe(0);
      expect(mockStorage.createSession).toHaveBeenCalled();
    });

    it('should handle optional agent_type', async () => {
      const input = createInput({ agent_type: 'orchestrator' });

      const result = await handleSessionStart(input);

      expect(result.exitCode).toBe(0);
      expect(mockStorage.createSession).toHaveBeenCalled();
    });

    describe('context provision', () => {
      it('should provide context when configured', async () => {
        const input = createInput({ model: 'claude-sonnet-4', agent_type: 'coder' });
        const config: SessionStartHandlerConfig = { provideContext: true };

        const result = await handleSessionStart(input, config);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
        expect(output.hookSpecificOutput.additionalContext).toContain('Session initialized');
        expect(output.hookSpecificOutput.additionalContext).toContain('Storage ID');
      });

      it('should include model in context when provided', async () => {
        const input = createInput({ model: 'claude-opus-4-20250514' });
        const config: SessionStartHandlerConfig = { provideContext: true };

        const result = await handleSessionStart(input, config);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('claude-opus-4');
      });

      it('should include agent_type in context when provided', async () => {
        const input = createInput({ agent_type: 'reviewer' });
        const config: SessionStartHandlerConfig = { provideContext: true };

        const result = await handleSessionStart(input, config);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('reviewer');
      });

      it('should not provide context by default', async () => {
        const input = createInput();

        const result = await handleSessionStart(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain('hookSpecificOutput');
      });
    });

    describe('custom metadata', () => {
      it('should pass custom metadata to session creation', async () => {
        const input = createInput();
        const config: SessionStartHandlerConfig = {
          customMetadata: { projectId: 'proj_123', environment: 'development' },
        };

        await handleSessionStart(input, config);

        expect(mockStorage.createSession).toHaveBeenCalledWith(
          expect.objectContaining({
            custom: expect.objectContaining({
              projectId: 'proj_123',
              environment: 'development',
            }),
          })
        );
      });
    });

    describe('storage initialization failure', () => {
      it('should acknowledge session when storage init fails', async () => {
        mockStorage.initialize.mockResolvedValue({
          ok: false,
          error: new Error('Database locked'),
        });
        const input = createInput();

        const result = await handleSessionStart(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 acknowledged');
        expect(result.stdout).toContain('storage unavailable');
      });
    });

    describe('session creation failure', () => {
      it('should acknowledge session when creation fails', async () => {
        mockStorage.createSession.mockResolvedValue({
          ok: false,
          error: new Error('Failed to insert'),
        });
        const input = createInput();

        const result = await handleSessionStart(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 acknowledged');
        expect(result.stdout).toContain('creation failed');
      });
    });

    describe('exception handling', () => {
      it('should handle unexpected errors gracefully', async () => {
        mockStorage.initialize.mockRejectedValue(new Error('Unexpected error'));
        const input = createInput();

        const result = await handleSessionStart(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 acknowledged');
        expect(result.stdout).toContain('error');
      });

      it('should handle non-Error throws', async () => {
        mockStorage.initialize.mockRejectedValue('String error');
        const input = createInput();

        const result = await handleSessionStart(input);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Session ses_123 acknowledged');
      });
    });

    describe('database path configuration', () => {
      it('should use custom database path when provided', async () => {
        const input = createInput();
        const config: SessionStartHandlerConfig = { dbPath: '/custom/path/sessions.db' };

        await handleSessionStart(input, config);

        expect(mockStorage.initialize).toHaveBeenCalled();
      });

      it('should use default database path when not configured', async () => {
        const input = createInput();

        await handleSessionStart(input);

        expect(mockStorage.initialize).toHaveBeenCalled();
      });
    });

    describe('storage cleanup', () => {
      it('should close storage after successful creation', async () => {
        const input = createInput();

        await handleSessionStart(input);

        expect(mockStorage.close).toHaveBeenCalled();
      });

      it('should close storage after failed creation', async () => {
        mockStorage.createSession.mockResolvedValue({
          ok: false,
          error: new Error('Failed'),
        });
        const input = createInput();

        await handleSessionStart(input);

        expect(mockStorage.close).toHaveBeenCalled();
      });
    });
  });
});
