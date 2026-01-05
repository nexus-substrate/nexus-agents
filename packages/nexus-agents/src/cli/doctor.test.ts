/**
 * Tests for Doctor Command
 *
 * Verifies health check functionality for CLI adapters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDoctor, printDoctorResults, doctorCommand } from './doctor.js';
import type { DoctorResult } from './doctor.js';

// Mock the factory module
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: vi.fn(),
}));

import { createAllAdapters } from '../cli-adapters/factory.js';

describe('Doctor Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runDoctor()', () => {
    it('should return healthy result when all CLIs are available', async () => {
      const mockAdapter = {
        name: 'claude',
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          exhausted: false,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(true);
      expect(result.mcpServerReady).toBe(true);
      expect(result.mcpClientReady).toBe(true);
      expect(result.clis).toHaveLength(3);
    });

    it('should mark CLI as not installed when adapter throws ENOENT', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockRejectedValue(new Error('spawn claude ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockRejectedValue(new Error('not found')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('some other error')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(false);
      expect(result.clis[0]?.installed).toBe(false);
      expect(result.clis[0]?.error).toBe('Not found in PATH');
      expect(result.clis[1]?.installed).toBe(false);
      expect(result.clis[1]?.error).toBe('Not found in PATH');
      expect(result.clis[2]?.installed).toBe(false);
      expect(result.clis[2]?.error).toBe('some other error');
    });

    it('should handle missing adapter gracefully', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
        // gemini and codex are missing
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.allHealthy).toBe(false);
      const geminiResult = result.clis.find((c) => c.name === 'gemini');
      expect(geminiResult?.installed).toBe(false);
      expect(geminiResult?.error).toBe('Adapter not available');
    });

    it('should mark outdated versions correctly', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.1',
              versionStatus: 'outdated',
              // No message - so fix will be set
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.77.0',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      const claudeResult = result.clis.find((c) => c.name === 'claude');
      expect(claudeResult?.versionStatus).toBe('outdated');
      expect(claudeResult?.fix).toBeDefined();
      expect(claudeResult?.fix).toContain('npm update');
    });

    it('should handle capacity check failures gracefully', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.77.0',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockRejectedValue(new Error('Capacity unavailable')),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      // Should still be healthy even without capacity info
      expect(result.allHealthy).toBe(true);
      expect(result.clis[0]?.capacity).toBeUndefined();
    });

    it('should set mcpClientReady based on Codex installation', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '2.0.76',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockResolvedValue({
              healthy: true,
              version: '0.22.5',
              versionStatus: 'supported',
              lastChecked: new Date(),
            }),
            getCapacity: vi.fn().mockResolvedValue({
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            }),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);

      const result = await runDoctor();

      expect(result.mcpClientReady).toBe(false);
    });
  });

  describe('printDoctorResults()', () => {
    it('should write output to stdout', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: DoctorResult = {
        clis: [
          {
            name: 'claude',
            installed: true,
            version: '2.0.76',
            versionStatus: 'supported',
            authenticated: true,
            authMethod: 'OAuth',
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
            authMethod: 'ADC',
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
            authMethod: 'OAuth',
          },
        ],
        mcpServerReady: true,
        mcpClientReady: true,
        allHealthy: true,
        timestamp: new Date(),
      };

      printDoctorResults(result);

      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Nexus Agents Doctor');
      expect(output).toContain('Claude CLI');
      expect(output).toContain('2.0.76');
      expect(output).toContain('All systems operational');

      writeSpy.mockRestore();
    });

    it('should show error message for uninstalled CLI', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: DoctorResult = {
        clis: [
          {
            name: 'claude',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            error: 'Not found in PATH',
            fix: 'npm install -g @anthropic-ai/claude-code',
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
          },
        ],
        mcpServerReady: true,
        mcpClientReady: true,
        allHealthy: false,
        timestamp: new Date(),
      };

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Not found in PATH');
      expect(output).toContain('npm install -g');
      expect(output).toContain('1 issue(s) found');

      writeSpy.mockRestore();
    });

    it('should show capacity information when available', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: DoctorResult = {
        clis: [
          {
            name: 'claude',
            installed: true,
            version: '2.0.76',
            versionStatus: 'supported',
            authenticated: true,
            capacity: {
              remainingTokens: 100000,
              remainingRequests: 100,
              resetTime: new Date(),
              utilizationPercent: 15,
              exhausted: false,
            },
          },
          {
            name: 'gemini',
            installed: true,
            version: '0.22.5',
            versionStatus: 'supported',
            authenticated: true,
          },
          {
            name: 'codex',
            installed: true,
            version: '0.77.0',
            versionStatus: 'supported',
            authenticated: true,
          },
        ],
        mcpServerReady: true,
        mcpClientReady: true,
        allHealthy: true,
        timestamp: new Date(),
      };

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('remaining');

      writeSpy.mockRestore();
    });

    it('should handle no installed CLIs gracefully', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: DoctorResult = {
        clis: [
          {
            name: 'claude',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            error: 'Not found',
          },
          {
            name: 'gemini',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            error: 'Not found',
          },
          {
            name: 'codex',
            installed: false,
            version: 'N/A',
            versionStatus: 'unsupported',
            authenticated: false,
            error: 'Not found',
          },
        ],
        mcpServerReady: true,
        mcpClientReady: false,
        allHealthy: false,
        timestamp: new Date(),
      };

      printDoctorResults(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('No CLIs installed');
      expect(output).toContain('3 issue(s) found');

      writeSpy.mockRestore();
    });
  });

  describe('doctorCommand()', () => {
    it('should return 0 when all healthy', async () => {
      const mockAdapter = {
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          version: '2.0.76',
          versionStatus: 'supported',
          lastChecked: new Date(),
        }),
        getCapacity: vi.fn().mockResolvedValue({
          remainingTokens: 100000,
          remainingRequests: 100,
          resetTime: new Date(),
          utilizationPercent: 15,
          exhausted: false,
        }),
      };

      const mockAdapters = new Map([
        ['claude', { ...mockAdapter, name: 'claude' }],
        ['gemini', { ...mockAdapter, name: 'gemini' }],
        ['codex', { ...mockAdapter, name: 'codex' }],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(0);
    });

    it('should return 1 when issues found', async () => {
      const mockAdapters = new Map([
        [
          'claude',
          {
            name: 'claude',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'gemini',
          {
            name: 'gemini',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
        [
          'codex',
          {
            name: 'codex',
            healthCheck: vi.fn().mockRejectedValue(new Error('ENOENT')),
            getCapacity: vi.fn(),
          },
        ],
      ]);

      vi.mocked(createAllAdapters).mockReturnValue(mockAdapters as never);
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = await doctorCommand();

      expect(exitCode).toBe(1);
    });
  });
});
