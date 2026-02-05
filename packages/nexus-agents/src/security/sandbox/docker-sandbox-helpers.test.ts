/**
 * Tests for Docker Sandbox Helpers
 * @module security/sandbox/docker-sandbox-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { PolicyEvaluation } from './sandbox-types.js';
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
} from './docker-sandbox-helpers.js';

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('has correct MAX_OUTPUT_SIZE', () => {
    expect(MAX_OUTPUT_SIZE).toBe(1024 * 1024);
  });

  it('has correct DEFAULT_IMAGE', () => {
    expect(DEFAULT_IMAGE).toBe('node:22-alpine');
  });
});

// ============================================================================
// bytesToDockerMemory
// ============================================================================

describe('bytesToDockerMemory', () => {
  it('converts GB', () => {
    expect(bytesToDockerMemory(2 * 1024 * 1024 * 1024)).toBe('2g');
  });

  it('converts MB', () => {
    expect(bytesToDockerMemory(512 * 1024 * 1024)).toBe('512m');
  });

  it('converts KB', () => {
    expect(bytesToDockerMemory(64 * 1024)).toBe('64k');
  });

  it('floors to integer', () => {
    expect(bytesToDockerMemory(1.5 * 1024 * 1024 * 1024)).toBe('1g');
  });

  it('handles exact boundary (1GB)', () => {
    expect(bytesToDockerMemory(1024 * 1024 * 1024)).toBe('1g');
  });

  it('handles small values in KB', () => {
    expect(bytesToDockerMemory(1024)).toBe('1k');
  });
});

// ============================================================================
// truncateOutput
// ============================================================================

describe('truncateOutput', () => {
  it('returns short output unchanged', () => {
    expect(truncateOutput('short')).toBe('short');
  });

  it('truncates output exceeding max size', () => {
    const long = 'x'.repeat(200);
    const result = truncateOutput(long, 50);
    expect(result.length).toBeLessThanOrEqual(100); // truncateWithInfo adds info
    expect(result).toContain('...');
  });
});

// ============================================================================
// createEmptyResourceUsage
// ============================================================================

describe('createEmptyResourceUsage', () => {
  it('returns zeroed resource usage', () => {
    const usage = createEmptyResourceUsage();
    expect(usage.memoryBytes).toBe(0);
    expect(usage.cpuTimeMs).toBe(0);
    expect(usage.processCount).toBe(0);
    expect(usage.outputBytes).toBe(0);
    expect(usage.wallTimeMs).toBe(0);
  });
});

// ============================================================================
// parseExecError
// ============================================================================

describe('parseExecError', () => {
  it('parses numeric exit code', () => {
    const result = parseExecError({ code: 2, stdout: 'out', stderr: 'err' });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('defaults exit code to 1 for non-numeric', () => {
    const result = parseExecError({ code: 'ENOENT' });
    expect(result.exitCode).toBe(1);
  });

  it('detects timeout from killed flag', () => {
    const result = parseExecError({ killed: true });
    expect(result.isTimeout).toBe(true);
  });

  it('returns false for isTimeout when not killed', () => {
    const result = parseExecError({});
    expect(result.isTimeout).toBe(false);
  });

  it('falls back to message for missing stderr', () => {
    const result = parseExecError({ message: 'process failed' });
    expect(result.stderr).toContain('process failed');
  });

  it('uses Unknown error when nothing available', () => {
    const result = parseExecError({});
    expect(result.stderr).toContain('Unknown error');
  });

  it('uses empty string for missing stdout', () => {
    const result = parseExecError({});
    expect(result.stdout).toBe('');
  });
});

// ============================================================================
// createDeniedResult
// ============================================================================

describe('createDeniedResult', () => {
  it('returns exit code 126', () => {
    const evaluation = {
      allowed: false,
      reason: 'Unsafe command',
      policyId: 'policy-1',
      violations: [],
    } as PolicyEvaluation;
    const result = createDeniedResult(evaluation, 100);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain('Unsafe command');
    expect(result.stdout).toBe('');
  });

  it('handles missing reason', () => {
    const evaluation = {
      allowed: false,
      policyId: 'policy-1',
      violations: [],
    } as PolicyEvaluation;
    const result = createDeniedResult(evaluation, 100);
    expect(result.stderr).toContain('Unknown reason');
  });

  it('returns empty resource usage', () => {
    const evaluation = {
      allowed: false,
      reason: 'test',
      policyId: 'p1',
      violations: [],
    } as PolicyEvaluation;
    const result = createDeniedResult(evaluation, 0);
    expect(result.resourceUsage.memoryBytes).toBe(0);
    expect(result.resourceUsage.processCount).toBe(0);
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

  it('returns helpful error message', () => {
    const result = createDockerUnavailableResult();
    expect(result.stderr).toContain('Docker is not available');
  });

  it('returns empty resource usage', () => {
    const result = createDockerUnavailableResult();
    expect(result.resourceUsage.memoryBytes).toBe(0);
  });
});

// ============================================================================
// createResourceUsageFromOutput
// ============================================================================

describe('createResourceUsageFromOutput', () => {
  it('calculates output bytes from stdout and stderr', () => {
    const result = createResourceUsageFromOutput('hello', 'world', 500);
    expect(result.outputBytes).toBe(10);
    expect(result.wallTimeMs).toBe(500);
    expect(result.processCount).toBe(1);
  });

  it('handles empty output', () => {
    const result = createResourceUsageFromOutput('', '', 100);
    expect(result.outputBytes).toBe(0);
    expect(result.wallTimeMs).toBe(100);
  });

  it('sets memory and CPU to 0', () => {
    const result = createResourceUsageFromOutput('out', 'err', 200);
    expect(result.memoryBytes).toBe(0);
    expect(result.cpuTimeMs).toBe(0);
  });
});
