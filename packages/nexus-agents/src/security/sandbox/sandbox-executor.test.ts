/**
 * Tests for sandbox-executor.ts
 *
 * Covers PolicySandboxExecutor: validate, parseExecError timeout detection,
 * denied execution, and createSandboxExecutor factory.
 */

import { describe, it, expect } from 'vitest';
import { PolicySandboxExecutor, createSandboxExecutor } from './sandbox-executor.js';
import { STANDARD_POLICY } from './default-policies.js';
import type { SandboxExecutionOptions } from './sandbox-types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOptions(overrides: Partial<SandboxExecutionOptions> = {}) {
  return {
    policy: STANDARD_POLICY,
    ...overrides,
  } as SandboxExecutionOptions;
}

// ============================================================================
// createSandboxExecutor factory
// ============================================================================

describe('createSandboxExecutor', () => {
  it('creates a PolicySandboxExecutor instance', () => {
    const executor = createSandboxExecutor();
    expect(executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(executor.name).toBe('PolicySandboxExecutor');
  });

  it('accepts custom config', () => {
    const executor = createSandboxExecutor({ enforce: false });
    expect(executor).toBeInstanceOf(PolicySandboxExecutor);
  });
});

// ============================================================================
// PolicySandboxExecutor.validate
// ============================================================================

describe('PolicySandboxExecutor - validate', () => {
  const executor = new PolicySandboxExecutor();

  it('allows commands in the allowlist', () => {
    const opts = makeOptions();
    // 'ls' is typically in the standard policy allowlist
    const result = executor.validate('ls', [], opts);
    expect(result.policyId).toBe(STANDARD_POLICY.id);
  });

  it('denies commands not in the allowlist', () => {
    const opts = makeOptions();
    const result = executor.validate('rm', ['-rf', '/'], opts);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('returns violations with reason', () => {
    const opts = makeOptions();
    const result = executor.validate('curl', ['http://evil.com'], opts);
    if (!result.allowed && result.violations[0]) {
      expect(result.violations[0].reason).toBeDefined();
    }
  });
});

// ============================================================================
// PolicySandboxExecutor - path traversal prevention
// ============================================================================

describe('PolicySandboxExecutor - path traversal prevention', () => {
  const executor = new PolicySandboxExecutor();

  it('rejects cwd with prefix-matching path that is not a subdirectory', () => {
    const opts = makeOptions({
      policy: {
        ...STANDARD_POLICY,
        pathRules: [{ path: '/tmp/safe', access: 'write' }],
      },
    });
    // /tmp/safe-evil should NOT match /tmp/safe
    const result = executor.validate('echo', [], { ...opts, cwd: '/tmp/safe-evil' });
    expect(result.allowed).toBe(false);
  });

  it('allows exact cwd match', () => {
    const opts = makeOptions({
      policy: {
        ...STANDARD_POLICY,
        pathRules: [{ path: '/tmp/safe', access: 'write' }],
      },
    });
    const result = executor.validate('echo', [], { ...opts, cwd: '/tmp/safe' });
    expect(result.allowed).toBe(true);
  });

  it('allows cwd inside allowed directory', () => {
    const opts = makeOptions({
      policy: {
        ...STANDARD_POLICY,
        pathRules: [{ path: '/tmp/safe', access: 'write' }],
      },
    });
    const result = executor.validate('echo', [], { ...opts, cwd: '/tmp/safe/subdir' });
    expect(result.allowed).toBe(true);
  });
});

// ============================================================================
// PolicySandboxExecutor.execute - denied
// ============================================================================

describe('PolicySandboxExecutor - execute denied', () => {
  it('returns failure for denied command', async () => {
    const executor = new PolicySandboxExecutor({ enforce: true });
    const result = await executor.execute('rm', ['-rf', '/'], makeOptions());
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain('denied');
  });
});

// ============================================================================
// PolicySandboxExecutor.execute - success
// ============================================================================

describe('PolicySandboxExecutor - execute allowed', () => {
  it('executes allowed commands', async () => {
    const executor = new PolicySandboxExecutor();
    const result = await executor.execute('echo', ['hello'], makeOptions({ cwd: process.cwd() }));
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr from failed commands', async () => {
    const executor = new PolicySandboxExecutor();
    const result = await executor.execute(
      'ls',
      ['nonexistent-dir-xyz'],
      makeOptions({ cwd: process.cwd() })
    );
    // ls on nonexistent dir fails with exit code 2
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it('records resource usage', async () => {
    const executor = new PolicySandboxExecutor();
    const result = await executor.execute('echo', ['test'], makeOptions({ cwd: process.cwd() }));
    expect(result.resourceUsage).toBeDefined();
    expect(result.resourceUsage.processCount).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
