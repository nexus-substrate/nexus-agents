/**
 * Command Allowlist Tests
 *
 * Tests for command validation and allowlist enforcement.
 * Verifies that dangerous commands are blocked and only allowed commands execute.
 *
 * @module security/sandbox/__tests__/command-allowlist.test
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  validateArgs,
  isCommandInCategory,
  getCommandCategory,
  COMMAND_CATEGORIES,
  ALLOWED_COMMANDS,
  DENIED_COMMANDS,
  DENIED_ARG_PATTERNS,
} from './command-allowlist.js';

describe('Command Allowlist', () => {
  describe('validateCommand', () => {
    describe('allowed commands', () => {
      it('should allow commands from the default allowlist', () => {
        const allowedCmds = ['pnpm', 'npm', 'node', 'git', 'vitest', 'eslint', 'echo'];

        for (const cmd of allowedCmds) {
          const result = validateCommand(cmd, []);
          expect(result).toBeNull();
        }
      });

      it('should allow commands from custom allowlist', () => {
        const customAllowlist = ['mycommand', 'anothercmd'];
        const result = validateCommand('mycommand', customAllowlist);
        expect(result).toBeNull();
      });

      it('should use default allowlist when custom list is empty', () => {
        const result = validateCommand('pnpm', []);
        expect(result).toBeNull();
      });
    });

    describe('denied commands', () => {
      it('should deny explicitly dangerous commands', () => {
        const dangerousCmds = [
          'rm',
          'rmdir',
          'sudo',
          'su',
          'curl',
          'wget',
          'ssh',
          'dd',
          'kill',
          'reboot',
          'shutdown',
        ];

        for (const cmd of dangerousCmds) {
          const result = validateCommand(cmd, []);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('command');
          expect(result?.reason).toContain('explicitly denied');
        }
      });

      it('should deny denied commands even if in custom allowlist', () => {
        // Deny list takes precedence over allowlist
        const result = validateCommand('rm', ['rm', 'ls']);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('explicitly denied');
      });

      it('should deny commands with path separators', () => {
        const pathCmds = ['./malicious', '../escape', '/usr/bin/evil', 'sub\\cmd'];

        for (const cmd of pathCmds) {
          const result = validateCommand(cmd, []);
          expect(result).not.toBeNull();
          expect(result?.reason).toContain('path separators');
        }
      });

      it('should deny commands not in allowlist', () => {
        const result = validateCommand('unknowncmd', ['pnpm', 'npm']);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('not in the allowlist');
      });
    });

    describe('command normalization', () => {
      it('should normalize command names by removing extensions', () => {
        // If we had 'node' in the allowlist, 'node.exe' should match
        const result = validateCommand('node.exe', []);
        expect(result).toBeNull();
      });

      it('should normalize .cmd extension', () => {
        const result = validateCommand('npm.cmd', []);
        expect(result).toBeNull();
      });

      it('should normalize .sh extension', () => {
        const result = validateCommand('git.sh', []);
        expect(result).toBeNull();
      });
    });
  });

  describe('validateArgs', () => {
    describe('safe arguments', () => {
      it('should allow normal arguments', () => {
        const result = validateArgs(['--version', '-v', 'file.txt', '--flag=value']);
        expect(result).toBeNull();
      });

      it('should allow empty arguments array', () => {
        const result = validateArgs([]);
        expect(result).toBeNull();
      });

      it('should allow file paths without traversal', () => {
        const result = validateArgs(['src/main.ts', 'test/unit.test.ts']);
        expect(result).toBeNull();
      });
    });

    describe('dangerous argument patterns', () => {
      it('should deny command chaining with semicolon', () => {
        const result = validateArgs(['file.txt; rm -rf /']);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('command');
      });

      it('should deny command chaining with ampersand', () => {
        const result = validateArgs(['file.txt && malicious']);
        expect(result).not.toBeNull();
      });

      it('should deny command chaining with pipe', () => {
        const result = validateArgs(['file.txt | cat /etc/passwd']);
        expect(result).not.toBeNull();
      });

      it('should deny backtick command substitution', () => {
        const result = validateArgs(['`whoami`']);
        expect(result).not.toBeNull();
      });

      it('should deny dollar-sign command substitution', () => {
        const result = validateArgs(['$(whoami)']);
        expect(result).not.toBeNull();
      });

      it('should deny output redirection', () => {
        const result = validateArgs(['> /etc/passwd']);
        expect(result).not.toBeNull();
      });

      it('should deny input redirection', () => {
        const result = validateArgs(['< /etc/shadow']);
        expect(result).not.toBeNull();
      });

      it('should deny backgrounding with trailing ampersand', () => {
        const result = validateArgs(['command &']);
        expect(result).not.toBeNull();
      });

      it('should deny shell variable expansion', () => {
        const result = validateArgs(['${HOME}']);
        expect(result).not.toBeNull();
      });

      it('should deny here-doc syntax', () => {
        const result = validateArgs(['<<<EOF']);
        expect(result).not.toBeNull();
      });

      it('should deny parentheses (subshell)', () => {
        const result = validateArgs(['(malicious)']);
        expect(result).not.toBeNull();
      });
    });

    describe('multiple argument validation', () => {
      it('should catch dangerous pattern in any argument', () => {
        const result = validateArgs(['--safe', 'also-safe', '; rm -rf', '--another-safe']);
        expect(result).not.toBeNull();
        expect(result?.denied).toBe('; rm -rf');
      });
    });
  });

  describe('isCommandInCategory', () => {
    it('should identify package manager commands', () => {
      expect(isCommandInCategory('pnpm', 'packageManagers')).toBe(true);
      expect(isCommandInCategory('npm', 'packageManagers')).toBe(true);
      expect(isCommandInCategory('yarn', 'packageManagers')).toBe(true);
      expect(isCommandInCategory('bun', 'packageManagers')).toBe(true);
    });

    it('should identify version control commands', () => {
      expect(isCommandInCategory('git', 'versionControl')).toBe(true);
    });

    it('should identify testing tools', () => {
      expect(isCommandInCategory('vitest', 'testing')).toBe(true);
      expect(isCommandInCategory('jest', 'testing')).toBe(true);
    });

    it('should return false for commands not in category', () => {
      expect(isCommandInCategory('git', 'packageManagers')).toBe(false);
      expect(isCommandInCategory('pnpm', 'versionControl')).toBe(false);
    });

    it('should return false for unknown commands', () => {
      expect(isCommandInCategory('unknowncmd', 'packageManagers')).toBe(false);
    });
  });

  describe('getCommandCategory', () => {
    it('should return correct category for known commands', () => {
      expect(getCommandCategory('pnpm')).toBe('packageManagers');
      expect(getCommandCategory('git')).toBe('versionControl');
      expect(getCommandCategory('vitest')).toBe('testing');
      expect(getCommandCategory('eslint')).toBe('linting');
      expect(getCommandCategory('node')).toBe('node');
      expect(getCommandCategory('echo')).toBe('shellUtils');
    });

    it('should return null for unknown commands', () => {
      expect(getCommandCategory('unknowncmd')).toBeNull();
      expect(getCommandCategory('malicious')).toBeNull();
    });

    it('should handle command with extension', () => {
      expect(getCommandCategory('node.exe')).toBe('node');
    });
  });

  describe('constants', () => {
    describe('COMMAND_CATEGORIES', () => {
      it('should have all expected categories', () => {
        const expectedCategories = [
          'packageManagers',
          'versionControl',
          'github',
          'node',
          'buildTools',
          'testing',
          'linting',
          'docs',
          'shellUtils',
        ];

        for (const category of expectedCategories) {
          expect(COMMAND_CATEGORIES).toHaveProperty(category);
        }
      });

      it('should have pnpm in packageManagers', () => {
        expect(COMMAND_CATEGORIES.packageManagers).toContain('pnpm');
      });

      it('should have git in versionControl', () => {
        expect(COMMAND_CATEGORIES.versionControl).toContain('git');
      });
    });

    describe('ALLOWED_COMMANDS', () => {
      it('should be a flat array of all category commands', () => {
        expect(Array.isArray(ALLOWED_COMMANDS)).toBe(true);
        expect(ALLOWED_COMMANDS).toContain('pnpm');
        expect(ALLOWED_COMMANDS).toContain('git');
        expect(ALLOWED_COMMANDS).toContain('vitest');
      });

      it('should not include denied commands', () => {
        for (const denied of DENIED_COMMANDS) {
          expect(ALLOWED_COMMANDS).not.toContain(denied);
        }
      });
    });

    describe('DENIED_COMMANDS', () => {
      it('should include destructive system commands', () => {
        expect(DENIED_COMMANDS).toContain('rm');
        expect(DENIED_COMMANDS).toContain('rmdir');
        expect(DENIED_COMMANDS).toContain('dd');
      });

      it('should include privilege escalation commands', () => {
        expect(DENIED_COMMANDS).toContain('sudo');
        expect(DENIED_COMMANDS).toContain('su');
      });

      it('should include network tools', () => {
        expect(DENIED_COMMANDS).toContain('curl');
        expect(DENIED_COMMANDS).toContain('wget');
        expect(DENIED_COMMANDS).toContain('ssh');
        expect(DENIED_COMMANDS).toContain('nc');
      });

      it('should include process control commands', () => {
        expect(DENIED_COMMANDS).toContain('kill');
        expect(DENIED_COMMANDS).toContain('killall');
        expect(DENIED_COMMANDS).toContain('pkill');
      });

      it('should include system control commands', () => {
        expect(DENIED_COMMANDS).toContain('reboot');
        expect(DENIED_COMMANDS).toContain('shutdown');
        expect(DENIED_COMMANDS).toContain('systemctl');
      });
    });

    describe('DENIED_ARG_PATTERNS', () => {
      it('should be an array of RegExp patterns', () => {
        expect(Array.isArray(DENIED_ARG_PATTERNS)).toBe(true);
        for (const pattern of DENIED_ARG_PATTERNS) {
          expect(pattern).toBeInstanceOf(RegExp);
        }
      });
    });
  });

  describe('container escape prevention', () => {
    it('should block path traversal attempts', () => {
      const traversalAttempts = ['../../../etc/passwd', '..\\..\\windows\\system32'];

      // These are caught by path separator check
      for (const attempt of traversalAttempts) {
        const result = validateCommand(attempt, []);
        expect(result).not.toBeNull();
      }
    });

    it('should block common container escape commands', () => {
      const escapeCommands = ['mount', 'umount', 'chroot', 'nsenter'];

      for (const cmd of escapeCommands) {
        const result = validateCommand(cmd, []);
        expect(result).not.toBeNull();
      }
    });
  });
});
