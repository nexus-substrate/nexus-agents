/**
 * Tests for hook-types
 *
 * Tests Zod schemas for hook input/output validation.
 *
 * @module cli/hooks/hook-types.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect } from 'vitest';
import {
  HookEventName,
  PermissionMode,
  HookInputBaseSchema,
  SessionStartInputSchema,
  SessionEndInputSchema,
  PreToolUseInputSchema,
  PostToolUseInputSchema,
  StopInputSchema,
  HookInputSchema,
  PermissionDecision,
  HookDecision,
  SessionStartSource,
  SessionEndReason,
  EXIT_SUCCESS,
  EXIT_BLOCK,
  EXIT_ERROR,
} from './hook-types.js';

describe('hook-types', () => {
  describe('HookEventName enum', () => {
    it('should validate valid event names', () => {
      const validNames = [
        'SessionStart',
        'SessionEnd',
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'UserPromptSubmit',
        'Notification',
        'PreCompact',
        'Setup',
        'PermissionRequest',
      ];

      for (const name of validNames) {
        expect(HookEventName.safeParse(name).success).toBe(true);
      }
    });

    it('should reject invalid event names', () => {
      expect(HookEventName.safeParse('InvalidEvent').success).toBe(false);
      expect(HookEventName.safeParse('').success).toBe(false);
      expect(HookEventName.safeParse(123).success).toBe(false);
    });
  });

  describe('PermissionMode enum', () => {
    it('should validate valid permission modes', () => {
      const validModes = ['default', 'plan', 'acceptEdits', 'dontAsk', 'bypassPermissions'];

      for (const mode of validModes) {
        expect(PermissionMode.safeParse(mode).success).toBe(true);
      }
    });

    it('should reject invalid permission modes', () => {
      expect(PermissionMode.safeParse('invalid').success).toBe(false);
      expect(PermissionMode.safeParse('').success).toBe(false);
    });
  });

  describe('SessionStartSource enum', () => {
    it('should validate valid sources', () => {
      expect(SessionStartSource.safeParse('startup').success).toBe(true);
      expect(SessionStartSource.safeParse('resume').success).toBe(true);
      expect(SessionStartSource.safeParse('clear').success).toBe(true);
      expect(SessionStartSource.safeParse('compact').success).toBe(true);
    });

    it('should reject invalid sources', () => {
      expect(SessionStartSource.safeParse('invalid').success).toBe(false);
    });
  });

  describe('SessionEndReason enum', () => {
    it('should validate valid reasons', () => {
      expect(SessionEndReason.safeParse('clear').success).toBe(true);
      expect(SessionEndReason.safeParse('logout').success).toBe(true);
      expect(SessionEndReason.safeParse('prompt_input_exit').success).toBe(true);
      expect(SessionEndReason.safeParse('other').success).toBe(true);
    });

    it('should reject invalid reasons', () => {
      expect(SessionEndReason.safeParse('invalid').success).toBe(false);
    });
  });

  describe('HookInputBaseSchema', () => {
    const validBase = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user/project',
      permission_mode: 'default',
      hook_event_name: 'SessionStart',
    };

    it('should validate complete base input', () => {
      const result = HookInputBaseSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('should reject missing session_id', () => {
      const invalid = { ...validBase };
      delete (invalid as Record<string, unknown>)['session_id'];
      const result = HookInputBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing transcript_path', () => {
      const invalid = { ...validBase };
      delete (invalid as Record<string, unknown>)['transcript_path'];
      const result = HookInputBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing cwd', () => {
      const invalid = { ...validBase };
      delete (invalid as Record<string, unknown>)['cwd'];
      const result = HookInputBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing permission_mode', () => {
      const invalid = { ...validBase };
      delete (invalid as Record<string, unknown>)['permission_mode'];
      const result = HookInputBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SessionStartInputSchema', () => {
    const validInput = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user',
      permission_mode: 'default',
      hook_event_name: 'SessionStart',
      source: 'startup',
    };

    it('should validate complete session start input', () => {
      const result = SessionStartInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate with optional model', () => {
      const result = SessionStartInputSchema.safeParse({
        ...validInput,
        model: 'claude-sonnet-4-20250514',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBe('claude-sonnet-4-20250514');
      }
    });

    it('should validate with optional agent_type', () => {
      const result = SessionStartInputSchema.safeParse({
        ...validInput,
        agent_type: 'orchestrator',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid source', () => {
      const result = SessionStartInputSchema.safeParse({
        ...validInput,
        source: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject wrong hook_event_name', () => {
      const result = SessionStartInputSchema.safeParse({
        ...validInput,
        hook_event_name: 'SessionEnd',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SessionEndInputSchema', () => {
    const validInput = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user',
      permission_mode: 'default',
      hook_event_name: 'SessionEnd',
      reason: 'logout',
    };

    it('should validate complete session end input', () => {
      const result = SessionEndInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid reason', () => {
      const result = SessionEndInputSchema.safeParse({
        ...validInput,
        reason: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PreToolUseInputSchema', () => {
    const validInput = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_use_id: 'tool_123',
    };

    it('should validate complete pre-tool input', () => {
      const result = PreToolUseInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing tool_name', () => {
      const invalid = { ...validInput };
      delete (invalid as Record<string, unknown>)['tool_name'];
      const result = PreToolUseInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing tool_input', () => {
      const invalid = { ...validInput };
      delete (invalid as Record<string, unknown>)['tool_input'];
      const result = PreToolUseInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing tool_use_id', () => {
      const invalid = { ...validInput };
      delete (invalid as Record<string, unknown>)['tool_use_id'];
      const result = PreToolUseInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept any object as tool_input', () => {
      const result = PreToolUseInputSchema.safeParse({
        ...validInput,
        tool_input: { nested: { deep: { value: 123 } } },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PostToolUseInputSchema', () => {
    const validInput = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user',
      permission_mode: 'default',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/file.txt' },
      tool_response: { content: 'file contents' },
      tool_use_id: 'tool_456',
    };

    it('should validate complete post-tool input', () => {
      const result = PostToolUseInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing tool_response', () => {
      const invalid = { ...validInput };
      delete (invalid as Record<string, unknown>)['tool_response'];
      const result = PostToolUseInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('StopInputSchema', () => {
    const validInput = {
      session_id: 'ses_123',
      transcript_path: '/tmp/transcript.json',
      cwd: '/home/user',
      permission_mode: 'default',
      hook_event_name: 'Stop',
      stop_hook_active: false,
    };

    it('should validate complete stop input', () => {
      const result = StopInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate with stop_hook_active true', () => {
      const result = StopInputSchema.safeParse({
        ...validInput,
        stop_hook_active: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing stop_hook_active', () => {
      const invalid = { ...validInput };
      delete (invalid as Record<string, unknown>)['stop_hook_active'];
      const result = StopInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('HookInputSchema discriminated union', () => {
    it('should discriminate SessionStart', () => {
      const input = {
        session_id: 'ses_123',
        transcript_path: '/tmp/t.json',
        cwd: '/home',
        permission_mode: 'default',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };
      const result = HookInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should discriminate PreToolUse', () => {
      const input = {
        session_id: 'ses_123',
        transcript_path: '/tmp/t.json',
        cwd: '/home',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
        tool_use_id: 'tool_1',
      };
      const result = HookInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid discriminator', () => {
      const input = {
        session_id: 'ses_123',
        transcript_path: '/tmp/t.json',
        cwd: '/home',
        permission_mode: 'default',
        hook_event_name: 'InvalidEvent',
      };
      const result = HookInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('PermissionDecision enum', () => {
    it('should validate all decisions', () => {
      expect(PermissionDecision.safeParse('allow').success).toBe(true);
      expect(PermissionDecision.safeParse('deny').success).toBe(true);
      expect(PermissionDecision.safeParse('ask').success).toBe(true);
    });

    it('should reject invalid decision', () => {
      expect(PermissionDecision.safeParse('invalid').success).toBe(false);
    });
  });

  describe('HookDecision enum', () => {
    it('should validate block decision', () => {
      expect(HookDecision.safeParse('block').success).toBe(true);
    });

    it('should reject invalid decision', () => {
      expect(HookDecision.safeParse('allow').success).toBe(false);
    });
  });

  describe('Exit code constants', () => {
    it('should have correct values', () => {
      expect(EXIT_SUCCESS).toBe(0);
      expect(EXIT_BLOCK).toBe(2);
      expect(EXIT_ERROR).toBe(1);
    });
  });
});
