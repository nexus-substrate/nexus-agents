/**
 * Tests for Docker Sandbox Helpers
 *
 * Covers constants, memory conversion, output truncation, resource usage,
 * error parsing, denied/unavailable results, and Docker availability check.
 *
 * @module security/sandbox/docker-sandbox-helpers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolicyEvaluation } from './sandbox-types.js';

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
}));

import {
  MAX_OUTPUT_SIZE,
  DEFAULT_IMAGE,
  bytesToDockerMemory,
  truncateOutput,
  createEmptyResourceUsage,
  parseExecError,
  createDeniedResult,
  createDockerUnavailableResult,
  createResourceUsageFromOutput,
  isDockerAvailable,
  resetDockerCache,
} from './docker-sandbox-helpers.js';

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('MAX_OUTPUT_SIZE is 1MB', () => {
    expect(MAX_OUTPUT_SIZE).toBe(1024 * 1024);
  });

  it('DEFAULT_IMAGE is node:22-alpine', () => {
    expect(DEFAULT_IMAGE).toBe('node:22-alpine');
  });
});

// ============================================================================
// bytesToDockerMemory
// ============================================================================

describe('bytesToDockerMemory', () => {
  it('converts gigabytes', () => {
    expect(bytesToDockerMemory(2 * 1024 * 1024 * 1024)).toBe('2g');
  });

  it('converts megabytes', () => {
    expect(bytesToDockerMemory(512 * 1024 * 1024)).toBe('512m');
  });

  it('converts kilobytes', () => {
    expect(bytesToDockerMemory(64 * 1024)).toBe('64k');
  });

  it('floors fractional gigabytes', () => {
    expect(bytesToDockerMemory(1.5 * 1024 * 1024 * 1024)).toBe('1g');
  });

  it('handles exact 1GB boundary', () => {
    expect(bytesToDockerMemory(1024 * 1024 * 1024)).toBe('1g');
  });

  it('handles exact 1MB boundary', () => {
    expect(bytesToDockerMemory(1024 * 1024)).toBe('1m');
  });

  it('handles exact 1KB boundary', () => {
    expect(bytesToDockerMemory(1024)).toBe('1k');
  });

  it('handles values just below 1GB as MB', () => {
    const justUnderGB = 1024 * 1024 * 1024 - 1;
    expect(bytesToDockerMemory(justUnderGB)).toBe('1023m');
  });

  it('handles values just below 1MB as KB', () => {
    const justUnderMB = 1024 * 1024 - 1;
    expect(bytesToDockerMemory(justUnderMB)).toBe('1023k');
  });

  it('handles zero bytes', () => {
    expect(bytesToDockerMemory(0)).toBe('0k');
  });

  it('floors sub-kilobyte values to 0k', () => {
    expect(bytesToDockerMemory(512)).toBe('0k');
  });
});

// ============================================================================
// truncateOutput
// ============================================================================

describe('truncateOutput', () => {
  it('returns short output unchanged', () => {
    expect(truncateOutput('short')).toBe('short');
  });

  it('truncates output exceeding custom max', () => {
    const long = 'x'.repeat(200);
    const result = truncateOutput(long, 50);
    expect(result).toContain('x'.repeat(50));
    expect(result).toContain('truncated');
    expect(result).toContain('150');
  });

  it('returns empty string unchanged', () => {
    expect(truncateOutput('')).toBe('');
  });

  it('does not truncate output exactly at max size', () => {
    const exact = 'y'.repeat(100);
    expect(truncateOutput(exact, 100)).toBe(exact);
  });

  it('truncates output one byte over max size', () => {
    const overByOne = 'z'.repeat(101);
    const result = truncateOutput(overByOne, 100);
    expect(result).toContain('truncated');
  });

  it('uses MAX_OUTPUT_SIZE as default when no maxSize given', () => {
    const small = 'a'.repeat(100);
    expect(truncateOutput(small)).toBe(small);
  });
});

// ============================================================================
// createEmptyResourceUsage
// ============================================================================

describe('createEmptyResourceUsage', () => {
  it('returns all fields zeroed', () => {
    const usage = createEmptyResourceUsage();
    expect(usage).toEqual({
      memoryBytes: 0,
      cpuTimeMs: 0,
      processCount: 0,
      outputBytes: 0,
      wallTimeMs: 0,
    });
  });

  it('returns a fresh object each call', () => {
    const a = createEmptyResourceUsage();
    const b = createEmptyResourceUsage();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ============================================================================
// parseExecError
// ============================================================================

describe('parseExecError', () => {
  it('parses numeric exit code with stdout and stderr', () => {
    const result = parseExecError({ code: 2, stdout: 'out', stderr: 'err' });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
    expect(result.isTimeout).toBe(false);
  });

  it('defaults exit code to 1 for string code', () => {
    const result = parseExecError({ code: 'ENOENT' });
    expect(result.exitCode).toBe(1);
  });

  it('defaults exit code to 1 for undefined code', () => {
    const result = parseExecError({});
    expect(result.exitCode).toBe(1);
  });

  it('detects timeout from killed flag', () => {
    const result = parseExecError({ killed: true });
    expect(result.isTimeout).toBe(true);
  });

  it('returns false for isTimeout when killed is false', () => {
    const result = parseExecError({ killed: false });
    expect(result.isTimeout).toBe(false);
  });

  it('returns false for isTimeout when killed is undefined', () => {
    const result = parseExecError({});
    expect(result.isTimeout).toBe(false);
  });

  it('falls back to message when stderr is missing', () => {
    const result = parseExecError({ message: 'process failed' });
    expect(result.stderr).toContain('process failed');
  });

  it('falls back to Unknown error when nothing provided', () => {
    const result = parseExecError({});
    expect(result.stderr).toContain('Unknown error');
  });

  it('uses empty string for missing stdout', () => {
    const result = parseExecError({});
    expect(result.stdout).toBe('');
  });

  it('prefers stderr over message', () => {
    const result = parseExecError({ stderr: 'real error', message: 'msg' });
    expect(result.stderr).toBe('real error');
  });

  it('handles exit code 0', () => {
    const result = parseExecError({ code: 0 });
    expect(result.exitCode).toBe(0);
  });

  it('throws on null or undefined input', () => {
    expect(() => parseExecError(null)).toThrow();
    expect(() => parseExecError(undefined)).toThrow();
  });
});

// ============================================================================
// createDeniedResult
// ============================================================================

describe('createDeniedResult', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeEvaluation = (reason?: string) =>
    ({
      allowed: false,
      reason,
      policyId: 'test-policy',
      violations: [],
    }) as PolicyEvaluation;

  it('returns exit code 126', () => {
    const result = createDeniedResult(makeEvaluation('Unsafe command'), 100);
    expect(result.exitCode).toBe(126);
  });

  it('includes the denial reason in stderr', () => {
    const result = createDeniedResult(makeEvaluation('Unsafe command'), 100);
    expect(result.stderr).toContain('Unsafe command');
  });

  it('returns empty stdout', () => {
    const result = createDeniedResult(makeEvaluation('test'), 0);
    expect(result.stdout).toBe('');
  });

  it('uses Unknown reason when reason is undefined', () => {
    const result = createDeniedResult(makeEvaluation(undefined), 0);
    expect(result.stderr).toContain('Unknown reason');
  });

  it('returns zeroed resource usage', () => {
    const result = createDeniedResult(makeEvaluation('x'), 999);
    expect(result.resourceUsage).toEqual({
      memoryBytes: 0,
      cpuTimeMs: 0,
      processCount: 0,
      outputBytes: 0,
      wallTimeMs: 0,
    });
  });
});

// ============================================================================
// createDockerUnavailableResult
// ============================================================================

describe('createDockerUnavailableResult', () => {
  it('returns exit code 127', () => {
    const result = createDockerUnavailableResult();
    expect(result.exitCode).toBe(127);
  });

  it('includes install hint in stderr', () => {
    const result = createDockerUnavailableResult();
    expect(result.stderr).toContain('Docker is not available');
    expect(result.stderr).toContain('Install Docker');
  });

  it('returns empty stdout', () => {
    const result = createDockerUnavailableResult();
    expect(result.stdout).toBe('');
  });

  it('returns zeroed resource usage', () => {
    const result = createDockerUnavailableResult();
    expect(result.resourceUsage).toEqual({
      memoryBytes: 0,
      cpuTimeMs: 0,
      processCount: 0,
      outputBytes: 0,
      wallTimeMs: 0,
    });
  });
});

// ============================================================================
// createResourceUsageFromOutput
// ============================================================================

describe('createResourceUsageFromOutput', () => {
  it('calculates outputBytes from stdout + stderr lengths', () => {
    const result = createResourceUsageFromOutput('hello', 'world', 500);
    expect(result.outputBytes).toBe(10);
  });

  it('stores wallTimeMs from durationMs argument', () => {
    const result = createResourceUsageFromOutput('a', 'b', 1234);
    expect(result.wallTimeMs).toBe(1234);
  });

  it('always sets processCount to 1', () => {
    const result = createResourceUsageFromOutput('', '', 0);
    expect(result.processCount).toBe(1);
  });

  it('sets memoryBytes and cpuTimeMs to 0', () => {
    const result = createResourceUsageFromOutput('out', 'err', 200);
    expect(result.memoryBytes).toBe(0);
    expect(result.cpuTimeMs).toBe(0);
  });

  it('handles empty strings', () => {
    const result = createResourceUsageFromOutput('', '', 0);
    expect(result.outputBytes).toBe(0);
    expect(result.wallTimeMs).toBe(0);
  });

  it('handles large output strings', () => {
    const big = 'x'.repeat(10000);
    const result = createResourceUsageFromOutput(big, big, 50);
    expect(result.outputBytes).toBe(20000);
  });
});

// ============================================================================
// isDockerAvailable & resetDockerCache
// ============================================================================

describe('isDockerAvailable', () => {
  beforeEach(() => {
    resetDockerCache();
    mockExecFileAsync.mockReset();
  });

  it('returns true when docker version succeeds', async () => {
    mockExecFileAsync.mockImplementation(() => Promise.resolve({ stdout: 'Docker version 24.0' }));
    const result = await isDockerAvailable();
    expect(result).toBe(true);
  });

  it('returns false when docker version fails', async () => {
    mockExecFileAsync.mockImplementation(() => Promise.reject(new Error('not found')));
    const result = await isDockerAvailable();
    expect(result).toBe(false);
  });

  it('caches successful result on subsequent calls', async () => {
    mockExecFileAsync.mockImplementation(() => Promise.resolve({ stdout: 'ok' }));
    await isDockerAvailable();
    const result = await isDockerAvailable();
    expect(result).toBe(true);
    // Should only be called once due to caching
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
  });

  it('caches failed result on subsequent calls', async () => {
    mockExecFileAsync.mockImplementation(() => Promise.reject(new Error('no docker')));
    await isDockerAvailable();
    const result = await isDockerAvailable();
    expect(result).toBe(false);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
  });
});

describe('resetDockerCache', () => {
  beforeEach(() => {
    resetDockerCache();
    mockExecFileAsync.mockReset();
  });

  it('clears cached result so next call re-checks', async () => {
    mockExecFileAsync.mockImplementation(() => Promise.resolve({ stdout: 'ok' }));
    await isDockerAvailable();
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);

    resetDockerCache();

    mockExecFileAsync.mockImplementation(() => Promise.reject(new Error('gone')));
    const result = await isDockerAvailable();
    expect(result).toBe(false);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
  });
});
