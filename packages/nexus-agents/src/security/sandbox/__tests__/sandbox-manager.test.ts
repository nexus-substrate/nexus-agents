/**
 * Sandbox Manager Tests
 *
 * Tests for the global sandbox manager singleton.
 * Verifies initialization, mode selection, and fallback behavior.
 *
 * @module security/sandbox/__tests__/sandbox-manager.test
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeSandbox,
  getSandboxExecutor,
  getSandboxExecutorOrNull,
  isSandboxInitialized,
  getSandboxMode,
  resetSandboxManager,
} from '../sandbox-manager.js';
import * as factory from '../sandbox-factory.js';

// Mock the sandbox factory
vi.mock('../sandbox-factory.js', () => ({
  createSandbox: vi.fn(),
}));

const mockCreateSandbox = vi.mocked(factory.createSandbox);

describe('Sandbox Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSandboxManager();
  });

  afterEach(() => {
    resetSandboxManager();
  });

  describe('initializeSandbox', () => {
    it('should initialize with policy mode by default', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: false,
      });

      const result = await initializeSandbox();

      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(false);
      expect(result.executor.name).toBe('PolicySandboxExecutor');
    });

    it('should initialize with container mode when requested', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'DockerSandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'container',
        usedFallback: false,
      });

      const result = await initializeSandbox({ mode: 'container' });

      expect(result.actualMode).toBe('container');
      expect(result.executor.name).toBe('DockerSandboxExecutor');
    });

    it('should fall back to policy mode when Docker unavailable', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: true,
        warning: 'Docker not available. Using policy-based sandbox with limited isolation.',
      });

      const result = await initializeSandbox({
        mode: 'container',
        fallbackToPolicy: true,
      });

      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(true);
      expect(result.warning).toContain('Docker not available');
    });

    it('should return cached result on subsequent calls', async () => {
      const mockExecutor = {
        name: 'PolicySandboxExecutor',
        execute: vi.fn(),
        validate: vi.fn(),
      };

      mockCreateSandbox.mockResolvedValue({
        executor: mockExecutor,
        actualMode: 'policy',
        usedFallback: false,
      });

      // First call
      await initializeSandbox();

      // Second call
      const result2 = await initializeSandbox();

      // Factory should only be called once
      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
      expect(result2.executor).toBe(mockExecutor);
    });

    it('passes the requested mode to the factory (container falls back to policy post-#2551)', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: true,
        warning: 'Sandbox mode "container" is no longer supported; using "policy" mode.',
      });

      // Operators may still pass dockerImage/networkEnabled in their config
      // (the schema accepts them for back-compat); the manager ignores them
      // post-#2551 since the Docker executor was deleted.
      await initializeSandbox({
        mode: 'container',
        dockerImage: 'node:20-alpine',
        networkEnabled: true,
      });

      expect(mockCreateSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'container',
          fallbackToPolicy: true,
        })
      );
    });

    it('should handle none mode', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'none',
        usedFallback: false,
        warning: 'Sandbox mode "none" provides no isolation. Use only for development.',
      });

      const result = await initializeSandbox({ mode: 'none' });

      expect(result.actualMode).toBe('none');
      expect(result.warning).toContain('no isolation');
    });
  });

  describe('getSandboxExecutor', () => {
    it('should return executor after initialization', async () => {
      const mockExecutor = {
        name: 'PolicySandboxExecutor',
        execute: vi.fn(),
        validate: vi.fn(),
      };

      mockCreateSandbox.mockResolvedValue({
        executor: mockExecutor,
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox();
      const executor = getSandboxExecutor();

      expect(executor).toBe(mockExecutor);
    });

    it('should throw if not initialized', () => {
      expect(() => getSandboxExecutor()).toThrow('Sandbox not initialized');
    });
  });

  describe('getSandboxExecutorOrNull', () => {
    it('should return executor after initialization', async () => {
      const mockExecutor = {
        name: 'PolicySandboxExecutor',
        execute: vi.fn(),
        validate: vi.fn(),
      };

      mockCreateSandbox.mockResolvedValue({
        executor: mockExecutor,
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox();
      const executor = getSandboxExecutorOrNull();

      expect(executor).toBe(mockExecutor);
    });

    it('should return null if not initialized', () => {
      const executor = getSandboxExecutorOrNull();

      expect(executor).toBeNull();
    });
  });

  describe('isSandboxInitialized', () => {
    it('should return false before initialization', () => {
      expect(isSandboxInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox();

      expect(isSandboxInitialized()).toBe(true);
    });
  });

  describe('getSandboxMode', () => {
    it('should return policy by default before initialization', () => {
      expect(getSandboxMode()).toBe('policy');
    });

    it('should return actual mode after initialization', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'DockerSandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'container',
        usedFallback: false,
      });

      await initializeSandbox({ mode: 'container' });

      expect(getSandboxMode()).toBe('container');
    });

    it('should return fallback mode when fallback occurred', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: true,
      });

      await initializeSandbox({ mode: 'container' });

      expect(getSandboxMode()).toBe('policy');
    });
  });

  describe('resetSandboxManager', () => {
    it('should reset initialized state', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox();
      expect(isSandboxInitialized()).toBe(true);

      resetSandboxManager();

      expect(isSandboxInitialized()).toBe(false);
      expect(getSandboxExecutorOrNull()).toBeNull();
    });

    it('should reset mode to default', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'DockerSandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'container',
        usedFallback: false,
      });

      await initializeSandbox({ mode: 'container' });
      expect(getSandboxMode()).toBe('container');

      resetSandboxManager();

      expect(getSandboxMode()).toBe('policy');
    });

    it('should allow re-initialization after reset', async () => {
      const executor1 = {
        name: 'Executor1',
        execute: vi.fn(),
        validate: vi.fn(),
      };

      const executor2 = {
        name: 'Executor2',
        execute: vi.fn(),
        validate: vi.fn(),
      };

      mockCreateSandbox
        .mockResolvedValueOnce({
          executor: executor1,
          actualMode: 'policy',
          usedFallback: false,
        })
        .mockResolvedValueOnce({
          executor: executor2,
          actualMode: 'container',
          usedFallback: false,
        });

      await initializeSandbox({ mode: 'policy' });
      expect(getSandboxExecutor().name).toBe('Executor1');

      resetSandboxManager();

      await initializeSandbox({ mode: 'container' });
      expect(getSandboxExecutor().name).toBe('Executor2');
    });
  });

  describe('configuration handling', () => {
    it('should use default fallbackToPolicy as true', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox();

      expect(mockCreateSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackToPolicy: true,
        })
      );
    });

    it('should respect fallbackToPolicy: false', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: false,
      });

      await initializeSandbox({ fallbackToPolicy: false });

      expect(mockCreateSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackToPolicy: false,
        })
      );
    });
  });

  describe('warning handling', () => {
    it('should preserve warning in cached result', async () => {
      mockCreateSandbox.mockResolvedValue({
        executor: {
          name: 'PolicySandboxExecutor',
          execute: vi.fn(),
          validate: vi.fn(),
        },
        actualMode: 'policy',
        usedFallback: true,
        warning: 'Test warning',
      });

      const result1 = await initializeSandbox({ mode: 'container' });
      const result2 = await initializeSandbox(); // Cached

      expect(result1.warning).toBe('Test warning');
      expect(result2.warning).toBe('Test warning');
      expect(result2.usedFallback).toBe(true);
    });
  });
});
