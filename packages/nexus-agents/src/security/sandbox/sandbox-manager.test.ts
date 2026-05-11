/**
 * Tests for sandbox-manager.ts
 *
 * Covers SandboxManager: initialization, singleton management, mode tracking,
 * fallback handling, and reset functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeSandbox,
  getSandboxExecutor,
  getSandboxExecutorOrNull,
  isSandboxInitialized,
  getSandboxMode,
  resetSandboxManager,
  type SandboxManagerConfig,
} from './sandbox-manager.js';
import * as sandboxFactory from './sandbox-factory.js';
import type { ISandboxExecutor, SandboxResult, PolicyEvaluation } from './sandbox-types.js';

// ============================================================================
// Mocks & Fixtures
// ============================================================================

vi.mock('./sandbox-factory.js', () => ({ createSandbox: vi.fn() }));
vi.mock('../../core/index.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockExecutor(name: string) {
  const mockPolicyEval: PolicyEvaluation = {
    allowed: true,
    policyId: 'test-policy',
    violations: [],
  };
  return {
    name,
    execute: vi.fn(() =>
      Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: 'test output',
        stderr: '',
        durationMs: 100,
        resourceUsage: {
          memoryBytes: 1024,
          cpuTimeMs: 50,
          processCount: 1,
          outputBytes: 100,
          wallTimeMs: 100,
        },
        policyEvaluation: mockPolicyEval,
      } as SandboxResult)
    ),
    validate: vi.fn(() => mockPolicyEval),
  } as ISandboxExecutor;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeConfig(overrides: Partial<SandboxManagerConfig> = {}) {
  return { mode: 'policy' as const, fallbackToPolicy: true, networkEnabled: false, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSandboxManager();
});
afterEach(() => {
  resetSandboxManager();
});

// ============================================================================
// initializeSandbox
// ============================================================================

describe('initializeSandbox', () => {
  it('initializes sandbox with default config', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });

    const result = await initializeSandbox();

    expect(sandboxFactory.createSandbox).toHaveBeenCalledWith({
      mode: 'policy',
      fallbackToPolicy: true,
    });
    expect(result.executor).toBe(mockExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(false);
  });

  it('forwards the requested mode to the factory', async () => {
    // Post-#2551 the deprecated Docker/Deno modes resolve to policy
    // mode inside the factory; the manager still forwards them through.
    // `dockerImage` / `networkEnabled` are accepted on the config for
    // back-compat but no longer reach the factory.
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: true,
      warning: 'Sandbox mode "container" is no longer supported.',
    });

    const result = await initializeSandbox(
      makeConfig({ mode: 'container', dockerImage: 'custom:latest', networkEnabled: true })
    );

    expect(sandboxFactory.createSandbox).toHaveBeenCalledWith({
      mode: 'container',
      fallbackToPolicy: true,
    });
    expect(result.executor).toBe(mockExecutor);
    expect(result.actualMode).toBe('policy');
  });

  it('returns existing sandbox on subsequent calls', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });

    await initializeSandbox();
    const result2 = await initializeSandbox();

    expect(sandboxFactory.createSandbox).toHaveBeenCalledTimes(1);
    expect(result2.executor).toBe(mockExecutor);
  });

  it('handles fallback with warning', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    const warning = 'Sandbox mode "container" is no longer supported.';
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: true,
      warning,
    });

    const result = await initializeSandbox({ mode: 'container' });
    expect(result.usedFallback).toBe(true);
    expect(result.warning).toBe(warning);
  });

  it('preserves warning on subsequent calls', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    const warning = 'Sandbox mode "container" is no longer supported.';
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: true,
      warning,
    });

    await initializeSandbox({ mode: 'container' });
    const result2 = await initializeSandbox();

    expect(result2.warning).toBe(warning);
    expect(result2.usedFallback).toBe(true);
  });
});

// ============================================================================
// getSandboxExecutor
// ============================================================================

describe('getSandboxExecutor', () => {
  it('throws if sandbox not initialized', () => {
    expect(() => getSandboxExecutor()).toThrow('Sandbox not initialized');
  });

  it('returns executor after initialization', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    await initializeSandbox();
    expect(getSandboxExecutor()).toBe(mockExecutor);
  });
});

// ============================================================================
// getSandboxExecutorOrNull
// ============================================================================

describe('getSandboxExecutorOrNull', () => {
  it('returns null if not initialized', () => {
    expect(getSandboxExecutorOrNull()).toBeNull();
  });

  it('returns executor after initialization', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    await initializeSandbox();
    expect(getSandboxExecutorOrNull()).toBe(mockExecutor);
  });
});

// ============================================================================
// isSandboxInitialized
// ============================================================================

describe('isSandboxInitialized', () => {
  it('returns false before initialization', () => {
    expect(isSandboxInitialized()).toBe(false);
  });

  it('returns true after initialization', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    await initializeSandbox();
    expect(isSandboxInitialized()).toBe(true);
  });

  it('returns false after reset', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    await initializeSandbox();
    resetSandboxManager();
    expect(isSandboxInitialized()).toBe(false);
  });
});

// ============================================================================
// getSandboxMode
// ============================================================================

describe('getSandboxMode', () => {
  it('returns default mode before initialization', () => {
    expect(getSandboxMode()).toBe('policy');
  });

  it('returns actual mode after initialization', async () => {
    const mockExecutor = createMockExecutor('DockerSandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'container',
      usedFallback: false,
    });
    await initializeSandbox({ mode: 'container' });
    expect(getSandboxMode()).toBe('container');
  });

  it('returns fallback mode when fallback used', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: true,
      warning: 'Docker not available',
    });
    await initializeSandbox({ mode: 'container' });
    expect(getSandboxMode()).toBe('policy');
  });

  it('returns default mode after reset', async () => {
    const mockExecutor = createMockExecutor('DockerSandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'container',
      usedFallback: false,
    });
    await initializeSandbox({ mode: 'container' });
    resetSandboxManager();
    expect(getSandboxMode()).toBe('policy');
  });
});

// ============================================================================
// resetSandboxManager
// ============================================================================

describe('resetSandboxManager', () => {
  it('clears all state', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    await initializeSandbox();
    resetSandboxManager();
    expect(isSandboxInitialized()).toBe(false);
    expect(getSandboxExecutorOrNull()).toBeNull();
    expect(getSandboxMode()).toBe('policy');
  });

  it('allows re-initialization after reset', async () => {
    const mockExecutor1 = createMockExecutor('PolicySandboxExecutor');
    const mockExecutor2 = createMockExecutor('DockerSandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox)
      .mockResolvedValueOnce({ executor: mockExecutor1, actualMode: 'policy', usedFallback: false })
      .mockResolvedValueOnce({
        executor: mockExecutor2,
        actualMode: 'container',
        usedFallback: false,
      });
    await initializeSandbox({ mode: 'policy' });
    resetSandboxManager();
    await initializeSandbox({ mode: 'container' });
    expect(getSandboxExecutor()).toBe(mockExecutor2);
    expect(getSandboxMode()).toBe('container');
  });

  it('clears warning state', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: true,
      warning: 'Docker not available',
    });
    const result1 = await initializeSandbox({ mode: 'container' });
    expect(result1.warning).toBeDefined();
    resetSandboxManager();
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    const result2 = await initializeSandbox({ mode: 'policy' });
    expect(result2.warning).toBeUndefined();
  });
});

describe('sandbox-manager integration', () => {
  it('handles none mode initialization', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'none',
      usedFallback: false,
      warning: 'No isolation',
    });
    const result = await initializeSandbox({ mode: 'none' });
    expect(result.actualMode).toBe('none');
    expect(result.warning).toBeDefined();
  });

  it('sequential initialization calls reuse same executor', async () => {
    const mockExecutor = createMockExecutor('PolicySandboxExecutor');
    vi.mocked(sandboxFactory.createSandbox).mockResolvedValue({
      executor: mockExecutor,
      actualMode: 'policy',
      usedFallback: false,
    });
    const result1 = await initializeSandbox();
    const result2 = await initializeSandbox();
    const result3 = await initializeSandbox();
    expect(sandboxFactory.createSandbox).toHaveBeenCalledTimes(1);
    expect(result1.executor).toBe(result2.executor);
    expect(result2.executor).toBe(result3.executor);
  });
});
