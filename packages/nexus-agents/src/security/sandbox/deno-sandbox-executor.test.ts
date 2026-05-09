/* eslint-disable @typescript-eslint/no-deprecated -- Tests for the
 * deprecated DenoSandboxExecutor (#2499). Tests stay until the executor
 * itself is deleted in the follow-up. */
/**
 * Tests for DenoSandboxExecutor (#1898).
 *
 * Mocks the deno binary at the execFile boundary so tests run without Deno
 * installed. Verifies argv assembly, validation, denied/unavailable paths,
 * and result shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SandboxExecutionOptions, SandboxPolicy } from './sandbox-types.js';

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
}));

import { DenoSandboxExecutor, buildDenoArgs, resetDenoCache } from './deno-sandbox-executor.js';

function makePolicy(overrides: Partial<SandboxPolicy> = {}): SandboxPolicy {
  return {
    id: 'test',
    name: 'test',
    mode: 'deno',
    allowedCommands: ['echo', 'git'],
    allowedEnvVars: [],
    pathRules: [],
    capabilities: ['process_spawn'],
    limits: {},
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SandboxExecutionOptions> = {}): SandboxExecutionOptions {
  return {
    policy: makePolicy(),
    ...overrides,
  };
}

describe('buildDenoArgs', () => {
  it('emits eval + --no-prompt + flags + JSON-encoded command/args (no shell parsing)', () => {
    const args = buildDenoArgs('echo', ['hello world'], makeOptions());
    expect(args[0]).toBe('eval');
    // --no-prompt must be present so denied permissions throw rather than
    // hang on TTY (security review on PR #2427).
    expect(args).toContain('--no-prompt');
    expect(args).toContain('--allow-run=echo,git');
    // Last arg is the eval script: should reference the JSON-encoded command + args.
    const evalScript = args[args.length - 1];
    expect(evalScript).toContain('"echo"');
    expect(evalScript).toContain('["hello world"]');
    expect(evalScript).toContain('Deno.Command');
    expect(evalScript).toContain('Deno.exit');
  });

  it('JSON-encodes args containing shell metacharacters safely', () => {
    const args = buildDenoArgs('echo', ['$(rm -rf /)'], makeOptions());
    const evalScript = args[args.length - 1];
    expect(evalScript).toContain('["$(rm -rf /)"]');
    expect(evalScript).toMatch(/Deno\.Command\(\s*"echo"/);
  });
});

describe('DenoSandboxExecutor.validate', () => {
  it('allows commands in the policy allowlist', () => {
    const exec = new DenoSandboxExecutor();
    const result = exec.validate('git', ['status'], makeOptions());
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects commands NOT in the policy allowlist', () => {
    const exec = new DenoSandboxExecutor();
    const result = exec.validate('curl', [], makeOptions());
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]?.type).toBe('command');
  });

  // #2428 ask 1: configurationWarnings surface "capability declared but
  // unenforceable" mismatches via the SandboxResult, so callers can detect
  // config gaps without scraping logs.
  it('surfaces configurationWarnings when policy has unenforceable capabilities', () => {
    const exec = new DenoSandboxExecutor();
    // process_spawn declared but allowedCommands kept ['echo','git'] so cmd
    // validation still passes; pad with filesystem_read + env_access without
    // their allowlists to trigger two warnings.
    const result = exec.validate(
      'echo',
      [],
      makeOptions({
        policy: makePolicy({
          capabilities: ['process_spawn', 'filesystem_read', 'env_access'],
          allowedCommands: ['echo'],
          allowedEnvVars: [],
          pathRules: [],
        }),
      })
    );
    expect(result.allowed).toBe(true);
    expect(result.configurationWarnings).toBeDefined();
    expect(result.configurationWarnings).toHaveLength(2);
    expect(result.configurationWarnings?.[0]).toContain('filesystem_read');
    expect(result.configurationWarnings?.[1]).toContain('env_access');
  });

  it('omits configurationWarnings field when none apply', () => {
    const exec = new DenoSandboxExecutor();
    const result = exec.validate('echo', [], makeOptions());
    // Default policy has process_spawn + ['echo','git'], no warnings expected.
    expect(result.configurationWarnings).toBeUndefined();
  });
});

describe('DenoSandboxExecutor.execute', () => {
  beforeEach(() => {
    resetDenoCache();
    mockExecFileAsync.mockReset();
  });

  it('returns denied when policy rejects the command', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'deno 2.0.0', stderr: '' });
    const exec = new DenoSandboxExecutor();
    const result = await exec.execute('curl', [], makeOptions());
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain('policy denied');
  });

  it("returns deno-unavailable when deno isn't installed", async () => {
    // First call (deno --version) fails — Deno not available.
    mockExecFileAsync.mockRejectedValueOnce(new Error('command not found'));
    const exec = new DenoSandboxExecutor();
    const result = await exec.execute('echo', ['hi'], makeOptions());
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('Deno is not available');
  });

  it('runs the command via deno when available + allowed', async () => {
    // First call: --version (availability check). Second: the actual run.
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'deno 2.0.0', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'hello', stderr: '' });

    const exec = new DenoSandboxExecutor();
    const result = await exec.execute('echo', ['hi'], makeOptions());

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    // Verify the deno invocation went through with the eval + flag set.
    expect(mockExecFileAsync.mock.calls[1]?.[0]).toBe('deno');
    const denoArgs = mockExecFileAsync.mock.calls[1]?.[1] as readonly string[];
    expect(denoArgs[0]).toBe('eval');
    expect(denoArgs).toContain('--allow-run=echo,git');
  });

  it('translates execFile errors into a SandboxResult instead of throwing', async () => {
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'deno 2.0.0', stderr: '' })
      .mockRejectedValueOnce(
        Object.assign(new Error('boom'), { code: 7, stdout: '', stderr: 'failed' })
      );

    const exec = new DenoSandboxExecutor();
    const result = await exec.execute('echo', ['hi'], makeOptions());
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain('failed');
  });
});
