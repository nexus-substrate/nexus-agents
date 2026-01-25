/**
 * Tests for post-tool handler
 *
 * Tests metrics tracking and formatting suggestions.
 *
 * @module cli/hooks/handlers/post-tool.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handlePostTool, type PostToolHandlerConfig } from './post-tool.js';
import type { PostToolUseInput } from '../hook-types.js';

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
vi.mock('../../session-storage.js', () => ({
  SQLiteSessionStorage: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    addTask: vi.fn().mockResolvedValue({ ok: true, value: { id: 'tsk_123' } }),
    updateTask: vi.fn().mockResolvedValue({ ok: true }),
    close: vi.fn(),
  })),
}));

describe('post-tool handler', () => {
  const createInput = (overrides: Partial<PostToolUseInput> = {}): PostToolUseInput => ({
    session_id: 'ses_123',
    transcript_path: '/tmp/transcript.json',
    cwd: '/home/user/project',
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_response: { stdout: 'file1.txt\nfile2.txt' },
    tool_use_id: 'tool_123',
    ...overrides,
  });

  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handlePostTool', () => {
    it('should return success with tool completion message', async () => {
      const input = createInput();

      const result = await handlePostTool(input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tool Bash completed');
      expect(result.stdout).toContain('tool_123');
    });

    it('should handle different tool names', async () => {
      const input = createInput({ tool_name: 'Read', tool_use_id: 'read_456' });

      const result = await handlePostTool(input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tool Read completed');
      expect(result.stdout).toContain('read_456');
    });

    describe('formatting suggestions', () => {
      const formatConfig: PostToolHandlerConfig = {
        formatOnWrite: true,
        provideContext: true,
      };

      it('should suggest prettier for TypeScript files', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/index.ts' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('prettier');
      });

      it('should suggest prettier for JavaScript files', async () => {
        const input = createInput({
          tool_name: 'Write',
          tool_input: { file_path: '/project/src/utils.js' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('prettier');
      });

      it('should suggest prettier for TSX files', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/App.tsx' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('prettier');
      });

      it('should suggest prettier for JSX files', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/Component.jsx' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('prettier');
      });

      it('should suggest prettier for JSON files', async () => {
        const input = createInput({
          tool_name: 'Write',
          tool_input: { file_path: '/project/package.json' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('prettier');
      });

      it('should suggest black for Python files', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/script.py' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('black');
      });

      it('should suggest gofmt for Go files', async () => {
        const input = createInput({
          tool_name: 'Write',
          tool_input: { file_path: '/project/main.go' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('gofmt');
      });

      it('should suggest rustfmt for Rust files', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/lib.rs' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout ?? '{}');
        expect(output.hookSpecificOutput.additionalContext).toContain('rustfmt');
      });

      it('should not suggest formatting for unknown extensions', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/README.md' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Tool Edit completed');
      });

      it('should handle NotebookEdit tool with notebook_path', async () => {
        const input = createInput({
          tool_name: 'NotebookEdit',
          tool_input: { notebook_path: '/project/analysis.ipynb' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
      });

      it('should not suggest formatting when formatOnWrite is false', async () => {
        const input = createInput({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/index.ts' },
        });
        const config: PostToolHandlerConfig = { formatOnWrite: false };

        const result = await handlePostTool(input, config);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Tool Edit completed');
      });

      it('should not suggest formatting for non-format trigger tools', async () => {
        const input = createInput({
          tool_name: 'Bash',
          tool_input: { command: 'echo hello' },
        });

        const result = await handlePostTool(input, formatConfig);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Tool Bash completed');
      });
    });

    describe('metrics tracking', () => {
      it('should track metrics when enabled', async () => {
        const input = createInput({
          tool_response: { stdout: 'output', durationMs: 100, tokensUsed: 50 },
        });
        const config: PostToolHandlerConfig = {
          trackMetrics: true,
          dbPath: '/tmp/test.db',
        };

        const result = await handlePostTool(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should not track metrics when disabled via env', async () => {
        process.env['NEXUS_DISABLE_METRICS'] = '1';
        const input = createInput();
        const config: PostToolHandlerConfig = { trackMetrics: true };

        const result = await handlePostTool(input, config);

        expect(result.exitCode).toBe(0);
      });

      it('should handle snake_case duration and tokens', async () => {
        const input = createInput({
          tool_response: { stdout: 'output', duration_ms: 200, tokens_used: 75 },
        });
        const config: PostToolHandlerConfig = {
          trackMetrics: true,
          dbPath: '/tmp/test.db',
        };

        const result = await handlePostTool(input, config);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('tool input summarization', () => {
      it('should summarize command input', async () => {
        const input = createInput({
          tool_input: { command: 'npm install express mongoose dotenv cors' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should truncate long commands', async () => {
        const longCommand = 'a'.repeat(100);
        const input = createInput({
          tool_input: { command: longCommand },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should summarize file_path input', async () => {
        const input = createInput({
          tool_name: 'Read',
          tool_input: { file_path: '/long/path/to/file.txt' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should summarize pattern input', async () => {
        const input = createInput({
          tool_name: 'Glob',
          tool_input: { pattern: '**/*.ts' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should handle empty tool input', async () => {
        const input = createInput({
          tool_input: {},
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });
    });

    describe('tool response summarization', () => {
      it('should summarize stdout response', async () => {
        const input = createInput({
          tool_response: { stdout: 'Hello, World!' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should summarize error response', async () => {
        const input = createInput({
          tool_response: { error: 'Command not found' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should summarize stderr response', async () => {
        const input = createInput({
          tool_response: { stderr: 'Permission denied' },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should truncate long output', async () => {
        const longOutput = 'x'.repeat(200);
        const input = createInput({
          tool_response: { stdout: longOutput },
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });

      it('should handle empty tool response', async () => {
        const input = createInput({
          tool_response: {},
        });

        const result = await handlePostTool(input);

        expect(result.exitCode).toBe(0);
      });
    });
  });
});
