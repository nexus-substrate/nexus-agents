/**
 * Tests for Environment Validator
 *
 * Tests the SWE-bench environment validation functions.
 *
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a hoisted mock for execAsync
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock child_process.exec
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// Mock node:util to return our controlled mock
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocks are set up
import {
  validatePython,
  validateSwebench,
  validateDocker,
  validateDiskSpace,
  validateEnvironment,
  formatValidationResult,
  type EnvironmentValidationResult,
} from './environment-validator.js';

/** Bytes per GB constant for tests. */
const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Helper to create a command-based mock implementation.
 * Useful for tests where commands run in parallel.
 */
function createCommandMock(
  responses: Record<string, { stdout: string; stderr: string } | Error>
): (cmd: string) => Promise<{ stdout: string; stderr: string }> {
  return (cmd: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (response instanceof Error) {
          return Promise.reject(response);
        }
        return Promise.resolve(response);
      }
    }
    return Promise.reject(new Error(`Unexpected command: ${cmd}`));
  };
}

describe('environment-validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecAsync.mockReset();
  });

  // ==========================================================================
  // validatePython Tests
  // ==========================================================================

  describe('validatePython', () => {
    it('should return available=true for Python 3.10', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Python 3.10.12\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '/usr/bin/python3\n', stderr: '' });

      const result = await validatePython();

      expect(result.available).toBe(true);
      expect(result.version).toBe('3.10.12');
      expect(result.path).toBe('/usr/bin/python3');
    });

    it('should return available=true for Python 3.11', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Python 3.11.5\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '/usr/local/bin/python3\n', stderr: '' });

      const result = await validatePython();

      expect(result.available).toBe(true);
      expect(result.version).toBe('3.11.5');
    });

    it('should return available=false for Python 3.12', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Python 3.12.0\n', stderr: '' })
        .mockRejectedValueOnce(new Error('not found'))
        .mockRejectedValueOnce(new Error('not found'))
        .mockRejectedValueOnce(new Error('not found'));

      const result = await validatePython();

      expect(result.available).toBe(false);
      expect(result.version).toBeUndefined();
    });

    it('should return available=false for Python 3.9', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Python 3.9.18\n', stderr: '' })
        .mockRejectedValueOnce(new Error('not found'))
        .mockRejectedValueOnce(new Error('not found'))
        .mockRejectedValueOnce(new Error('not found'));

      const result = await validatePython();

      expect(result.available).toBe(false);
    });

    it('should try fallback commands when python3 fails', async () => {
      mockExecAsync
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({ stdout: 'Python 3.11.0\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '/usr/bin/python3.11\n', stderr: '' });

      const result = await validatePython();

      expect(result.available).toBe(true);
      expect(result.version).toBe('3.11.0');
    });

    it('should return available=false when no Python found', async () => {
      mockExecAsync.mockRejectedValue(new Error('command not found'));

      const result = await validatePython();

      expect(result.available).toBe(false);
    });
  });

  // ==========================================================================
  // validateSwebench Tests
  // ==========================================================================

  describe('validateSwebench', () => {
    it('should return installed=true when swebench importable', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '2.1.0\n', stderr: '' });

      const result = await validateSwebench();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('2.1.0');
    });

    it('should try pip show as fallback', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: 'ModuleNotFoundError' })
        .mockResolvedValueOnce({
          stdout: 'Name: swebench\nVersion: 2.0.5\nLocation: /path\n',
          stderr: '',
        });

      const result = await validateSwebench();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('2.0.5');
    });

    it('should return installed=false when not found', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: 'ModuleNotFoundError' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await validateSwebench();

      expect(result.installed).toBe(false);
    });

    it('should return installed=false on command failure', async () => {
      mockExecAsync.mockRejectedValue(new Error('command failed'));

      const result = await validateSwebench();

      expect(result.installed).toBe(false);
    });
  });

  // ==========================================================================
  // validateDocker Tests
  // ==========================================================================

  describe('validateDocker', () => {
    it('should return running=true with version', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '24.0.5\n', stderr: '' });

      const result = await validateDocker();

      expect(result.running).toBe(true);
      expect(result.version).toBe('24.0.5');
    });

    it('should try fallback format on empty version', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'Docker version 24.0.0, build abc123\n', stderr: '' });

      const result = await validateDocker();

      expect(result.running).toBe(true);
      expect(result.version).toBe('24.0.0,');
    });

    it('should return running=false when docker not available', async () => {
      mockExecAsync.mockRejectedValue(new Error('docker not found'));

      const result = await validateDocker();

      expect(result.running).toBe(false);
      expect(result.version).toBeUndefined();
    });

    it('should return running=false when daemon not running', async () => {
      mockExecAsync
        // First format returns empty (daemon not running)
        .mockResolvedValueOnce({ stdout: '', stderr: 'Cannot connect to daemon' })
        // Fallback format also fails to match version pattern
        .mockResolvedValueOnce({ stdout: 'Cannot connect to daemon\n', stderr: '' });

      const result = await validateDocker();

      expect(result.running).toBe(false);
    });
  });

  // ==========================================================================
  // validateDiskSpace Tests
  // ==========================================================================

  describe('validateDiskSpace', () => {
    it('should return sufficient=true for >120GB', async () => {
      const available = 150 * BYTES_PER_GB;
      mockExecAsync.mockResolvedValueOnce({
        stdout: `/dev/sda1 500000000000 300000000000 ${String(available)} 50% /\n`,
        stderr: '',
      });

      const result = await validateDiskSpace();

      expect(result.sufficient).toBe(true);
      expect(result.available).toBe(available);
    });

    it('should return sufficient=false for <120GB', async () => {
      const available = 50 * BYTES_PER_GB;
      mockExecAsync.mockResolvedValueOnce({
        stdout: `/dev/sda1 500000000000 450000000000 ${String(available)} 90% /\n`,
        stderr: '',
      });

      const result = await validateDiskSpace();

      expect(result.sufficient).toBe(false);
      expect(result.available).toBe(available);
    });

    it('should return sufficient=false on command failure', async () => {
      mockExecAsync.mockRejectedValue(new Error('df not found'));

      const result = await validateDiskSpace();

      expect(result.sufficient).toBe(false);
      expect(result.available).toBe(0);
    });

    it('should handle unexpected df output format', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'unexpected output',
        stderr: '',
      });

      const result = await validateDiskSpace();

      expect(result.sufficient).toBe(false);
    });
  });

  // ==========================================================================
  // validateEnvironment Tests (use command-based mocking for parallel)
  // ==========================================================================

  describe('validateEnvironment', () => {
    it('should return valid=true when all checks pass', async () => {
      const available = 150 * BYTES_PER_GB;
      mockExecAsync.mockImplementation(
        createCommandMock({
          'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
          'python3.11 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
          'which python3': { stdout: '/usr/bin/python3\n', stderr: '' },
          'import swebench': { stdout: '2.1.0\n', stderr: '' },
          'docker version': { stdout: '24.0.5\n', stderr: '' },
          'df -B1': {
            stdout: `/dev/sda1 500000000000 300000000000 ${String(available)} 50% /\n`,
            stderr: '',
          },
        })
      );

      const result = await validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.python.available).toBe(true);
      expect(result.swebench.installed).toBe(true);
      expect(result.docker.running).toBe(true);
      expect(result.diskSpace.sufficient).toBe(true);
    });

    it('should return valid=false with errors when Python missing', async () => {
      const available = 150 * BYTES_PER_GB;
      mockExecAsync.mockImplementation(
        createCommandMock({
          'python3 --version': new Error('not found'),
          'python3.11 --version': new Error('not found'),
          'python3.10 --version': new Error('not found'),
          'python --version': new Error('not found'),
          'import swebench': { stdout: '2.1.0\n', stderr: '' },
          'docker version': { stdout: '24.0.5\n', stderr: '' },
          'df -B1': {
            stdout: `/dev/sda1 500000000000 300000000000 ${String(available)} 50% /\n`,
            stderr: '',
          },
        })
      );

      const result = await validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Python 3.10 or 3.11 is required. Python 3.12+ is not supported by swebench.'
      );
    });

    it('should return valid=false with errors when Docker not running', async () => {
      const available = 150 * BYTES_PER_GB;
      mockExecAsync.mockImplementation(
        createCommandMock({
          'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
          'which python3': { stdout: '/usr/bin/python3\n', stderr: '' },
          'import swebench': { stdout: '2.1.0\n', stderr: '' },
          'docker version': new Error('not running'),
          'df -B1': {
            stdout: `/dev/sda1 500000000000 300000000000 ${String(available)} 50% /\n`,
            stderr: '',
          },
        })
      );

      const result = await validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Docker is not running. Start Docker daemon to run evaluations.'
      );
    });

    it('should include warning for low disk space but still be valid', async () => {
      const available = 50 * BYTES_PER_GB; // 50GB - below 120GB threshold
      mockExecAsync.mockImplementation(
        createCommandMock({
          'python3 --version': { stdout: 'Python 3.11.0\n', stderr: '' },
          'which python3': { stdout: '/usr/bin/python3\n', stderr: '' },
          'import swebench': { stdout: '2.1.0\n', stderr: '' },
          'docker version': { stdout: '24.0.5\n', stderr: '' },
          'df -B1': {
            stdout: `/dev/sda1 500000000000 450000000000 ${String(available)} 90% /\n`,
            stderr: '',
          },
        })
      );

      const result = await validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Low disk space');
    });

    it('should collect multiple errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('all fail'));

      const result = await validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // formatValidationResult Tests
  // ==========================================================================

  describe('formatValidationResult', () => {
    it('should format successful result', () => {
      const result: EnvironmentValidationResult = {
        valid: true,
        python: { available: true, version: '3.11.0', path: '/usr/bin/python3' },
        swebench: { installed: true, version: '2.1.0' },
        docker: { running: true, version: '24.0.5' },
        diskSpace: { available: 150 * BYTES_PER_GB, sufficient: true },
        errors: [],
        warnings: [],
      };

      const output = formatValidationResult(result);

      expect(output).toContain('SWE-bench Environment Validation');
      expect(output).toContain('[OK]');
      expect(output).toContain('3.11.0');
      expect(output).toContain('2.1.0');
      expect(output).toContain('24.0.5');
      expect(output).toContain('READY for SWE-bench evaluation');
    });

    it('should format failed result with errors', () => {
      const result: EnvironmentValidationResult = {
        valid: false,
        python: { available: false },
        swebench: { installed: true, version: '2.1.0' },
        docker: { running: false },
        diskSpace: { available: 50 * BYTES_PER_GB, sufficient: false },
        errors: ['Python not found', 'Docker not running'],
        warnings: ['Low disk space'],
      };

      const output = formatValidationResult(result);

      expect(output).toContain('[FAIL]');
      expect(output).toContain('[WARN]');
      expect(output).toContain('NOT READY');
      expect(output).toContain('Errors:');
      expect(output).toContain('Python not found');
      expect(output).toContain('Docker not running');
      expect(output).toContain('Warnings:');
      expect(output).toContain('Low disk space');
    });

    it('should handle missing optional fields', () => {
      const result: EnvironmentValidationResult = {
        valid: true,
        python: { available: true },
        swebench: { installed: true },
        docker: { running: true },
        diskSpace: { available: 150 * BYTES_PER_GB, sufficient: true },
        errors: [],
        warnings: [],
      };

      const output = formatValidationResult(result);

      expect(output).toContain('[OK]');
      expect(output).not.toContain('undefined');
    });
  });
});
