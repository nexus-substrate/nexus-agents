/**
 * Docker Sandbox Tests
 *
 * Tests the Docker sandbox module. Integration tests are skipped
 * when Docker is not available.
 *
 * @module workflows/self-development/docker-sandbox.test
 */

import { describe, it, expect } from 'vitest';
import { isDockerAvailable, executeSandboxed, SandboxError } from './docker-sandbox.js';

describe('docker-sandbox', () => {
  describe('SandboxError', () => {
    it('creates error with command details', () => {
      const error = new SandboxError('Test error', 'echo hello', 1, 'stderr output');

      expect(error.message).toBe('Test error');
      expect(error.command).toBe('echo hello');
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toBe('stderr output');
      expect(error.name).toBe('SandboxError');
    });

    it('handles optional fields', () => {
      const error = new SandboxError('Test error', 'echo');

      expect(error.message).toBe('Test error');
      expect(error.command).toBe('echo');
      expect(error.exitCode).toBeUndefined();
      expect(error.stderr).toBeUndefined();
    });
  });

  describe('isDockerAvailable', () => {
    it('returns boolean indicating Docker availability', async () => {
      const result = await isDockerAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // Integration tests - only run when Docker is available
  describe('executeSandboxed (integration)', () => {
    it('returns error when Docker is not available', async () => {
      const dockerAvailable = await isDockerAvailable();

      if (!dockerAvailable) {
        const result = await executeSandboxed('echo hello', { workDir: '/tmp' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('Docker is not available');
        }
      } else {
        // Skip this test when Docker IS available
        expect(true).toBe(true);
      }
    });

    it('executes simple command in container when Docker is available', async () => {
      const dockerAvailable = await isDockerAvailable();

      if (dockerAvailable) {
        const result = await executeSandboxed('echo hello', {
          workDir: '/tmp',
          timeoutMs: 30000,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.success).toBe(true);
          expect(result.value.stdout.trim()).toBe('hello');
        }
      } else {
        // Skip when Docker not available
        expect(true).toBe(true);
      }
    });

    it('captures exit code from failed commands', async () => {
      const dockerAvailable = await isDockerAvailable();

      if (dockerAvailable) {
        const result = await executeSandboxed('exit 42', {
          workDir: '/tmp',
          timeoutMs: 30000,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.success).toBe(false);
          expect(result.value.exitCode).toBe(42);
        }
      } else {
        expect(true).toBe(true);
      }
    });

    it('applies network isolation by default', async () => {
      const dockerAvailable = await isDockerAvailable();

      if (dockerAvailable) {
        // Try to ping - should fail with network disabled
        const result = await executeSandboxed('ping -c 1 8.8.8.8 2>&1 || echo "network disabled"', {
          workDir: '/tmp',
          timeoutMs: 10000,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.stdout).toContain('network disabled');
        }
      } else {
        expect(true).toBe(true);
      }
    });
  });
});
