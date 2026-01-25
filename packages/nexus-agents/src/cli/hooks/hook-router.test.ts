/**
 * Tests for hook-router
 *
 * Tests stdin reading, JSON parsing, Zod validation, and handler routing.
 *
 * @module cli/hooks/hook-router.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import {
  parseHookInput,
  routeHook,
  processHook,
  parseHookArgs,
  type HookHandlers,
} from './hook-router.js';
import type {
  PreToolUseInput,
  PostToolUseInput,
  SessionStartInput,
  SessionEndInput,
  StopInput,
} from './hook-types.js';
import { exitSuccess } from './hook-output.js';

describe('hook-router', () => {
  describe('parseHookInput', () => {
    const validBase = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user/project',
      permission_mode: 'default',
    };

    it('should parse valid SessionStart input', () => {
      const input = JSON.stringify({
        ...validBase,
        hook_event_name: 'SessionStart',
        source: 'startup',
      });

      const result = parseHookInput(input);

      expect('exitCode' in result).toBe(false);
      if (!('exitCode' in result)) {
        expect(result.hook_event_name).toBe('SessionStart');
        expect((result as SessionStartInput).source).toBe('startup');
      }
    });

    it('should parse valid PreToolUse input', () => {
      const input = JSON.stringify({
        ...validBase,
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
        tool_use_id: 'tool_123',
      });

      const result = parseHookInput(input);

      expect('exitCode' in result).toBe(false);
      if (!('exitCode' in result)) {
        expect(result.hook_event_name).toBe('PreToolUse');
        expect((result as PreToolUseInput).tool_name).toBe('Bash');
      }
    });

    it('should parse valid PostToolUse input', () => {
      const input = JSON.stringify({
        ...validBase,
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/file.txt' },
        tool_response: { content: 'file contents' },
        tool_use_id: 'tool_456',
      });

      const result = parseHookInput(input);

      expect('exitCode' in result).toBe(false);
      if (!('exitCode' in result)) {
        expect(result.hook_event_name).toBe('PostToolUse');
        expect((result as PostToolUseInput).tool_response).toEqual({ content: 'file contents' });
      }
    });

    it('should parse valid SessionEnd input', () => {
      const input = JSON.stringify({
        ...validBase,
        hook_event_name: 'SessionEnd',
        reason: 'logout',
      });

      const result = parseHookInput(input);

      expect('exitCode' in result).toBe(false);
      if (!('exitCode' in result)) {
        expect(result.hook_event_name).toBe('SessionEnd');
        expect((result as SessionEndInput).reason).toBe('logout');
      }
    });

    it('should parse valid Stop input', () => {
      const input = JSON.stringify({
        ...validBase,
        hook_event_name: 'Stop',
        stop_hook_active: false,
      });

      const result = parseHookInput(input);

      expect('exitCode' in result).toBe(false);
      if (!('exitCode' in result)) {
        expect(result.hook_event_name).toBe('Stop');
        expect((result as StopInput).stop_hook_active).toBe(false);
      }
    });

    it('should return error for empty input', () => {
      const result = parseHookInput('');

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('No input received');
      }
    });

    it('should return error for whitespace-only input', () => {
      const result = parseHookInput('   \n\t  ');

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('No input received');
      }
    });

    it('should return error for invalid JSON', () => {
      const result = parseHookInput('{ invalid json }');

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Invalid JSON input');
      }
    });

    it('should return error for missing required fields', () => {
      const result = parseHookInput(JSON.stringify({ hook_event_name: 'SessionStart' }));

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Invalid hook input');
      }
    });

    it('should return error for invalid hook_event_name', () => {
      const result = parseHookInput(
        JSON.stringify({
          ...validBase,
          hook_event_name: 'InvalidEvent',
        })
      );

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Invalid hook input');
      }
    });

    it('should return error for invalid permission_mode', () => {
      const result = parseHookInput(
        JSON.stringify({
          ...validBase,
          permission_mode: 'invalid_mode',
          hook_event_name: 'SessionStart',
          source: 'startup',
        })
      );

      expect('exitCode' in result).toBe(true);
      if ('exitCode' in result) {
        expect(result.exitCode).toBe(1);
      }
    });
  });

  describe('routeHook', () => {
    const createMockInput = (eventName: string, extra: Record<string, unknown> = {}): unknown => ({
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user/project',
      permission_mode: 'default',
      hook_event_name: eventName,
      ...extra,
    });

    it('should route SessionStart to sessionStart handler', async () => {
      const handler = vi.fn().mockResolvedValue(exitSuccess('handled'));
      const handlers: HookHandlers = { sessionStart: handler };
      const input = createMockInput('SessionStart', { source: 'startup' });

      const result = await routeHook(input as SessionStartInput, handlers);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('handled');
    });

    it('should route SessionEnd to sessionEnd handler', async () => {
      const handler = vi.fn().mockResolvedValue(exitSuccess('ended'));
      const handlers: HookHandlers = { sessionEnd: handler };
      const input = createMockInput('SessionEnd', { reason: 'logout' });

      const result = await routeHook(input as SessionEndInput, handlers);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result.exitCode).toBe(0);
    });

    it('should route PreToolUse to preTool handler', async () => {
      const handler = vi.fn().mockResolvedValue(exitSuccess('pre-tool handled'));
      const handlers: HookHandlers = { preTool: handler };
      const input = createMockInput('PreToolUse', {
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool_1',
      });

      const result = await routeHook(input as PreToolUseInput, handlers);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result.exitCode).toBe(0);
    });

    it('should route PostToolUse to postTool handler', async () => {
      const handler = vi.fn().mockResolvedValue(exitSuccess('post-tool handled'));
      const handlers: HookHandlers = { postTool: handler };
      const input = createMockInput('PostToolUse', {
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/f.txt' },
        tool_response: { content: 'data' },
        tool_use_id: 'tool_2',
      });

      const result = await routeHook(input as PostToolUseInput, handlers);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result.exitCode).toBe(0);
    });

    it('should route Stop to stop handler', async () => {
      const handler = vi.fn().mockResolvedValue(exitSuccess('stopped'));
      const handlers: HookHandlers = { stop: handler };
      const input = createMockInput('Stop', { stop_hook_active: false });

      const result = await routeHook(input as StopInput, handlers);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result.exitCode).toBe(0);
    });

    it('should return exitSuccess for unmapped events', async () => {
      const handlers: HookHandlers = {};
      const input = createMockInput('Notification', {
        message: 'test',
        notification_type: 'idle_prompt',
      });

      const result = await routeHook(input as SessionStartInput, handlers);

      expect(result.exitCode).toBe(0);
    });

    it('should return exitSuccess when no handler registered', async () => {
      const handlers: HookHandlers = {};
      const input = createMockInput('SessionStart', { source: 'startup' }) as SessionStartInput;

      const result = await routeHook(input, handlers);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('parseHookArgs', () => {
    it('should parse command as first argument', () => {
      const result = parseHookArgs(['pre-tool']);

      expect(result.command).toBe('pre-tool');
    });

    it('should default command to empty string', () => {
      const result = parseHookArgs([]);

      expect(result.command).toBe('');
    });

    it('should parse --tool flag with value', () => {
      const result = parseHookArgs(['pre-tool', '--tool', 'Bash']);

      expect(result.command).toBe('pre-tool');
      expect(result.tool).toBe('Bash');
    });

    it('should parse --validate boolean flag', () => {
      const result = parseHookArgs(['pre-tool', '--validate']);

      expect(result.validate).toBe(true);
    });

    it('should parse --load-context boolean flag', () => {
      const result = parseHookArgs(['session-start', '--load-context']);

      expect(result.loadContext).toBe(true);
    });

    it('should parse --track-metrics boolean flag', () => {
      const result = parseHookArgs(['post-tool', '--track-metrics']);

      expect(result.trackMetrics).toBe(true);
    });

    it('should parse --format boolean flag', () => {
      const result = parseHookArgs(['post-tool', '--format']);

      expect(result.format).toBe(true);
    });

    it('should parse --check-tasks boolean flag', () => {
      const result = parseHookArgs(['stop', '--check-tasks']);

      expect(result.checkTasks).toBe(true);
    });

    it('should parse --generate-summary boolean flag', () => {
      const result = parseHookArgs(['stop', '--generate-summary']);

      expect(result.generateSummary).toBe(true);
    });

    it('should parse --export-metrics boolean flag', () => {
      const result = parseHookArgs(['session-end', '--export-metrics']);

      expect(result.exportMetrics).toBe(true);
    });

    it('should parse --source flag with value', () => {
      const result = parseHookArgs(['session-start', '--source', 'resume']);

      expect(result.source).toBe('resume');
    });

    it('should parse --reason flag with value', () => {
      const result = parseHookArgs(['session-end', '--reason', 'logout']);

      expect(result.reason).toBe('logout');
    });

    it('should parse multiple flags together', () => {
      const result = parseHookArgs(['pre-tool', '--tool', 'Bash', '--validate', '--load-context']);

      expect(result.command).toBe('pre-tool');
      expect(result.tool).toBe('Bash');
      expect(result.validate).toBe(true);
      expect(result.loadContext).toBe(true);
    });

    it('should ignore unknown flags', () => {
      const result = parseHookArgs(['pre-tool', '--unknown', '--validate']);

      expect(result.command).toBe('pre-tool');
      expect(result.validate).toBe(true);
      expect((result as unknown as Record<string, unknown>)['unknown']).toBeUndefined();
    });

    it('should ignore value flags without following value', () => {
      const result = parseHookArgs(['pre-tool', '--tool']);

      expect(result.tool).toBeUndefined();
    });

    it('should ignore value flags with empty following value', () => {
      const result = parseHookArgs(['pre-tool', '--tool', '']);

      expect(result.tool).toBeUndefined();
    });
  });

  describe('processHook', () => {
    let originalStdin: typeof process.stdin;

    beforeEach(() => {
      originalStdin = process.stdin;
    });

    afterEach(() => {
      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
    });

    it('should process valid hook input and route to handler', async () => {
      const mockStdin = new Readable({
        read() {
          this.push(
            JSON.stringify({
              session_id: 'ses_123',
              transcript_path: '/tmp/transcript.json',
              cwd: '/home/user',
              permission_mode: 'default',
              hook_event_name: 'SessionStart',
              source: 'startup',
            })
          );
          this.push(null);
        },
      });
      Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

      const handler = vi.fn().mockResolvedValue(exitSuccess('ok'));
      const handlers: HookHandlers = { sessionStart: handler };

      const result = await processHook(handlers);

      expect(handler).toHaveBeenCalled();
      expect(result.exitCode).toBe(0);
    });

    it('should return error for invalid JSON input', async () => {
      const mockStdin = new Readable({
        read() {
          this.push('{ invalid json }');
          this.push(null);
        },
      });
      Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

      const result = await processHook({});

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid JSON');
    });

    it('should return error for empty stdin', async () => {
      const mockStdin = new Readable({
        read() {
          this.push(null);
        },
      });
      Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

      const result = await processHook({});

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No input received');
    });
  });
});
