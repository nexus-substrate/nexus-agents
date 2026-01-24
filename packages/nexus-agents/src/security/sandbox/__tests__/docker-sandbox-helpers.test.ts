/**
 * Docker Sandbox Helpers Tests
 *
 * Tests for Docker sandbox helper functions.
 * Verifies output processing, error handling, and utility functions.
 *
 * @module security/sandbox/__tests__/docker-sandbox-helpers.test
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PolicyEvaluation } from '../sandbox-types.js';

// Setup mocks before importing the module
const mockExecFileAsync = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}));

// Import after mocks are set up
const {
  MAX_OUTPUT_SIZE,
  DEFAULT_IMAGE,
  isDockerAvailable,
  resetDockerCache,
  bytesToDockerMemory,
  truncateOutput,
  createEmptyResourceUsage,
  parseExecError,
  createDeniedResult,
  createDockerUnavailableResult,
  createResourceUsageFromOutput,
} = await import('../docker-sandbox-helpers.js');

describe('Docker Sandbox Helpers', () => {
  describe('constants', () => {
    it('should have MAX_OUTPUT_SIZE defined', () => {
      expect(MAX_OUTPUT_SIZE).toBe(1024 * 1024); // 1MB
    });

    it('should have DEFAULT_IMAGE defined', () => {
      expect(DEFAULT_IMAGE).toBe('node:22-alpine');
    });
  });

  describe('isDockerAvailable', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetDockerCache();
    });

    afterEach(() => {
      resetDockerCache();
    });

    it('should return true when docker version succeeds', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'Docker version 24.0.0' });

      const result = await isDockerAvailable();

      expect(result).toBe(true);
    });

    it('should return false when docker version fails', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('Docker not found'));

      const result = await isDockerAvailable();

      expect(result).toBe(false);
    });

    it('should cache the result', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'Docker version 24.0.0' });

      // First call
      const result1 = await isDockerAvailable();
      // Second call
      const result2 = await isDockerAvailable();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // execFile should only be called once due to caching
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetDockerCache', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      resetDockerCache();
    });

    it('should reset the cache so next call checks again', async () => {
      // First: Docker available
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'Docker version 24.0.0' });
      await isDockerAvailable();

      // Reset cache
      resetDockerCache();

      // Second: Docker not available
      mockExecFileAsync.mockRejectedValueOnce(new Error('Docker stopped'));
      const result = await isDockerAvailable();

      expect(result).toBe(false);
      expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('bytesToDockerMemory', () => {
    it('should convert bytes to gigabytes', () => {
      const oneGB = 1024 * 1024 * 1024;
      expect(bytesToDockerMemory(oneGB)).toBe('1g');
      expect(bytesToDockerMemory(2 * oneGB)).toBe('2g');
    });

    it('should convert bytes to megabytes', () => {
      const oneMB = 1024 * 1024;
      expect(bytesToDockerMemory(oneMB)).toBe('1m');
      expect(bytesToDockerMemory(512 * oneMB)).toBe('512m');
      expect(bytesToDockerMemory(256 * oneMB)).toBe('256m');
    });

    it('should convert bytes to kilobytes', () => {
      const oneKB = 1024;
      expect(bytesToDockerMemory(oneKB)).toBe('1k');
      expect(bytesToDockerMemory(512 * oneKB)).toBe('512k');
    });

    it('should floor the values', () => {
      const bytes = 1.5 * 1024 * 1024;
      expect(bytesToDockerMemory(bytes)).toBe('1m');
    });

    it('should handle edge cases', () => {
      expect(bytesToDockerMemory(0)).toBe('0k');
      expect(bytesToDockerMemory(1)).toBe('0k');
      expect(bytesToDockerMemory(1023)).toBe('0k');
      expect(bytesToDockerMemory(1024)).toBe('1k');
    });
  });

  describe('truncateOutput', () => {
    it('should not truncate output within limit', () => {
      const output = 'Hello, World!';
      const result = truncateOutput(output);

      expect(result).toBe(output);
    });

    it('should truncate output exceeding limit', () => {
      const output = 'a'.repeat(MAX_OUTPUT_SIZE + 100);
      const result = truncateOutput(output);

      expect(result.length).toBeLessThan(output.length);
      expect(result).toContain('... [truncated');
      expect(result).toContain('100 bytes]');
    });

    it('should use custom maxSize', () => {
      const output = 'Hello, World! This is a test.';
      const result = truncateOutput(output, 10);

      expect(result).toContain('Hello, Wor');
      expect(result).toContain('truncated');
    });

    it('should handle empty output', () => {
      const result = truncateOutput('');
      expect(result).toBe('');
    });

    it('should handle output exactly at limit', () => {
      const output = 'a'.repeat(100);
      const result = truncateOutput(output, 100);

      expect(result).toBe(output);
      expect(result).not.toContain('truncated');
    });
  });

  describe('createEmptyResourceUsage', () => {
    it('should create resource usage with all zeros', () => {
      const usage = createEmptyResourceUsage();

      expect(usage.memoryBytes).toBe(0);
      expect(usage.cpuTimeMs).toBe(0);
      expect(usage.processCount).toBe(0);
      expect(usage.outputBytes).toBe(0);
      expect(usage.wallTimeMs).toBe(0);
    });
  });

  describe('parseExecError', () => {
    it('should parse error with numeric exit code', () => {
      const error = {
        code: 1,
        stdout: 'output',
        stderr: 'error message',
      };

      const result = parseExecError(error);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('output');
      expect(result.stderr).toBe('error message');
      expect(result.isTimeout).toBe(false);
    });

    it('should detect timeout when killed is true', () => {
      const error = {
        code: 'ETIMEDOUT',
        killed: true,
        stdout: '',
        stderr: 'Command timed out',
      };

      const result = parseExecError(error);

      expect(result.isTimeout).toBe(true);
    });

    it('should handle missing fields', () => {
      const error = {};

      const result = parseExecError(error);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Unknown error');
      expect(result.isTimeout).toBe(false);
    });

    it('should use message when stderr is missing', () => {
      const error = {
        code: 1,
        message: 'Command failed',
      };

      const result = parseExecError(error);

      expect(result.stderr).toBe('Command failed');
    });

    it('should truncate long output', () => {
      const error = {
        code: 1,
        stdout: 'a'.repeat(MAX_OUTPUT_SIZE + 100),
        stderr: 'b'.repeat(MAX_OUTPUT_SIZE + 100),
      };

      const result = parseExecError(error);

      expect(result.stdout.length).toBeLessThan(error.stdout.length);
      expect(result.stderr.length).toBeLessThan(error.stderr.length);
    });

    it('should handle non-numeric exit code', () => {
      const error = {
        code: 'ENOENT',
        stderr: 'Command not found',
      };

      const result = parseExecError(error);

      expect(result.exitCode).toBe(1); // Default to 1
    });
  });

  describe('createDeniedResult', () => {
    it('should create result with exit code 126', () => {
      const evaluation: PolicyEvaluation = {
        allowed: false,
        policyId: 'standard',
        reason: 'Command not allowed',
        violations: [],
      };

      const result = createDeniedResult(evaluation, 100);

      expect(result.exitCode).toBe(126);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Sandbox policy denied');
      expect(result.stderr).toContain('Command not allowed');
    });

    it('should handle missing reason', () => {
      const evaluation: PolicyEvaluation = {
        allowed: false,
        policyId: 'standard',
        violations: [],
      };

      const result = createDeniedResult(evaluation, 100);

      expect(result.stderr).toContain('Unknown reason');
    });

    it('should create empty resource usage', () => {
      const evaluation: PolicyEvaluation = {
        allowed: false,
        policyId: 'test',
        violations: [],
      };

      const result = createDeniedResult(evaluation, 100);

      expect(result.resourceUsage.memoryBytes).toBe(0);
      expect(result.resourceUsage.processCount).toBe(0);
    });
  });

  describe('createDockerUnavailableResult', () => {
    it('should create result with exit code 127', () => {
      const result = createDockerUnavailableResult();

      expect(result.exitCode).toBe(127);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Docker is not available');
    });

    it('should include install instruction', () => {
      const result = createDockerUnavailableResult();

      expect(result.stderr).toContain('Install Docker');
    });

    it('should create empty resource usage', () => {
      const result = createDockerUnavailableResult();

      expect(result.resourceUsage.memoryBytes).toBe(0);
      expect(result.resourceUsage.cpuTimeMs).toBe(0);
    });
  });

  describe('createResourceUsageFromOutput', () => {
    it('should calculate output bytes from stdout and stderr', () => {
      const stdout = 'Hello';
      const stderr = 'World';
      const durationMs = 1000;

      const result = createResourceUsageFromOutput(stdout, stderr, durationMs);

      expect(result.outputBytes).toBe(stdout.length + stderr.length);
      expect(result.wallTimeMs).toBe(1000);
    });

    it('should set process count to 1', () => {
      const result = createResourceUsageFromOutput('', '', 500);

      expect(result.processCount).toBe(1);
    });

    it('should set memory and CPU to 0 (not tracked in Docker)', () => {
      const result = createResourceUsageFromOutput('test', 'test', 1000);

      expect(result.memoryBytes).toBe(0);
      expect(result.cpuTimeMs).toBe(0);
    });

    it('should handle empty output', () => {
      const result = createResourceUsageFromOutput('', '', 0);

      expect(result.outputBytes).toBe(0);
      expect(result.wallTimeMs).toBe(0);
    });
  });

  describe('edge cases', () => {
    describe('large output handling', () => {
      it('should handle output just under limit', () => {
        const output = 'a'.repeat(MAX_OUTPUT_SIZE - 1);
        const result = truncateOutput(output);

        expect(result).toBe(output);
      });

      it('should handle output exactly at limit', () => {
        const output = 'a'.repeat(MAX_OUTPUT_SIZE);
        const result = truncateOutput(output);

        expect(result).toBe(output);
      });

      it('should handle output one byte over limit', () => {
        const output = 'a'.repeat(MAX_OUTPUT_SIZE + 1);
        const result = truncateOutput(output);

        expect(result).toContain('truncated');
        expect(result).toContain('1 bytes');
      });
    });

    describe('memory conversion edge cases', () => {
      it('should handle boundary between KB and MB', () => {
        const almostMB = 1024 * 1024 - 1;
        const exactlyMB = 1024 * 1024;

        expect(bytesToDockerMemory(almostMB)).toBe('1023k');
        expect(bytesToDockerMemory(exactlyMB)).toBe('1m');
      });

      it('should handle boundary between MB and GB', () => {
        const almostGB = 1024 * 1024 * 1024 - 1;
        const exactlyGB = 1024 * 1024 * 1024;

        expect(bytesToDockerMemory(almostGB)).toBe('1023m');
        expect(bytesToDockerMemory(exactlyGB)).toBe('1g');
      });
    });
  });
});
