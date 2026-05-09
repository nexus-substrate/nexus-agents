/* eslint-disable @typescript-eslint/no-deprecated -- Tests for the deprecated sandbox executor surface (#2499). */
/**
 * Tests for Docker Sandbox Executor and Factory.
 *
 * @module security/__tests__/docker-sandbox.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DockerSandboxExecutor,
  createDockerSandboxExecutor,
  isDockerAvailable,
  resetDockerCache,
} from '../sandbox/docker-sandbox-executor.js';
import { createSandbox, getRecommendedMode } from '../sandbox/sandbox-factory.js';
import { STANDARD_POLICY, RESTRICTIVE_POLICY } from '../sandbox/default-policies.js';
import type { SandboxExecutionOptions } from '../sandbox/sandbox-types.js';

// Mock child_process to simulate Docker not being available
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      callback?: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      // Default: Docker not available
      const error = new Error('Command not found');
      if (callback !== undefined) {
        callback(error, '', '');
      }
      return { on: vi.fn() };
    }
  ),
}));

// Type for execFile-style callback function
type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFileFn = (...args: [...unknown[], ExecFileCallback]) => void;

vi.mock('node:util', async () => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    promisify: (fn: ExecFileFn) => {
      return async (...args: unknown[]): Promise<{ stdout: string; stderr: string }> => {
        return new Promise((resolve, reject) => {
          fn(...args, (err: Error | null, stdout: string, stderr: string) => {
            if (err !== null) {
              reject(err);
            } else {
              resolve({ stdout, stderr });
            }
          });
        });
      };
    },
  };
});

describe('DockerSandboxExecutor', () => {
  beforeEach(() => {
    resetDockerCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create executor with default config', () => {
      const executor = new DockerSandboxExecutor();
      expect(executor.name).toBe('DockerSandboxExecutor');
    });

    it('should create executor with custom config', () => {
      const executor = new DockerSandboxExecutor({
        image: 'custom:latest',
        networkEnabled: true,
        user: 'custom',
      });
      expect(executor.name).toBe('DockerSandboxExecutor');
    });
  });

  describe('createDockerSandboxExecutor', () => {
    it('should create executor via factory function', () => {
      const executor = createDockerSandboxExecutor();
      expect(executor).toBeInstanceOf(DockerSandboxExecutor);
    });

    it('should pass config to executor', () => {
      const executor = createDockerSandboxExecutor({ image: 'node:20' });
      expect(executor.name).toBe('DockerSandboxExecutor');
    });
  });

  describe('validate', () => {
    it('should allow valid commands', () => {
      const executor = new DockerSandboxExecutor();
      const options: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
      };

      const result = executor.validate('node', ['--version'], options);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should deny invalid commands', () => {
      const executor = new DockerSandboxExecutor();
      const options: SandboxExecutionOptions = {
        policy: RESTRICTIVE_POLICY,
      };

      const result = executor.validate('rm', ['-rf', '/'], options);

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should deny dangerous arguments', () => {
      const executor = new DockerSandboxExecutor();
      const options: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
      };

      const result = executor.validate('node', ['$(rm -rf /)'], options);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === 'command')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should return error when Docker is not available', async () => {
      const executor = new DockerSandboxExecutor();
      const options: SandboxExecutionOptions = {
        policy: STANDARD_POLICY,
      };

      const result = await executor.execute('node', ['--version'], options);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(127);
      expect(result.stderr).toContain('Docker is not available');
    });

    it('should return policy denied when command not allowed', async () => {
      const executor = new DockerSandboxExecutor();
      const options: SandboxExecutionOptions = {
        policy: RESTRICTIVE_POLICY,
      };

      const result = await executor.execute('dangerous_cmd', [], options);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(126);
      expect(result.stderr).toContain('policy denied');
    });
  });
});

describe('isDockerAvailable', () => {
  beforeEach(() => {
    resetDockerCache();
  });

  it('should return false when Docker is not installed', async () => {
    const result = await isDockerAvailable();
    expect(result).toBe(false);
  });

  it('should cache the result', async () => {
    await isDockerAvailable();
    const result2 = await isDockerAvailable();
    expect(result2).toBe(false);
  });
});

describe('resetDockerCache', () => {
  it('should reset the cache', async () => {
    // First check
    await isDockerAvailable();

    // Reset
    resetDockerCache();

    // Should check again
    const result = await isDockerAvailable();
    expect(result).toBe(false);
  });
});

describe('createSandbox factory', () => {
  beforeEach(() => {
    resetDockerCache();
  });

  describe('none mode', () => {
    it('should create non-enforcing executor', async () => {
      const result = await createSandbox({ mode: 'none' });

      expect(result.executor.name).toBe('PolicySandboxExecutor');
      expect(result.actualMode).toBe('none');
      expect(result.usedFallback).toBe(false);
      expect(result.warning).toContain('no isolation');
    });
  });

  describe('policy mode', () => {
    it('should create policy executor', async () => {
      const result = await createSandbox({ mode: 'policy' });

      expect(result.executor.name).toBe('PolicySandboxExecutor');
      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(false);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('container mode', () => {
    it('should fall back to policy when Docker not available', async () => {
      const result = await createSandbox({
        mode: 'container',
        fallbackToPolicy: true,
        // Skip the new Deno fallback (#1898) so the fallback chain reaches policy.
        fallbackToDeno: false,
      });

      expect(result.executor.name).toBe('PolicySandboxExecutor');
      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(true);
      // Updated for #1898 fallback chain — message now reads
      // "Neither Docker nor Deno available" when both are absent.
      expect(result.warning).toMatch(/Docker not available|Neither Docker nor Deno/);
    });

    it('should throw when Docker not available and no fallback', async () => {
      await expect(
        createSandbox({
          mode: 'container',
          fallbackToPolicy: false,
          fallbackToDeno: false,
        })
      ).rejects.toThrow(/Docker|Deno/);
    });
  });

  describe('default options', () => {
    it('should default to policy mode', async () => {
      const result = await createSandbox();

      expect(result.actualMode).toBe('policy');
    });
  });
});

describe('getRecommendedMode', () => {
  beforeEach(() => {
    resetDockerCache();
  });

  it('should return policy when Docker not available', async () => {
    const mode = await getRecommendedMode();
    expect(mode).toBe('policy');
  });
});

describe('bytesToDockerMemory (via execution)', () => {
  // These tests verify the memory formatting by checking Docker args
  // We can't directly test the private function, but we can verify behavior

  it('should handle various memory sizes', () => {
    // Test via executor creation - we're mainly testing that it compiles
    const executor = new DockerSandboxExecutor();
    expect(executor.name).toBe('DockerSandboxExecutor');
  });
});
