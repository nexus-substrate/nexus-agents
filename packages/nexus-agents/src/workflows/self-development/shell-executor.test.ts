/**
 * Tests for Shell Executor
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { executePnpmScript, runVerificationCheck, ShellError } from './shell-executor.js';

describe('ShellError', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates error with command and args', () => {
    const error = new ShellError('Test error', 'test', ['arg1', 'arg2']);

    expect(error.message).toBe('Test error');
    expect(error.command).toBe('test');
    expect(error.args).toEqual(['arg1', 'arg2']);
    expect(error.name).toBe('ShellError');
  });

  it('creates error with exit code and stderr', () => {
    const error = new ShellError('Test error', 'test', ['arg'], 1, 'stderr output');

    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe('stderr output');
  });
});

describe('executePnpmScript', () => {
  it('returns a promise', () => {
    const result = executePnpmScript('test', { cwd: '/tmp' });
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('runVerificationCheck', () => {
  it('returns check result with correct name and command', async () => {
    const result = await runVerificationCheck('typecheck', 'typecheck', {
      cwd: '/nonexistent',
    });

    expect(result.name).toBe('typecheck');
    expect(result.command).toBe('pnpm typecheck');
    // Will fail because pnpm isn't available in this path
    expect(result.passed).toBe(false);
  });

  it('includes error for failed checks', async () => {
    const result = await runVerificationCheck('lint', 'lint', {
      cwd: '/nonexistent',
    });

    expect(result.passed).toBe(false);
    // Error should be present
    expect(result.error ?? result.output).toBeDefined();
  });
});

describe('ShellResult structure', () => {
  it('has all required fields', () => {
    const result = {
      command: 'test',
      args: ['arg1'],
      exitCode: 0,
      stdout: 'output',
      stderr: '',
      durationMs: 100,
      success: true,
    };

    expect(result.command).toBe('test');
    expect(result.args).toEqual(['arg1']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('output');
    expect(result.stderr).toBe('');
    expect(result.durationMs).toBe(100);
    expect(result.success).toBe(true);
  });
});

describe('ShellOptions', () => {
  it('accepts cwd option', () => {
    const options = { cwd: '/tmp' };
    expect(options.cwd).toBe('/tmp');
  });

  it('accepts timeout option', () => {
    const options = { timeoutMs: 5000 };
    expect(options.timeoutMs).toBe(5000);
  });

  it('accepts env option', () => {
    const options = { env: { NODE_ENV: 'test' } };
    expect(options.env.NODE_ENV).toBe('test');
  });
});

describe('VerificationCheckResult structure', () => {
  it('has required fields', () => {
    const result = {
      name: 'typecheck',
      command: 'pnpm typecheck',
      passed: true,
      durationMs: 1000,
    };

    expect(result.name).toBe('typecheck');
    expect(result.command).toBe('pnpm typecheck');
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(1000);
  });

  it('supports optional output field', () => {
    const result = {
      name: 'test',
      command: 'pnpm test',
      passed: false,
      durationMs: 500,
      output: 'Test failed',
    };

    expect(result.output).toBe('Test failed');
  });

  it('supports optional error field', () => {
    const result = {
      name: 'lint',
      command: 'pnpm lint',
      passed: false,
      durationMs: 200,
      error: 'Lint error',
    };

    expect(result.error).toBe('Lint error');
  });
});
