/**
 * Sandbox Factory Tests
 *
 * Tests for the sandbox factory pattern.
 * Verifies mode selection, fallback behavior, and executor creation.
 *
 * @module security/sandbox/__tests__/sandbox-factory.test
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSandbox, getRecommendedMode } from '../sandbox-factory.js';
import * as dockerHelpers from '../docker-sandbox-helpers.js';

// Mock Docker availability check
vi.mock('../docker-sandbox-helpers.js', async () => {
  const actual = await vi.importActual('../docker-sandbox-helpers.js');
  return {
    ...actual,
    isDockerAvailable: vi.fn(),
  };
});

const mockIsDockerAvailable = vi.mocked(dockerHelpers.isDockerAvailable);

describe('Sandbox Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSandbox', () => {
    describe('policy mode', () => {
      it('should create PolicySandboxExecutor for policy mode', async () => {
        const result = await createSandbox({ mode: 'policy' });

        expect(result.executor.name).toBe('PolicySandboxExecutor');
        expect(result.actualMode).toBe('policy');
        expect(result.usedFallback).toBe(false);
        expect(result.warning).toBeUndefined();
      });

      it('should pass policyConfig to executor', async () => {
        const result = await createSandbox({
          mode: 'policy',
          policyConfig: {
            enforce: false,
            logViolations: true,
          },
        });

        expect(result.executor.name).toBe('PolicySandboxExecutor');
      });
    });

    describe('none mode', () => {
      it('should create non-enforcing executor for none mode', async () => {
        const result = await createSandbox({ mode: 'none' });

        expect(result.executor.name).toBe('PolicySandboxExecutor');
        expect(result.actualMode).toBe('none');
        expect(result.usedFallback).toBe(false);
        expect(result.warning).toContain('no isolation');
      });
    });

    describe('container mode', () => {
      it('should create DockerSandboxExecutor when Docker available', async () => {
        mockIsDockerAvailable.mockResolvedValue(true);

        const result = await createSandbox({ mode: 'container' });

        expect(result.executor.name).toBe('DockerSandboxExecutor');
        expect(result.actualMode).toBe('container');
        expect(result.usedFallback).toBe(false);
      });

      it('should fall back to policy when Docker unavailable and fallback enabled', async () => {
        mockIsDockerAvailable.mockResolvedValue(false);

        const result = await createSandbox({
          mode: 'container',
          fallbackToPolicy: true,
        });

        expect(result.executor.name).toBe('PolicySandboxExecutor');
        expect(result.actualMode).toBe('policy');
        expect(result.usedFallback).toBe(true);
        expect(result.warning).toContain('Docker not available');
      });

      it('should throw when Docker unavailable and fallback disabled', async () => {
        mockIsDockerAvailable.mockResolvedValue(false);

        await expect(
          createSandbox({
            mode: 'container',
            fallbackToPolicy: false,
          })
        ).rejects.toThrow('Docker is not available');
      });

      it('should pass dockerConfig to executor', async () => {
        mockIsDockerAvailable.mockResolvedValue(true);

        const result = await createSandbox({
          mode: 'container',
          dockerConfig: {
            image: 'node:20-alpine',
            networkEnabled: true,
            user: 'nobody',
          },
        });

        expect(result.executor.name).toBe('DockerSandboxExecutor');
      });
    });

    describe('default options', () => {
      it('should use policy mode by default', async () => {
        const result = await createSandbox();

        expect(result.actualMode).toBe('policy');
      });

      it('should enable fallback by default', async () => {
        mockIsDockerAvailable.mockResolvedValue(false);

        const result = await createSandbox({ mode: 'container' });

        expect(result.usedFallback).toBe(true);
        expect(result.actualMode).toBe('policy');
      });
    });

    describe('error handling', () => {
      it('should throw for unknown mode', async () => {
        // TypeScript would normally catch this, but test runtime behavior
        await expect(createSandbox({ mode: 'invalid' as 'policy' })).rejects.toThrow(
          'Unknown sandbox mode'
        );
      });
    });
  });

  describe('getRecommendedMode', () => {
    it('should recommend container when Docker available', async () => {
      mockIsDockerAvailable.mockResolvedValue(true);

      const mode = await getRecommendedMode();

      expect(mode).toBe('container');
    });

    it('should recommend policy when Docker unavailable', async () => {
      mockIsDockerAvailable.mockResolvedValue(false);

      const mode = await getRecommendedMode();

      expect(mode).toBe('policy');
    });
  });

  describe('factory pattern', () => {
    it('should create different executor types based on mode', async () => {
      mockIsDockerAvailable.mockResolvedValue(true);

      const policyResult = await createSandbox({ mode: 'policy' });
      const containerResult = await createSandbox({ mode: 'container' });
      const noneResult = await createSandbox({ mode: 'none' });

      expect(policyResult.executor.name).toBe('PolicySandboxExecutor');
      expect(containerResult.executor.name).toBe('DockerSandboxExecutor');
      expect(noneResult.executor.name).toBe('PolicySandboxExecutor');
    });

    it('should create independent instances', async () => {
      const result1 = await createSandbox({ mode: 'policy' });
      const result2 = await createSandbox({ mode: 'policy' });

      expect(result1.executor).not.toBe(result2.executor);
    });
  });

  describe('ISandboxExecutor interface compliance', () => {
    it('should return executor with name property', async () => {
      const result = await createSandbox({ mode: 'policy' });

      expect(typeof result.executor.name).toBe('string');
      expect(result.executor.name.length).toBeGreaterThan(0);
    });

    it('should return executor with execute method', async () => {
      const result = await createSandbox({ mode: 'policy' });

      expect(typeof result.executor.execute).toBe('function');
    });

    it('should return executor with validate method', async () => {
      const result = await createSandbox({ mode: 'policy' });

      expect(typeof result.executor.validate).toBe('function');
    });
  });

  describe('SandboxCreationResult structure', () => {
    it('should include all required fields', async () => {
      const result = await createSandbox({ mode: 'policy' });

      expect(result).toHaveProperty('executor');
      expect(result).toHaveProperty('actualMode');
      expect(result).toHaveProperty('usedFallback');
    });

    it('should include warning when fallback used', async () => {
      mockIsDockerAvailable.mockResolvedValue(false);

      const result = await createSandbox({ mode: 'container' });

      expect(result.warning).toBeDefined();
      expect(typeof result.warning).toBe('string');
    });

    it('should not include warning when no fallback', async () => {
      mockIsDockerAvailable.mockResolvedValue(true);

      const result = await createSandbox({ mode: 'container' });

      expect(result.warning).toBeUndefined();
    });
  });
});

describe('Integration scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('development environment', () => {
    it('should work with none mode for development', async () => {
      const result = await createSandbox({ mode: 'none' });

      expect(result.actualMode).toBe('none');
      expect(result.warning).toContain('no isolation');
    });
  });

  describe('CI/CD environment', () => {
    it('should work with policy mode for CI without Docker', async () => {
      mockIsDockerAvailable.mockResolvedValue(false);

      const result = await createSandbox({ mode: 'policy' });

      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(false);
    });

    it('should work with container mode for CI with Docker', async () => {
      mockIsDockerAvailable.mockResolvedValue(true);

      const result = await createSandbox({ mode: 'container' });

      expect(result.actualMode).toBe('container');
      expect(result.usedFallback).toBe(false);
    });
  });

  describe('production environment', () => {
    it('should use container mode when available', async () => {
      mockIsDockerAvailable.mockResolvedValue(true);

      const mode = await getRecommendedMode();
      const result = await createSandbox({ mode });

      expect(result.actualMode).toBe('container');
    });

    it('should fall back gracefully when Docker unavailable', async () => {
      mockIsDockerAvailable.mockResolvedValue(false);

      const result = await createSandbox({
        mode: 'container',
        fallbackToPolicy: true,
      });

      expect(result.actualMode).toBe('policy');
      expect(result.usedFallback).toBe(true);
    });
  });
});
