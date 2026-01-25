/**
 * Tests for hook-output
 *
 * Tests exit code helpers and JSON output formatters.
 *
 * @module cli/hooks/hook-output.test
 * (Source: Issue #417 - CLI hooks test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exitSuccess,
  exitBlock,
  exitError,
  jsonOutput,
  allowTool,
  denyTool,
  askPermission,
  modifyToolInput,
  blockPostTool,
  postToolContext,
  blockStop,
  sessionStartContext,
  stopProcessing,
  writeResult,
  writeResultAndExit,
} from './hook-output.js';
import { EXIT_SUCCESS, EXIT_BLOCK, EXIT_ERROR } from './hook-types.js';

describe('hook-output', () => {
  describe('exitSuccess', () => {
    it('should return exit code 0', () => {
      const result = exitSuccess();

      expect(result.exitCode).toBe(EXIT_SUCCESS);
      expect(result.exitCode).toBe(0);
    });

    it('should include stdout when provided', () => {
      const result = exitSuccess('Operation completed');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Operation completed');
    });

    it('should not include stdout when undefined', () => {
      const result = exitSuccess();

      expect(result.stdout).toBeUndefined();
    });
  });

  describe('exitBlock', () => {
    it('should return exit code 2 with stderr', () => {
      const result = exitBlock('Operation blocked');

      expect(result.exitCode).toBe(EXIT_BLOCK);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe('Operation blocked');
    });
  });

  describe('exitError', () => {
    it('should return exit code 1 with stderr', () => {
      const result = exitError('An error occurred');

      expect(result.exitCode).toBe(EXIT_ERROR);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('An error occurred');
    });
  });

  describe('jsonOutput', () => {
    it('should return exit code 0 with JSON stdout', () => {
      const result = jsonOutput({ continue: true });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('{"continue":true}');
    });

    it('should stringify complex objects', () => {
      const result = jsonOutput({
        continue: false,
        stopReason: 'Task cancelled',
        suppressOutput: true,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout ?? '{}');
      expect(parsed.continue).toBe(false);
      expect(parsed.stopReason).toBe('Task cancelled');
      expect(parsed.suppressOutput).toBe(true);
    });
  });

  describe('allowTool', () => {
    it('should create allow decision without reason', () => {
      const result = allowTool();

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
      expect(output.hookSpecificOutput.permissionDecisionReason).toBeUndefined();
    });

    it('should create allow decision with reason', () => {
      const result = allowTool('Tool is safe');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
      expect(output.hookSpecificOutput.permissionDecisionReason).toBe('Tool is safe');
    });
  });

  describe('denyTool', () => {
    it('should create deny decision with reason', () => {
      const result = denyTool('Dangerous operation detected');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toBe(
        'Dangerous operation detected'
      );
    });
  });

  describe('askPermission', () => {
    it('should create ask decision without reason', () => {
      const result = askPermission();

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('ask');
    });

    it('should create ask decision with reason', () => {
      const result = askPermission('Please confirm this action');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(output.hookSpecificOutput.permissionDecisionReason).toBe('Please confirm this action');
    });
  });

  describe('modifyToolInput', () => {
    it('should create modified input with default allow decision', () => {
      const result = modifyToolInput({ command: 'ls -la' });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
      expect(output.hookSpecificOutput.updatedInput).toEqual({ command: 'ls -la' });
    });

    it('should create modified input with ask decision', () => {
      const result = modifyToolInput({ file_path: '/etc/config' }, 'ask');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(output.hookSpecificOutput.updatedInput).toEqual({ file_path: '/etc/config' });
    });
  });

  describe('blockPostTool', () => {
    it('should create block decision for post-tool', () => {
      const result = blockPostTool('Output contains sensitive data');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.decision).toBe('block');
      expect(output.reason).toBe('Output contains sensitive data');
    });
  });

  describe('postToolContext', () => {
    it('should create post-tool context response', () => {
      const result = postToolContext('File was formatted');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('PostToolUse');
      expect(output.hookSpecificOutput.additionalContext).toBe('File was formatted');
    });
  });

  describe('blockStop', () => {
    it('should create block stop decision', () => {
      const result = blockStop('There are pending tasks');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.decision).toBe('block');
      expect(output.reason).toBe('There are pending tasks');
    });
  });

  describe('sessionStartContext', () => {
    it('should create session start context response', () => {
      const result = sessionStartContext('Session initialized with 5 tasks');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
      expect(output.hookSpecificOutput.additionalContext).toBe('Session initialized with 5 tasks');
    });
  });

  describe('stopProcessing', () => {
    it('should create stop processing response', () => {
      const result = stopProcessing('User requested stop');

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout ?? '{}');
      expect(output.continue).toBe(false);
      expect(output.stopReason).toBe('User requested stop');
    });
  });

  describe('writeResult', () => {
    beforeEach(() => {
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should write stdout when present', () => {
      writeResult({ exitCode: 0, stdout: 'Hello' });

      expect(process.stdout.write).toHaveBeenCalledWith('Hello');
      expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it('should write stderr when present', () => {
      writeResult({ exitCode: 1, stderr: 'Error!' });

      expect(process.stderr.write).toHaveBeenCalledWith('Error!');
      expect(process.stdout.write).not.toHaveBeenCalled();
    });

    it('should write both stdout and stderr when present', () => {
      writeResult({ exitCode: 0, stdout: 'Output', stderr: 'Warning' });

      expect(process.stdout.write).toHaveBeenCalledWith('Output');
      expect(process.stderr.write).toHaveBeenCalledWith('Warning');
    });

    it('should not write when neither stdout nor stderr present', () => {
      writeResult({ exitCode: 0 });

      expect(process.stdout.write).not.toHaveBeenCalled();
      expect(process.stderr.write).not.toHaveBeenCalled();
    });
  });

  describe('writeResultAndExit', () => {
    beforeEach(() => {
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      vi.spyOn(process, 'exit').mockImplementation((): never => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should write and exit with code 0', () => {
      expect(() => writeResultAndExit({ exitCode: 0, stdout: 'Success' })).toThrow(
        'process.exit called'
      );

      expect(process.stdout.write).toHaveBeenCalledWith('Success');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should write and exit with code 2', () => {
      expect(() => writeResultAndExit({ exitCode: 2, stderr: 'Blocked' })).toThrow(
        'process.exit called'
      );

      expect(process.stderr.write).toHaveBeenCalledWith('Blocked');
      expect(process.exit).toHaveBeenCalledWith(2);
    });

    it('should write and exit with code 1', () => {
      expect(() => writeResultAndExit({ exitCode: 1, stderr: 'Error' })).toThrow(
        'process.exit called'
      );

      expect(process.stderr.write).toHaveBeenCalledWith('Error');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
