/* eslint-disable @typescript-eslint/no-deprecated -- Tests for the
 * deprecated DockerSandboxExecutor (#2499). */
/**
 * Tests for docker-sandbox-executor.ts
 *
 * Covers DockerSandboxExecutor: Docker command construction, execution,
 * resource limits, volume mounts, environment variables, cleanup, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STANDARD_POLICY } from './default-policies.js';
import type { SandboxExecutionOptions } from './sandbox-types.js';

// ============================================================================
// Mocks
// ============================================================================

const { mockExecFile, mockIsDockerAvailable } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockIsDockerAvailable: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('./docker-sandbox-helpers.js', async () => {
  const actual = await vi.importActual<typeof import('./docker-sandbox-helpers.js')>(
    './docker-sandbox-helpers.js'
  );
  return {
    ...actual,
    isDockerAvailable: mockIsDockerAvailable,
  };
});

import { DockerSandboxExecutor, createDockerSandboxExecutor } from './docker-sandbox-executor.js';
import { resetDockerCache } from './docker-sandbox-helpers.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOptions(overrides: Partial<SandboxExecutionOptions> = {}) {
  return {
    policy: STANDARD_POLICY,
    cwd: '/workspace',
    ...overrides,
  } as SandboxExecutionOptions;
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  resetDockerCache();
  mockIsDockerAvailable.mockResolvedValue(true);

  // Default mock implementation for execFile
  mockExecFile.mockImplementation((_, __, ___, callback) => {
    (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
      stdout: '',
      stderr: '',
    });
    return undefined as never;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// createDockerSandboxExecutor factory
// ============================================================================

describe('createDockerSandboxExecutor', () => {
  it('creates a DockerSandboxExecutor instance', () => {
    const executor = createDockerSandboxExecutor();
    expect(executor).toBeInstanceOf(DockerSandboxExecutor);
    expect(executor.name).toBe('DockerSandboxExecutor');
  });

  it('accepts custom config with image', () => {
    const executor = createDockerSandboxExecutor({ image: 'node:18-alpine' });
    expect(executor).toBeInstanceOf(DockerSandboxExecutor);
  });

  it('accepts custom config with network enabled', () => {
    const executor = createDockerSandboxExecutor({ networkEnabled: true });
    expect(executor).toBeInstanceOf(DockerSandboxExecutor);
  });

  it('accepts custom config with volumes', () => {
    const executor = createDockerSandboxExecutor({
      volumes: ['/host:/container:ro'],
    });
    expect(executor).toBeInstanceOf(DockerSandboxExecutor);
  });
});

// ============================================================================
// DockerSandboxExecutor.validate
// ============================================================================

describe('DockerSandboxExecutor - validate', () => {
  const executor = new DockerSandboxExecutor();

  it('allows commands in the allowlist', () => {
    const opts = makeOptions();
    const result = executor.validate('ls', [], opts);
    expect(result.allowed).toBe(true);
    expect(result.policyId).toBe(STANDARD_POLICY.id);
    expect(result.violations).toEqual([]);
  });

  it('denies commands not in the allowlist', () => {
    const opts = makeOptions();
    const result = executor.validate('rm', ['-rf', '/'], opts);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.reason).toBeDefined();
  });

  it('denies dangerous arguments', () => {
    const opts = makeOptions();
    const result = executor.validate('ls', ['$(rm -rf /)'], opts);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('returns multiple violations when applicable', () => {
    const opts = makeOptions();
    const result = executor.validate('curl', ['$(evil)'], opts);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// DockerSandboxExecutor.execute - denied
// ============================================================================

describe('DockerSandboxExecutor - execute denied', () => {
  it('returns failure for denied command without executing Docker', async () => {
    const executor = new DockerSandboxExecutor();

    const result = await executor.execute('rm', ['-rf', '/'], makeOptions());

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain('denied');
    expect(result.policyEvaluation?.allowed).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('records policy evaluation for denied command', async () => {
    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('curl', ['http://evil.com'], makeOptions());

    expect(result.policyEvaluation).toBeDefined();
    expect(result.policyEvaluation?.allowed).toBe(false);
    expect(result.policyEvaluation?.violations.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DockerSandboxExecutor.execute - Docker unavailable
// ============================================================================

describe('DockerSandboxExecutor - Docker unavailable', () => {
  it('returns failure when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValue(false);

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('ls', [], makeOptions());

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('Docker is not available');
  });
});

// ============================================================================
// DockerSandboxExecutor.execute - success
// ============================================================================

describe('DockerSandboxExecutor - execute success', () => {
  it('executes allowed commands successfully', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: 'hello\n',
        stderr: '',
      });
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('echo', ['hello'], makeOptions());

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('');
    expect(result.resourceUsage).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('constructs Docker command with resource limits', async () => {
    const executor = new DockerSandboxExecutor();
    await executor.execute('ls', [], makeOptions());

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--memory=512m', '--cpus=2']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('disables network by default', async () => {
    const executor = new DockerSandboxExecutor();
    await executor.execute('ls', [], makeOptions());

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--network=none']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('enables network when configured', async () => {
    const executor = new DockerSandboxExecutor({ networkEnabled: true });
    await executor.execute('curl', ['http://example.com'], makeOptions());

    const calls = mockExecFile.mock.calls;
    const dockerArgs = (calls[0]?.[1] as string[]) ?? [];
    expect(dockerArgs.includes('--network=none')).toBe(false);
  });

  it('mounts working directory as volume', async () => {
    const executor = new DockerSandboxExecutor();
    await executor.execute('ls', [], makeOptions({ cwd: '/tmp/test' }));

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['-v=/tmp/test:/workspace:rw', '-w=/workspace']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('adds custom volume mounts', async () => {
    const executor = new DockerSandboxExecutor({
      volumes: ['/host/data:/data:ro', '/host/logs:/logs:rw'],
    });
    await executor.execute('ls', [], makeOptions());

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['-v=/host/data:/data:ro', '-v=/host/logs:/logs:rw']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('includes allowed environment variables', async () => {
    const executor = new DockerSandboxExecutor();
    const opts = makeOptions({
      env: { NODE_ENV: 'test', CUSTOM_VAR: 'value', BLOCKED: 'secret' },
      policy: {
        ...STANDARD_POLICY,
        allowedEnvVars: ['NODE_ENV', 'CUSTOM_VAR'],
      },
    });

    await executor.execute('node', ['-v'], opts);

    const calls = mockExecFile.mock.calls;
    const dockerArgs = calls[0]?.[1] as string[];
    expect(dockerArgs).toContain('-e=NODE_ENV=test');
    expect(dockerArgs).toContain('-e=CUSTOM_VAR=value');
    expect(dockerArgs.some((arg) => arg.includes('BLOCKED'))).toBe(false);
  });

  it('uses custom Docker image', async () => {
    const executor = new DockerSandboxExecutor({ image: 'node:18-alpine' });
    await executor.execute('node', ['-v'], makeOptions());

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['node:18-alpine']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('uses custom user', async () => {
    const executor = new DockerSandboxExecutor({ user: 'nobody' });
    await executor.execute('ls', [], makeOptions());

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--user=nobody']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('applies security hardening flags', async () => {
    const executor = new DockerSandboxExecutor();
    await executor.execute('ls', [], makeOptions());

    const calls = mockExecFile.mock.calls;
    const dockerArgs = calls[0]?.[1] as string[];
    expect(dockerArgs).toContain('--cap-drop=ALL');
    expect(dockerArgs).toContain('--read-only');
    expect(dockerArgs.some((arg) => arg.startsWith('--tmpfs=/tmp:'))).toBe(true);
  });
});

// ============================================================================
// DockerSandboxExecutor.execute - error handling
// ============================================================================

describe('DockerSandboxExecutor - error handling', () => {
  it('handles command execution failure', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
        stdout: '',
        stderr: 'command not found',
      });
      (callback as (err: unknown) => void)(error);
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('ls', ['nonexistent'], makeOptions());

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('command not found');
  });

  it('handles timeout errors', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      const error = Object.assign(new Error('Timeout'), {
        killed: true,
        stdout: '',
        stderr: '',
      });
      (callback as (err: NodeJS.ErrnoException) => void)(error);
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('sleep', ['100'], makeOptions());

    expect(result.success).toBe(false);
    expect(result.resourceUsage).toBeDefined();
  });

  it('truncates large stdout output', async () => {
    const largeOutput = 'x'.repeat(2 * 1024 * 1024); // 2MB
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: largeOutput,
        stderr: '',
      });
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('echo', ['data'], makeOptions());

    expect(result.success).toBe(true);
    // Truncation adds info text, so result is slightly larger than MAX_OUTPUT_SIZE
    expect(result.stdout.length).toBeLessThan(1.1 * 1024 * 1024); // 10% tolerance
    expect(result.stdout).toContain('truncated');
  });

  it('captures stderr on failure', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      const error = Object.assign(new Error('Failed'), {
        code: 2,
        stdout: '',
        stderr: 'File not found',
      });
      (callback as (err: unknown) => void)(error);
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('ls', ['missing'], makeOptions());

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('File not found');
  });
});

// ============================================================================
// DockerSandboxExecutor - resource usage tracking
// ============================================================================

describe('DockerSandboxExecutor - resource usage', () => {
  it('records output bytes', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: 'test output',
        stderr: '',
      });
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('echo', ['test'], makeOptions());

    expect(result.resourceUsage.outputBytes).toBeGreaterThan(0);
    expect(result.resourceUsage.processCount).toBe(1);
  });

  it('records wall time', async () => {
    mockExecFile.mockImplementation((_, __, ___, callback) => {
      setTimeout(() => {
        (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
          stdout: '',
          stderr: '',
        });
      }, 10);
      return undefined as never;
    });

    const executor = new DockerSandboxExecutor();
    const result = await executor.execute('sleep', ['0.01'], makeOptions());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.resourceUsage.wallTimeMs).toBeGreaterThanOrEqual(0);
  });
});
