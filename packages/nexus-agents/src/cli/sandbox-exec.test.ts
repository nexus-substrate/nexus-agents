/**
 * Tests for sandbox-exec utilities
 *
 * Verifies command parsing, policy validation, and sandbox execution.
 * (Source: Issue #295, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateCommandWithPolicy,
  isCommandAllowed,
  safeExecSandboxed,
  execSandboxed,
} from './sandbox-exec.js';
import { DEVELOPMENT_POLICY } from '../security/sandbox/index.js';

// Mock child_process to avoid actual command execution
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

import { execSync } from 'node:child_process';

describe('sandbox-exec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateCommandWithPolicy', () => {
    it('should allow valid git commands with read context', () => {
      const violation = validateCommandWithPolicy('git status', { context: 'read' });
      // git is allowed in readonly policy
      expect(violation).toBeNull();
    });

    it('should allow gh commands with gh context', () => {
      const violation = validateCommandWithPolicy('gh issue list', { context: 'gh' });
      expect(violation).toBeNull();
    });

    it('should allow ls commands with read context', () => {
      const violation = validateCommandWithPolicy('ls -la', { context: 'read' });
      expect(violation).toBeNull();
    });

    it('should allow cat commands with read context', () => {
      const violation = validateCommandWithPolicy('cat README.md', { context: 'read' });
      expect(violation).toBeNull();
    });

    it('should reject commands with shell injection patterns', () => {
      const violation = validateCommandWithPolicy('ls; rm -rf /', { context: 'read' });
      expect(violation).not.toBeNull();
      // The semicolon causes the command to be parsed as 'ls;' which is not allowlisted
      expect(violation?.reason).toBeDefined();
    });

    it('should reject commands with backtick injection', () => {
      const violation = validateCommandWithPolicy('echo `whoami`', { context: 'read' });
      expect(violation).not.toBeNull();
    });

    it('should reject commands with $() injection', () => {
      const violation = validateCommandWithPolicy('echo $(whoami)', { context: 'read' });
      expect(violation).not.toBeNull();
    });

    it('should use readonly policy by default', () => {
      // rm is not in readonly policy
      const violation = validateCommandWithPolicy('rm test.txt');
      expect(violation).not.toBeNull();
    });

    it('should respect custom policy', () => {
      const violation = validateCommandWithPolicy('npm install', { policy: DEVELOPMENT_POLICY });
      expect(violation).toBeNull();
    });

    it('should handle commands with quoted arguments', () => {
      const violation = validateCommandWithPolicy('git commit -m "test message"', {
        context: 'git',
      });
      expect(violation).toBeNull();
    });

    it('should handle commands with single-quoted arguments', () => {
      const violation = validateCommandWithPolicy("git commit -m 'test message'", {
        context: 'git',
      });
      expect(violation).toBeNull();
    });

    it('should handle empty command string', () => {
      const violation = validateCommandWithPolicy('', { context: 'read' });
      // Empty command should fail validation
      expect(violation).not.toBeNull();
    });
  });

  describe('isCommandAllowed', () => {
    it('should return true for allowed commands', () => {
      expect(isCommandAllowed('git status', { context: 'git' })).toBe(true);
    });

    it('should return false for disallowed commands', () => {
      expect(isCommandAllowed('rm -rf /', { context: 'read' })).toBe(false);
    });

    it('should return false for injection attempts', () => {
      expect(isCommandAllowed('ls; whoami', { context: 'read' })).toBe(false);
    });

    it('should use default read context', () => {
      expect(isCommandAllowed('ls')).toBe(true);
      expect(isCommandAllowed('rm test.txt')).toBe(false);
    });
  });

  describe('safeExecSandboxed', () => {
    it('should return null for denied commands', () => {
      const result = safeExecSandboxed('rm -rf /', { context: 'read' });
      expect(result).toBeNull();
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should execute allowed commands', () => {
      vi.mocked(execSync).mockReturnValue('output text');

      const result = safeExecSandboxed('git status', { context: 'git' });

      expect(result).toBe('output text');
      expect(execSync).toHaveBeenCalledWith('git status', expect.any(Object));
    });

    it('should return null on execution error', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = safeExecSandboxed('git status', { context: 'git' });

      expect(result).toBeNull();
    });

    it('should pass cwd option', () => {
      vi.mocked(execSync).mockReturnValue('output');

      safeExecSandboxed('ls', { context: 'read', cwd: '/tmp' });

      expect(execSync).toHaveBeenCalledWith('ls', expect.objectContaining({ cwd: '/tmp' }));
    });

    it('should trim output', () => {
      vi.mocked(execSync).mockReturnValue('  output with whitespace  \n');

      const result = safeExecSandboxed('ls', { context: 'read' });

      expect(result).toBe('output with whitespace');
    });

    it('should handle Buffer output', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('buffer output'));

      const result = safeExecSandboxed('ls', { context: 'read' });

      expect(result).toBe('buffer output');
    });

    it('should pass stdin as the execSync input option (#2863)', () => {
      vi.mocked(execSync).mockReturnValue('commented');

      safeExecSandboxed('gh issue comment 1 --body-file -', {
        context: 'gh',
        stdin: 'multi-line\nbody | with | pipes',
      });

      expect(execSync).toHaveBeenCalledWith(
        'gh issue comment 1 --body-file -',
        expect.objectContaining({ input: 'multi-line\nbody | with | pipes' })
      );
    });

    it('should omit the input option when no stdin is given', () => {
      vi.mocked(execSync).mockReturnValue('ok');

      safeExecSandboxed('git status', { context: 'git' });

      const passedOptions = vi.mocked(execSync).mock.calls[0]?.[1];
      expect(passedOptions).not.toHaveProperty('input');
    });
  });

  // Regression for #2863 (audit #2824 bullet 10): vote-command embedded the
  // markdown comment body in the command string as `--body '<comment>'`. Every
  // vote comment contains a markdown table (`|`) and a `(NN% approval)`
  // parenthetical, so the body token always matched a denied shell pattern and
  // the comment was silently dropped. The fix pipes the body via stdin.
  describe('vote-comment recording (#2863)', () => {
    // A realistic formatVoteComment() body: markdown table + parens.
    const voteBody = [
      '## Consensus Vote Result',
      '| Agent | Decision | Confidence |',
      '| ----- | -------- | ---------- |',
      '| Architect | APPROVE | 90% |',
      '**Summary:** Approve: 4, Reject: 1 (80.0% approval)',
    ].join('\n');

    it('denies the old --body inline form (proves the bug)', () => {
      const violation = validateCommandWithPolicy(`gh issue comment 1 --body '${voteBody}'`, {
        context: 'gh',
      });
      expect(violation).not.toBeNull();
    });

    it('allows the --body-file - stdin form (proves the fix)', () => {
      const violation = validateCommandWithPolicy('gh issue comment 1 --body-file -', {
        context: 'gh',
      });
      expect(violation).toBeNull();
    });
  });

  describe('execSandboxed', () => {
    it('should throw for denied commands', () => {
      expect(() => execSandboxed('rm -rf /', { context: 'read' })).toThrow('Sandbox policy denied');
    });

    it('should return output for allowed commands', () => {
      vi.mocked(execSync).mockReturnValue('output');

      const result = execSandboxed('git status', { context: 'git' });

      expect(result).toBe('output');
    });

    it('should propagate execution errors', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(() => execSandboxed('git status', { context: 'git' })).toThrow('Command failed');
    });
  });

  describe('command parsing edge cases', () => {
    it('should parse commands with multiple spaces', () => {
      const violation = validateCommandWithPolicy('ls   -la    /tmp', { context: 'read' });
      expect(violation).toBeNull();
    });

    it('should parse commands with paths', () => {
      const violation = validateCommandWithPolicy('cat /path/to/file.txt', { context: 'read' });
      expect(violation).toBeNull();
    });

    it('should parse git commands with arguments', () => {
      const violation = validateCommandWithPolicy('git log --oneline -10', { context: 'git' });
      expect(violation).toBeNull();
    });

    it('should parse gh commands with json flag', () => {
      const violation = validateCommandWithPolicy('gh issue list --json number,title', {
        context: 'gh',
      });
      expect(violation).toBeNull();
    });
  });

  describe('context-based policy selection', () => {
    it('should use readonly policy for read context', () => {
      // npm is not in readonly policy
      const violation = validateCommandWithPolicy('npm install', { context: 'read' });
      expect(violation).not.toBeNull();
    });

    it('should use development policy for write context', () => {
      const violation = validateCommandWithPolicy('npm install', { context: 'write' });
      expect(violation).toBeNull();
    });

    it('should use development policy for git context', () => {
      const violation = validateCommandWithPolicy('git push', { context: 'git' });
      expect(violation).toBeNull();
    });

    it('should use development policy for gh context', () => {
      const violation = validateCommandWithPolicy('gh pr create', { context: 'gh' });
      expect(violation).toBeNull();
    });
  });
});
